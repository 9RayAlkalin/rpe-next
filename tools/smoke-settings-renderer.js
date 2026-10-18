(async () => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const waitFor = async predicate => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error('设置测试等待超时');
  };
  const { showHotkeySettings } = await import('/src/ui/hotkey-settings.mjs');
  const { migratePreferences, shortcutAction } = await import('/src/core/preferences.mjs');
  const library = await import('/src/platform/library.mjs');
  const { createChart } = await import('/src/core/chart.mjs');
  const { readEditorPreferences } = await import('/src/platform/editor-preferences.mjs');
  const previousPreferences = await library.readPreferences();
  const { localPreferences } = await import('/src/platform/local-preferences.mjs');
  const previousEditor = localPreferences.getItem('rpe-next-editor-v1');
  const modal = document.querySelector('#modal');
  let saved;
  const projectId = `settings-smoke-${crypto.randomUUID()}`;
  try {
    document.querySelector('#home-new').click();
    const settingsIsland = Boolean(globalThis.rpenIslands?.settings);
    const dialogIsland = Boolean(globalThis.rpenIslands?.dialog);
    document.querySelector('#preferences').click();
    const settingsDialog = document.querySelector('#settings-modal');
    check(settingsDialog?.open, '设置面板未打开');
    for (const id of ['fps-unlimited', 'fps-limit', 'fps-limit-error', 'bar-width', 'editor-skin-settings', 'note-skin-settings', 'advanced-preferences']) check(document.querySelector(`#${id}`), `设置字段缺失：${id}`);
    const fpsLimit = document.querySelector('#fps-limit');
    fpsLimit.value = '90'; fpsLimit.dispatchEvent(new Event('input', { bubbles: true }));
    check(readEditorPreferences().fpsLimit === 90, '帧率上限未即时保存');
    fpsLimit.value = '2'; fpsLimit.dispatchEvent(new Event('input', { bubbles: true }));
    check(document.querySelector('#fps-limit-error').hidden === false && readEditorPreferences().fpsLimit === 90, '非法帧率未拦截或未提示');
    fpsLimit.value = '120'; fpsLimit.dispatchEvent(new Event('input', { bubbles: true }));
    check(document.querySelector('#fps-limit-error').hidden === true && readEditorPreferences().fpsLimit === 120, '帧率上限未恢复');
    const fpsUnlimited = document.querySelector('#fps-unlimited');
    fpsUnlimited.checked = true; fpsUnlimited.dispatchEvent(new Event('change', { bubbles: true }));
    check(fpsLimit.disabled && readEditorPreferences().fpsLimit === 0, '无上限未即时生效');
    fpsUnlimited.checked = false; fpsUnlimited.dispatchEvent(new Event('change', { bubbles: true }));
    check(!fpsLimit.disabled && readEditorPreferences().fpsLimit === 120, '取消无上限未恢复帧率上限');
    settingsDialog.close();
    check(!settingsDialog.open, '设置面板未关闭');
    const thickness = document.querySelector('#default-line-thickness'); thickness.value = '2.2'; thickness.dispatchEvent(new Event('change', { bubbles: true }));
    check(readEditorPreferences().lineScale === 2.2, '线宽未持久化');
    showHotkeySettings(migratePreferences(), async next => { await library.storePreferences(next); saved = next; });
    const apply = document.querySelector('#modal-apply');
    check(apply.textContent === '应用快捷键', '弹窗应用按钮文案被覆盖');
    check(!apply.disabled, '默认热键被误报为冲突');
    const input = document.querySelector('#hotkey-Save'); input.value = 'Ctrl+Z'; input.dispatchEvent(new Event('input'));
    check(apply.disabled && input.getAttribute('aria-invalid') === 'true', '重复快捷键未阻止应用');
    input.value = 'CTRL&&K'; input.dispatchEvent(new Event('input')); check(apply.disabled, '语法错误未阻止应用');
    document.querySelector('[data-action="Save"] button').click();
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }));
    check(input.value === 'Ctrl + K', '按键录入失败');
    check(!apply.disabled, '合法快捷键无法应用');
    document.querySelector('[data-action="AddDrag"] button:nth-of-type(2)').click();
    apply.click(); await waitFor(() => saved);
    const stored = await library.readPreferences();
    const reloaded = migratePreferences('{}', Object.entries(stored.originalHotkeys).map(([action, value]) => `${action} ${value}`).join('\n'));
    check(shortcutAction({ key: 'k', ctrlKey: true }, reloaded) === 'Save' && reloaded.hotkeys.AddDrag === '', '热键重载不一致');
    const search = document.querySelector('.hotkey-toolbar input[type=search]'); search.value = '保存谱面'; search.dispatchEvent(new Event('input'));
    check([...document.querySelectorAll('.hotkey-row')].filter(row => !row.hidden).length === 1, '快捷键搜索无效');
    search.value = ''; search.dispatchEvent(new Event('input'));
    const overflow = [...document.querySelectorAll('.hotkey-row')].some(row => row.scrollWidth > row.clientWidth + 2);
    check(!overflow, '快捷键行横向溢出');
    modal.close();

    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    const { showExportDialog } = await import('/src/ui/export-dialog.mjs');
    const exportChart = createChart();
    exportChart.globalEvents = { types: { message: { columns: { text: { events: [{}] } } } } };
    let exportCalls = 0;
    showExportDialog(exportChart, new Map(), 'chart.json', () => { exportCalls++; }, 'smoke');
    check(modal.open, '导出弹窗未打开');
    const exportApply = document.querySelector('#modal-apply');
    check(!exportApply.hidden && exportApply.textContent === '导出', '导出按钮状态错误');
    const formatSelect = document.querySelector('#modal-content select');
    check(formatSelect && formatSelect.value === 'next:pez', '导出格式默认值错误');
    const trajectory = document.querySelector('#modal-content fieldset');
    check(trajectory.hidden, 'Next 格式不应显示轨迹转换设置');
    formatSelect.value = 'rpe:json'; formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    check(!trajectory.hidden, 'RPE 格式应显示轨迹转换设置');
    const globalLabel = [...document.querySelectorAll('#modal-content label')].find(label => label.textContent.includes('全局事件'));
    check(globalLabel && !globalLabel.hidden, '全局事件移除选项未显示');
    exportApply.click();
    check(document.querySelector('#modal-error').textContent.includes('全局事件') && modal.open && exportCalls === 0, '全局事件校验未拦截导出');
    formatSelect.value = 'next:pez'; formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    check(trajectory.hidden, '切回 Next 格式未隐藏轨迹转换设置');
    document.querySelector('#modal .modal-actions button[value="cancel"]').click();
    check(!modal.open, '导出弹窗未关闭');

    const { migrationDialog } = await import('/src/ui/migration-dialog.mjs');
    await library.storeProject({ id: 'conflict-smoke', chart: createChart(), chartName: 'conflict-smoke.json', identifier: 'conflict-smoke', assets: [], updated: Date.now() });
    const migrationPlan = {
      sourceName: 'smoke-rpe',
      projects: [
        { path: 'resources/conflict-smoke/chart.json', directory: 'resources/conflict-smoke/', name: 'Conflicted', identifier: 'conflict-smoke', id: 'conflict-smoke', chart: exportChart, info: {} },
        { path: 'resources/broken/chart.json', directory: 'resources/broken/', name: 'Broken', error: '谱面解析失败', id: 'broken' },
      ],
      failures: [{ path: 'resources/other/bad.json', message: '读取失败' }],
      preferences: { report: { appliedHotkeys: [0, 0], appliedSettings: ['键位', '界面'], retainedHotkeys: [0], retainedSettings: [0] } },
    };
    let appliedPreferences = 0;
    migrationDialog(migrationPlan, () => { appliedPreferences++; });
    check(document.querySelector('#modal-title').textContent === '迁移原 RPE 文件夹', '迁移弹窗标题错误');
    check(document.querySelector('#modal-description').textContent.includes('发现 2 个谱面项目；1 项待处理'), '迁移弹窗描述错误');
    const configCheck = document.querySelector('#modal-content > label input[type=checkbox]');
    check(configCheck.checked && configCheck.parentElement.textContent.includes('迁移热键及设置'), '迁移设置选项状态错误');
    const choiceChecks = [...document.querySelectorAll('#modal-content label.choice input')];
    check(choiceChecks.length === 2 && choiceChecks[0].checked && !choiceChecks[0].disabled, '迁移项目默认选择错误');
    check(choiceChecks[1].disabled && choiceChecks[1].parentElement.textContent.includes(' · 谱面解析失败'), '错误项目未禁用');
    const summaryText = document.querySelectorAll('#modal-content > p')[0].textContent;
    check(summaryText.includes('可应用：2 项热键，键位、界面') && summaryText.includes('其余 1 项热键、1 项设置'), '迁移设置摘要错误');
    const migrateButton = document.querySelector('#modal-content > button.primary');
    check(migrateButton.textContent === '迁移选中项目' && !migrateButton.disabled, '迁移按钮状态错误');
    configCheck.checked = false; configCheck.dispatchEvent(new Event('change'));
    migrateButton.click();
    await waitFor(() => document.querySelector('#modal-content > section'));
    const conflictSection = document.querySelector('#modal-content > section');
    check(conflictSection.querySelector('h3').textContent === '1 个谱面标识已存在' && conflictSection.querySelector('details').open, '冲突提示未出现');
    check(conflictSection.querySelector('li').textContent === 'conflict-smoke · Conflicted', '冲突列表内容错误');
    check(document.activeElement === conflictSection.querySelector('button'), '冲突按钮未聚焦');
    check(migrateButton.disabled && choiceChecks[0].disabled && configCheck.disabled, '迁移进行中控件未禁用');
    [...conflictSection.querySelectorAll('button')].find(button => button.textContent === '取消迁移').click();
    await waitFor(() => !document.querySelector('#modal-content > section'));
    const progressText = () => document.querySelectorAll('#modal-content > p')[1].textContent;
    check(progressText() === '已取消，尚未写入项目或设置。' && !migrateButton.disabled && !configCheck.disabled, '冲突取消未恢复状态');
    check(!choiceChecks[0].disabled && choiceChecks[1].disabled, '冲突取消未恢复项目选择');
    migrateButton.click();
    await waitFor(() => document.querySelector('#modal-content > section'));
    [...document.querySelectorAll('#modal-content > section button')].find(button => button.textContent === '跳过重复谱面').click();
    await waitFor(() => migrateButton.textContent === '下载迁移报告');
    check(progressText() === '已迁移 0 个项目，1 项未迁移，跳过 1 项。关闭后点击“谱面库”打开；数据保存在当前浏览器，建议另导出 PEZ。', '跳过完成状态错误');
    check(appliedPreferences === 0 && (await library.listProjects()).find(item => item.id === 'conflict-smoke')?.identifier === 'conflict-smoke', '设置被误应用或冲突项目被覆盖');
    document.querySelector('#modal .modal-actions button[value="cancel"]').click();
    check(!modal.open, '迁移弹窗未关闭');

    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32; canvas.getContext('2d').fillRect(0, 0, 32, 32);
    const cover = new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve))).arrayBuffer());
    const chart = createChart(); chart.META.background = 'cover.png';
    const project = { id: projectId, chart, chartName: 'chart.json', assets: [['cover.png', cover], ['audio.bin', new Uint8Array(8 * 1024 * 1024)]], updated: Date.now() };
    let responsiveTicks = 0;
    const timer = setInterval(() => { responsiveTicks++; }, 5);
    try { await library.storeProject(project); } finally { clearInterval(timer); }
    const restored = await library.readProject(projectId);
    check(restored.assets[1][1].byteLength === 8 * 1024 * 1024 && project.assets[1][1].byteLength === 8 * 1024 * 1024, '后台保存未保留媒体或分离了活动缓冲区');
    const summary = (await library.listProjects()).find(item => item.id === projectId);
    check(summary.thumbnail instanceof Blob && summary.thumbnail.size > 0, '后台缩略图未保存');
    check(responsiveTicks > 0, '保存期间事件循环未响应');
    let failed = false;
    try { await library.storeProject({ ...project, chart: { ...chart, judgeLineList: 'invalid' } }); } catch { failed = true; }
    check(failed, '无效存档应失败');
    check((await library.readProject(projectId)).chart.META.background === 'cover.png', '失败写入破坏了旧存档');
    const competing = await Promise.allSettled([
      library.storeProject({ ...project, chart: { ...chart, META: { ...chart.META, name: 'older' } } }),
      library.storeProject({ ...project, assets: [], chart: { ...chart, META: { ...chart.META, name: 'newer' } } }),
    ]);
    check(competing[0].status === 'fulfilled' && competing[1].status === 'rejected' && competing[1].reason.name === 'ProjectConflictError', '旧快照未被版本检测阻止');
    const latest = await library.readProject(projectId);
    await library.storeProject({ ...latest, assets: [], chart: { ...chart, META: { ...chart.META, name: 'newer' } } });
    check((await library.readProject(projectId)).chart.META.name === 'newer', '基于最新版本的后续保存失败');

    document.querySelector('#history-panel').click();
    await tick();
    const historyButtons = [...document.querySelectorAll('#history-results > button')];
    check(historyButtons.length >= 1 && historyButtons[0].textContent === '● 0 · 当前可回退的起点' && historyButtons[0].classList.contains('active'), '编辑历史面板未渲染');
    document.querySelector('#history-close').click();
    document.querySelector('#diagnose').click();
    await tick();
    const diagnoseGroupSummaries = () => [...document.querySelectorAll('#diagnose-results > details.diagnose-group > summary')].map(node => node.textContent);
    const summaries = diagnoseGroupSummaries();
    check(summaries.length === 3 && ['错误', '警告', '提示'].every((title, index) => summaries[index].startsWith(title)), '谱面检查分组错误');
    const diagnoseEmpty = document.querySelector('#diagnose-results > p.hint');
    check(!diagnoseEmpty || diagnoseEmpty.textContent === '未发现当前检查规则覆盖的问题。', '谱面检查空提示错误');
    document.querySelector('#diagnose-show-low').checked = false; document.querySelector('#diagnose-show-low').dispatchEvent(new Event('change'));
    await tick();
    check(diagnoseGroupSummaries()[2] === '提示（0）', '低级问题过滤无效');
    document.querySelector('#diagnose-close').click();

    return { hotkeys: true, thickness: true, fpsValidation: true, settingsIsland, dialogIsland, exportIsland: Boolean(globalThis.rpenIslands?.export), exportDialog: true, migrationIsland: Boolean(globalThis.rpenIslands?.migration), migrationDialog: true, historyIsland: Boolean(globalThis.rpenIslands?.history), historyPanel: true, diagnoseIsland: Boolean(globalThis.rpenIslands?.diagnose), diagnosePanel: true, backgroundSave: true, atomicRollback: true, savedMediaBytes: restored.assets[1][1].byteLength, responsiveTicks };
  } finally {
    if (modal.open) modal.close();
    await library.storePreferences(previousPreferences ?? migratePreferences());
    if (previousEditor === null) localPreferences.removeItem('rpe-next-editor-v1'); else localPreferences.setItem('rpe-next-editor-v1', previousEditor);
    const { nativeStorage } = await import('/src/platform/native.mjs');
    if (nativeStorage) {
      const savedProject = await library.readProject(projectId);
      if (savedProject) { await library.deleteProject(projectId, savedProject.storageRevision); const head = await library.readProjectRevision(projectId); await nativeStorage.call('purge', projectId, head.revision); }
      const conflictProject = await library.readProject('conflict-smoke');
      if (conflictProject) { await library.deleteProject('conflict-smoke', conflictProject.storageRevision); const head = await library.readProjectRevision('conflict-smoke'); await nativeStorage.call('purge', 'conflict-smoke', head.revision); }
    } else await new Promise((resolve, reject) => {
      const request = indexedDB.open('rpe-next-library'); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const connection = request.result; const transaction = connection.transaction(['projects', 'summaries'], 'readwrite');
        transaction.objectStore('projects').delete(projectId); transaction.objectStore('summaries').delete(projectId);
        transaction.objectStore('projects').delete('conflict-smoke'); transaction.objectStore('summaries').delete('conflict-smoke');
        transaction.oncomplete = () => { connection.close(); resolve(); }; transaction.onabort = () => { connection.close(); reject(transaction.error); };
      };
    });
  }
})()
