import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, createEvent, createLine, createNote, diagnose, parseChart, serializeChart } from '../src/core/chart.mjs';
import { applyMergeResolutions, assertMergedLineParents, bytesToBase64, diffCharts, diffTrees, graphLayout, mergeCharts, resolveChartMerge } from '../src/core/chart-vcs.mjs';
import { deleteLine, reorderLine, setLineParent } from '../src/application/line-commands.mjs';
import { ChartRepository } from '../src/application/chart-vcs.mjs';
import { createMemoryVersionStore } from '../src/platform/version-store.mjs';

const author = { name: 'Tester', email: 'tester@example.com' };
const chartNamed = (name, notes = []) => {
  const chart = createChart();
  chart.META.name = name;
  chart.judgeLineList[0].notes = notes;
  chart.judgeLineList[0].numOfNotes = notes.length;
  return chart;
};
const snapshot = (chart, assets = new Map(), folders = []) => ({ chart, assets, folders, chartName: 'chart.json' });
const makeRepo = (store = createMemoryVersionStore(), id = 'repo-1') => {
  let clock = 1_700_000_000_000;
  return new ChartRepository(store, id, { now: () => clock++ });
};
const initial = async (repo, chart) => {
  await repo.init();
  await repo.stage(snapshot(chart));
  return repo.commit({ message: '初始版本', author });
};

test('谱面差异统计元信息、音符与事件', () => {
  const before = chartNamed('A', [createNote(1, 1, 0)]);
  const after = chartNamed('B', [createNote(1, 1, 0), createNote(3, 2, 120)]);
  after.judgeLineList[0].eventLayers[0].moveXEvents[0].end = 50;
  after.markers = [{ time: 12.5, name: '副歌' }];
  const diff = diffCharts(before, after);
  assert.equal(diff.meta.length, 1);
  assert.equal(diff.notes.added, 1);
  assert.equal(diff.events.modified, 1);
  assert.equal(diff.other.length, 1);
  assert.equal(diff.other[0].key, 'markers');
  assert.ok(diff.total >= 4);
  assert.ok(diff.summary.length >= 3);
});

test('三路合并按音符标识组合双方新增', () => {
  const base = chartNamed('same');
  const ours = chartNamed('same', [createNote(1, 1, 0)]);
  const theirs = chartNamed('same', [createNote(4, 2, 120)]);
  const result = mergeCharts(base, ours, theirs);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.chart.META.name, 'same');
  assert.equal(result.chart.judgeLineList[0].notes.length, 2);
  const beats = result.chart.judgeLineList[0].notes.map(note => note.startTime[0] + note.startTime[1] / note.startTime[2]);
  assert.deepEqual(beats, [...beats].sort((left, right) => left - right));
});

test('合并判定线删除与改名后重映射父线，避免自引用', () => {
  const line = (name, father = -1) => {
    const value = structuredClone(createChart().judgeLineList[0]);
    value.Name = name; value.father = father; value.notes = [];
    return value;
  };
  const base = createChart();
  base.judgeLineList = [line('A'), line('B', 0), line('C', 1)];
  const renamed = structuredClone(base);
  renamed.judgeLineList[1].Name = 'B2';
  const deleted = deleteLine(base, 0);
  const result = mergeCharts(base, deleted, renamed);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.chart.judgeLineList.map(value => value.Name), ['B2', 'C']);
  assert.equal(result.chart.judgeLineList[0].father, -1);
  assert.equal(result.chart.judgeLineList[1].father, 0);
  assert.ok(result.chart.judgeLineList.every((value, index) => value.father === -1 || value.father < index));
});

test('重排行与另一分支修改父线按身份合并，双方交换时也保留两边的修改', () => {
  const base = createChart(); base.judgeLineList = [createLine('A'), createLine('B'), createLine('C')]; base.judgeLineList[2].father = 1;
  const reordered = reorderLine(base, 0, 1), reparented = setLineParent(base, 2, 0);
  for (const [ours, theirs] of [[reordered, reparented], [reparented, reordered]]) {
    const before = [structuredClone(base), structuredClone(ours), structuredClone(theirs)];
    const result = mergeCharts(base, ours, theirs);
    assert.deepEqual(result.conflicts, []); assert.deepEqual(result.chart.judgeLineList.map(line => line.Name), ['B', 'A', 'C']);
    assert.equal(result.chart.judgeLineList[2].father, 1); assert.doesNotThrow(() => assertMergedLineParents(result.chart));
    assert.deepEqual([base, ours, theirs], before);
  }
});

test('名称未改时不把内容相同的不同判定线认成一条线', () => {
  const base = createChart(); base.judgeLineList = [createLine('A'), createLine('B')]; base.judgeLineList[1].eventLayers[0].moveXEvents = [createEvent(100)];
  const ours = structuredClone(base), theirs = structuredClone(base);
  ours.judgeLineList[0].eventLayers[0].moveXEvents = [createEvent(100)]; ours.judgeLineList[1].eventLayers[0].moveXEvents = [createEvent(200)];
  theirs.judgeLineList[0].eventLayers[0].moveYEvents = [createEvent(50)];
  const result = mergeCharts(base, ours, theirs);
  assert.deepEqual(result.conflicts, []); assert.deepEqual(result.chart.judgeLineList.map(line => line.Name), ['A', 'B']);
  assert.equal(result.chart.judgeLineList[0].eventLayers[0].moveXEvents[0].start, 100);
  assert.equal(result.chart.judgeLineList[0].eventLayers[0].moveYEvents[0].start, 50);
  assert.equal(result.chart.judgeLineList[1].eventLayers[0].moveXEvents[0].start, 200);
});

test('选择删除有冲突的父线后重新编号，其余子线及 shader 引用一起更新', () => {
  const base = createChart(); base.judgeLineList = [createLine('A'), createLine('B'), createLine('C')];
  base.judgeLineList.forEach((line, index) => { line.eventLayers[0].moveXEvents = [createEvent(index * 100)]; });
  base.effects = [{ shader: 'grayscale', line: 2, start: [0, 0, 1], end: [4, 0, 1] }];
  const ours = structuredClone(base); ours.judgeLineList[1].Name = 'B changed'; ours.judgeLineList[2].father = 1;
  const theirs = deleteLine(structuredClone(base), 1); theirs.META.composer = 'theirs';
  const merged = mergeCharts(base, ours, theirs), choices = merged.conflicts.map(() => 'theirs');
  assert.equal(merged.conflicts.length, 1);
  const resolved = resolveChartMerge(base, ours, theirs, choices);
  assert.deepEqual(resolved.judgeLineList.map(line => line.Name), ['A', 'C']); assert.equal(resolved.judgeLineList[1].father, -1);
  assert.equal(resolved.effects[0].line, 1); assert.equal(resolved.META.composer, 'theirs');
  assert.deepEqual(diagnose(resolved).filter(issue => issue.path === 'father'), []);
  const direct = applyMergeResolutions(merged.chart, merged.conflicts, choices);
  assert.equal(direct.judgeLineList[1].father, -1); assert.equal(direct.effects[0].line, 1);
});

test('父线冲突采用用户选择，索引在冲突删除和重排后才换算', () => {
  const base = createChart(); base.judgeLineList = [createLine('A'), createLine('B'), createLine('C')];
  const ours = setLineParent(reorderLine(base, 0, 1), 2, 0), theirs = setLineParent(base, 2, 0);
  const merged = mergeCharts(base, ours, theirs); assert.equal(merged.conflicts.length, 1); assert.ok(merged.conflicts[0].path.endsWith('.father'));
  for (const side of ['ours', 'theirs']) {
    const resolved = resolveChartMerge(base, ours, theirs, [side]);
    const child = resolved.judgeLineList.find(line => line.Name === 'C');
    assert.equal(resolved.judgeLineList[child.father].Name, side === 'ours' ? 'B' : 'A');
  }
});

test('不相容重排显式产生顺序冲突，选任一顺序后父线仍有效', () => {
  const base = createChart(); base.judgeLineList = [createLine('A'), createLine('B'), createLine('C')]; base.judgeLineList[2].father = 0;
  const ours = reorderLine(base, 0, 1), theirs = reorderLine(base, 2, 0);
  const result = mergeCharts(base, ours, theirs); assert.equal(result.conflicts.length, 1); assert.match(result.conflicts[0].path, /排列顺序/);
  for (const side of ['ours', 'theirs']) {
    const resolved = resolveChartMerge(base, ours, theirs, [side]), chosen = side === 'ours' ? ours : theirs;
    assert.deepEqual(resolved.judgeLineList.map(line => line.Name), chosen.judgeLineList.map(line => line.Name));
    const child = resolved.judgeLineList.find(line => line.Name === 'C'); assert.equal(resolved.judgeLineList[child.father].Name, 'A');
  }
});

test('双方新增不同名同内容的线保留两条，重名且无法识别时不猜测身份', () => {
  const base = createChart(), ours = structuredClone(base), theirs = structuredClone(base);
  ours.judgeLineList.push(createLine('new A')); theirs.judgeLineList.push(createLine('new B'));
  const merged = mergeCharts(base, ours, theirs); assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(new Set(merged.chart.judgeLineList.map(line => line.Name)), new Set(['Line 1', 'new A', 'new B']));
  const ambiguous = createChart(); ambiguous.judgeLineList = [createLine('same'), createLine('same')];
  const changed = structuredClone(ambiguous), other = structuredClone(ambiguous);
  changed.judgeLineList[0].notes = [createNote(1, 1, 0)]; other.judgeLineList[1].notes = [createNote(3, 2, 0)];
  const result = mergeCharts(ambiguous, changed, other); assert.equal(result.conflicts.length, 1); assert.deepEqual(result.conflicts[0].pathArray, []);
  assert.deepEqual(resolveChartMerge(ambiguous, changed, other, ['theirs']), other);
});

test('根级 shader 绑定随重排一起合并，删除绑定线不会将效果错绑到别的线', () => {
  const base = createChart(); base.judgeLineList.push(createLine('B'));
  base.effects = [{ shader: 'grayscale', line: 0, start: [0, 0, 1], end: [4, 0, 1], global: true }];
  const ours = reorderLine(base, 0, 1), theirs = structuredClone(base); theirs.effects[0].global = false;
  const result = mergeCharts(base, ours, theirs); assert.deepEqual(result.conflicts, []);
  assert.equal(result.chart.effects[0].line, 1); assert.equal(result.chart.effects[0].global, false);
});

test('提交、状态与历史保持线性', async () => {
  const repo = makeRepo();
  await initial(repo, chartNamed('A'));
  let status = await repo.status(snapshot(chartNamed('A')));
  assert.equal(status.clean, true);
  const changed = chartNamed('B', [createNote(1, 4, 0)]);
  status = await repo.status(snapshot(changed));
  assert.equal(status.clean, false);
  assert.equal(status.unstaged.chartChanged, true);
  await repo.stage(snapshot(changed));
  const committed = await repo.commit({ message: '第二版', author });
  assert.equal(committed.commit.parents.length, 1);
  const log = await repo.log();
  assert.equal(log.length, 2);
  assert.equal(log[0].message, '第二版');
  assert.equal((await repo.headSnapshot()).chart.META.name, 'B');
});

test('分支创建、检出与合并快进', async () => {
  const repo = makeRepo();
  await initial(repo, chartNamed('A'));
  await repo.createBranch('feature');
  const checkedOut = await repo.checkoutBranch('feature', { snapshot: snapshot(chartNamed('A')) });
  assert.equal(checkedOut.snapshot.chart.META.name, 'A');
  const featureChart = chartNamed('feature');
  await repo.stage(snapshot(featureChart));
  const featureCommit = await repo.commit({ message: '功能', author });
  await repo.checkoutBranch('main', { snapshot: snapshot(featureChart) });
  assert.equal((await repo.headSnapshot()).chart.META.name, 'A');
  const merged = await repo.merge('feature', { snapshot: snapshot(chartNamed('A')) });
  assert.equal(merged.type, 'fast-forward');
  assert.equal(merged.commit.id, featureCommit.commit.id);
  assert.equal((await repo.headSnapshot()).chart.META.name, 'feature');
});

test('分叉合并与冲突解决生成双亲提交', async () => {
  const repo = makeRepo();
  await initial(repo, chartNamed('base'));
  await repo.createBranch('feature');
  await repo.checkoutBranch('feature', { snapshot: snapshot(chartNamed('base')) });
  const featureChart = chartNamed('feature');
  await repo.stage(snapshot(featureChart));
  await repo.commit({ message: '功能改名', author });
  await repo.checkoutBranch('main', { snapshot: snapshot(featureChart) });
  const mainChart = chartNamed('base');
  mainChart.META.composer = 'main-composer';
  await repo.stage(snapshot(mainChart));
  await repo.commit({ message: '主线补充', author });
  const result = await repo.merge('feature', { snapshot: snapshot(mainChart) });
  assert.equal(result.type, 'merge');
  assert.equal(result.commit.parents.length, 2);
  const merged = await repo.headSnapshot();
  assert.equal(merged.chart.META.name, 'feature');
  assert.equal(merged.chart.META.composer, 'main-composer');
});

test('合并冲突可选择对方并完成合并', async () => {
  const repo = makeRepo();
  await initial(repo, chartNamed('base'));
  await repo.createBranch('feature');
  await repo.checkoutBranch('feature', { snapshot: snapshot(chartNamed('base')) });
  const featureChart = chartNamed('feature');
  await repo.stage(snapshot(featureChart));
  await repo.commit({ message: '功能改名', author });
  await repo.checkoutBranch('main', { snapshot: snapshot(featureChart) });
  const mainChart = chartNamed('main');
  await repo.stage(snapshot(mainChart));
  await repo.commit({ message: '主线改名', author });
  const result = await repo.merge('feature', { snapshot: snapshot(mainChart) });
  assert.equal(result.type, 'conflict');
  assert.ok(result.conflicts.some(conflict => conflict.path === 'META.name'));
  const state = await repo.read();
  const choices = state.merge.conflicts.map(conflict => conflict.path === 'META.name' ? 'theirs' : 'ours');
  const resolved = await repo.resolveMerge(choices);
  assert.equal(resolved.snapshot.chart.META.name, 'feature');
  assert.equal(resolved.commit.parents.length, 2);
});

test('版本库解决删线冲突后提交有效父线与最终线序，不将临时身份写入谱面', async () => {
  const repo = makeRepo(), base = createChart(); base.judgeLineList = [createLine('A'), createLine('B'), createLine('C')];
  base.judgeLineList.forEach((line, index) => { line.eventLayers[0].moveXEvents = [createEvent(index * 100)]; });
  base.modExample = { literal: 'base:0', settings: { first: 1, second: 2 } };
  await initial(repo, base); await repo.createBranch('delete'); await repo.checkoutBranch('delete');
  const theirs = deleteLine(structuredClone(base), 1); theirs.modExample.settings.second = 3;
  await repo.stage(snapshot(theirs)); await repo.commit({ message: '删除 B' }); await repo.checkoutBranch('main');
  const ours = structuredClone(base); ours.judgeLineList[1].Name = 'B changed'; ours.judgeLineList[2].father = 1; ours.modExample.settings.first = 4;
  await repo.stage(snapshot(ours)); await repo.commit({ message: '修改父线' });
  const result = await repo.merge('delete', { snapshot: snapshot(ours) }); assert.equal(result.type, 'conflict');
  const resolved = await repo.resolveMerge(result.conflicts.map(() => 'theirs'));
  assert.deepEqual(resolved.snapshot.chart.judgeLineList.map(line => line.Name), ['A', 'C']);
  assert.equal(resolved.snapshot.chart.judgeLineList[1].father, -1); assert.equal(resolved.commit.parents.length, 2);
  assert.deepEqual(resolved.snapshot.chart.modExample, { literal: 'base:0', settings: { first: 4, second: 3 } });
  const tree = await repo.readTree(resolved.commit.tree), blob = await repo.readBlob(tree.chart);
  const stored = JSON.parse(new TextDecoder().decode(blob.bytes));
  assert.ok(Array.isArray(stored.judgeLineList)); assert.ok(stored.judgeLineList.every(line => Number.isInteger(line.father)));
  assert.deepEqual(stored.modExample, resolved.snapshot.chart.modExample);
});

test('分支各自合法但合并产生父线环时阻止提交，原 HEAD 和快照仍可读取', async () => {
  const repo = makeRepo(), base = createChart(); base.judgeLineList = [createLine('A'), createLine('B')];
  await initial(repo, base); await repo.createBranch('feature'); await repo.checkoutBranch('feature');
  const theirs = setLineParent(base, 1, 0); await repo.stage(snapshot(theirs)); await repo.commit({ message: 'B 跟随 A' });
  await repo.checkoutBranch('main'); const ours = setLineParent(base, 0, 1);
  await repo.stage(snapshot(ours)); const previous = await repo.commit({ message: 'A 跟随 B' });
  await assert.rejects(repo.merge('feature', { snapshot: snapshot(ours) }), /父线关系形成循环/);
  assert.equal((await repo.read()).branches.main, previous.commit.id); assert.deepEqual((await repo.headSnapshot()).chart, ours);
});

test('冲突选择仍违反谱面校验时保留合并状态，允许取消并恢复原分支', async () => {
  const repo = makeRepo(), base = createChart(); base.judgeLineList = [createLine('A'), createLine('B')];
  await initial(repo, base); await repo.createBranch('feature'); await repo.checkoutBranch('feature');
  const theirs = structuredClone(setLineParent(base, 1, 0)); theirs.META.name = 'theirs';
  await repo.stage(snapshot(theirs)); await repo.commit({ message: 'feature' }); await repo.checkoutBranch('main');
  const ours = structuredClone(setLineParent(base, 0, 1)); ours.META.name = 'ours';
  await repo.stage(snapshot(ours)); const previous = await repo.commit({ message: 'main' });
  const merging = await repo.merge('feature', { snapshot: snapshot(ours) }); assert.equal(merging.type, 'conflict');
  await assert.rejects(repo.resolveMerge(merging.conflicts.map(() => 'theirs')), /父线关系形成循环/);
  assert.equal((await repo.read()).branches.main, previous.commit.id); assert.ok((await repo.read()).merge);
  assert.deepEqual((await repo.abortMerge()).snapshot.chart, ours);
});

test('储藏保存工作区并可在 HEAD 上重新应用', async () => {
  const repo = makeRepo();
  await initial(repo, chartNamed('A'));
  const changed = chartNamed('B', [createNote(1, 3, 10)]);
  const pushed = await repo.stashPush(snapshot(changed), '临时改动');
  assert.equal(pushed.snapshot.chart.META.name, 'A');
  assert.equal((await repo.read()).stash.length, 1);
  const applied = await repo.stashApply(0, snapshot(chartNamed('A')));
  assert.equal(applied.snapshot.chart.META.name, 'B');
  assert.equal(applied.snapshot.chart.judgeLineList[0].notes.length, 1);
  await repo.stashPop(0, snapshot(chartNamed('A')));
  assert.equal((await repo.read()).stash.length, 0);
});

test('硬重置恢复目标版本，软重置保留工作区', async () => {
  const repo = makeRepo();
  const first = await initial(repo, chartNamed('A'));
  const secondChart = chartNamed('B');
  await repo.stage(snapshot(secondChart));
  const second = await repo.commit({ message: 'B', author });
  const hard = await repo.reset(first.commit.id, 'hard');
  assert.equal(hard.snapshot.chart.META.name, 'A');
  assert.equal((await repo.read()).branches.main, first.commit.id);
  const soft = await repo.reset(second.commit.id, 'soft');
  assert.equal(soft.snapshot, null);
  assert.equal((await repo.read()).branches.main, second.commit.id);
});

test('标签与仓库包导入导出', async () => {
  const store = createMemoryVersionStore();
  const repo = makeRepo(store);
  const first = await initial(repo, chartNamed('A'));
  await repo.createTag('v1', first.commit.id, '第一版');
  const bundle = await repo.exportBundle();
  assert.equal(bundle.format, 'rpe-next-chart-vcs');
  assert.ok(bundle.blobs.length >= 1);
  const target = makeRepo(store, 'repo-2');
  await target.init();
  const imported = await target.importBundle(bundle);
  assert.equal(imported.commits, 1);
  const refs = await target.read();
  assert.equal(refs.branches.main, imported.repo.branches.main);
  assert.ok(Object.hasOwn(imported.repo.tags, 'v1'));
  const checkedOut = await target.checkoutBranch('main', { snapshot: null });
  assert.equal(checkedOut.snapshot.chart.META.name, 'A');
});

test('导入仓库包校验树对象哈希，不覆盖已有共享对象', async () => {
  const store = createMemoryVersionStore();
  const source = makeRepo(store, 'source');
  await initial(source, chartNamed('A'));
  const bundle = await source.exportBundle();
  const tree = bundle.trees[0], original = structuredClone(tree);
  tree.chartName = 'tampered.json';
  const target = makeRepo(store, 'target');
  await target.init();
  await assert.rejects(target.importBundle(bundle), /树对象校验失败/);
  assert.deepEqual(await store.get('trees', original.id), original);
  assert.equal((await source.headSnapshot()).chart.META.name, 'A');
});

test('导入仓库包校验对象哈希，不接受被替换的素材字节', async () => {
  const store = createMemoryVersionStore();
  const source = makeRepo(store, 'source');
  await initial(source, chartNamed('A'));
  const bundle = await source.exportBundle();
  const [id] = bundle.blobs[0];
  bundle.blobs[0] = [id, bytesToBase64(new TextEncoder().encode('tampered'))];
  const target = makeRepo(store, 'target');
  await target.init();
  await assert.rejects(target.importBundle(bundle), /对象校验失败/);
});

test('谱面差异统计判定线、BPM、事件与其他数据', () => {
  const before = chartNamed('same', [createNote(1, 1, 0)]);
  const after = structuredClone(before);
  after.META.name = 'changed';
  after.BPMList[0].bpm = 150;
  after.BPMList.push({ startTime: [4, 0, 1], bpm: 180 });
  after.judgeLineList[0].notes.push(createNote(4, 2, 80));
  after.judgeLineList[0].notes[0].speed = 2;
  after.judgeLineList[0].eventLayers[0].moveXEvents[0].end = 100;
  const alpha = structuredClone(after.judgeLineList[0].eventLayers[0].alphaEvents[0]);
  alpha.startTime = [2, 0, 1];
  alpha.endTime = [3, 0, 1];
  alpha.start = 0;
  alpha.end = 255;
  after.judgeLineList[0].eventLayers[0].alphaEvents.push(alpha);
  const second = structuredClone(before.judgeLineList[0]);
  second.Name = 'second';
  second.notes = [];
  after.judgeLineList.push(second);
  after.markers = [{ time: 2.5, name: '副歌' }];
  const diff = diffCharts(before, after);
  assert.equal(diff.meta.length, 1);
  assert.equal(diff.bpm.modified, 1);
  assert.equal(diff.bpm.added, 1);
  assert.equal(diff.lines.added, 1);
  assert.equal(diff.notes.added, 1);
  assert.equal(diff.events.modified, 1);
  assert.equal(diff.other.length, 1);
  assert.equal(diff.other[0].key, 'markers');
  assert.ok(diff.details.some(item => item.text.includes('曲名')));
  assert.ok(diff.details.some(item => item.text.includes('新增判定线「second」')));
  assert.ok(diff.details.some(item => item.text.includes('新增 BPM：180')));
  assert.ok(diff.details.some(item => item.text.includes('BPM @ 0.000 拍：120 → 150')));
  assert.ok(diff.details.some(item => item.text.includes('新增') && item.text.includes('Drag')));
  assert.ok(diff.details.some(item => item.text.includes('修改') && item.text.includes('速度')));
  assert.ok(diff.details.some(item => item.text.includes('新增') && item.text.includes('alphaEvents')));
  assert.ok(diff.details.some(item => item.text.includes('标记点')));
  assert.equal(diff.detailsTruncated, false);
  assert.ok(diff.total >= 7);
});

test('树差异统计谱面、文件名、文件夹与素材增删改', () => {
  const before = {
    id: 't1', chart: 'chart-1', chartName: 'chart.json', folders: ['images'],
    assets: [{ path: 'images/bg.png', blob: 'blob-1', size: 10 }, { path: 'images/old.png', blob: 'blob-old', size: 4 }]
  };
  const after = {
    id: 't2', chart: 'chart-2', chartName: 'chart-c.json', folders: ['images', 'audio'],
    assets: [{ path: 'images/bg.png', blob: 'blob-2', size: 12 }, { path: 'audio/song.ogg', blob: 'blob-3', size: 20 }]
  };
  const forward = diffTrees(before, after);
  assert.equal(forward.chartChanged, true);
  assert.equal(forward.chartNameChanged, true);
  assert.equal(forward.foldersChanged, true);
  assert.deepEqual(forward.added.map(entry => entry.path), ['audio/song.ogg']);
  assert.deepEqual(forward.modified.map(entry => entry.path), ['images/bg.png']);
  assert.deepEqual(forward.deleted.map(entry => entry.path), ['images/old.png']);
  assert.equal(forward.total, 6);
  const reverse = diffTrees(after, before);
  assert.deepEqual(reverse.added.map(entry => entry.path), ['images/old.png']);
  assert.deepEqual(reverse.deleted.map(entry => entry.path), ['audio/song.ogg']);
  assert.equal(reverse.modified.length, 1);
});

test('工作区差异同时包含谱面与素材变化', async () => {
  const repo = makeRepo();
  await initial(repo, chartNamed('A'));
  const chart = chartNamed('B', [createNote(1, 1, 0)]);
  const assets = new Map([['images/bg.png', new TextEncoder().encode('bg')]]);
  const diff = await repo.workingDiff(snapshot(chart, assets, ['images']));
  assert.equal(diff.treeDiff.chartChanged, true);
  assert.equal(diff.treeDiff.added.length, 1);
  assert.equal(diff.treeDiff.added[0].path, 'images/bg.png');
  assert.equal(diff.treeDiff.foldersChanged, true);
  assert.equal(diff.chartDiff.meta.length, 1);
  assert.equal(diff.chartDiff.notes.added, 1);
});

test('图表布局为线性历史分配单车道并为合并分配双车道', () => {
  const commits = [
    { id: 'm', parents: ['a', 'b'], timestamp: 30 },
    { id: 'a', parents: ['root'], timestamp: 20 },
    { id: 'b', parents: ['root'], timestamp: 10 },
    { id: 'root', parents: [], timestamp: 1 }
  ];
  const layout = graphLayout(commits, { branches: { main: 'm' }, tags: {}, head: { type: 'branch', name: 'main' } });
  assert.equal(layout.rowCount, 4);
  const merge = layout.rows.find(row => row.id === 'm');
  const root = layout.rows.find(row => row.id === 'root');
  assert.equal(merge.lane, 0);
  assert.equal(root.lane, 0);
  assert.equal(root.incomingLanes.length, 1);
  assert.equal(merge.outputSwimlanes.map(node => node.id).join(','), 'a,b');
  assert.equal(layout.rows[1].id, 'b');
  assert.equal(layout.rows[1].lane, 1);
  assert.equal(layout.rows[2].id, 'a');
  assert.ok(layout.laneCount >= 2);
});

test('分支标签只改变节点颜色，不改变泳道颜色', () => {
  const commits = [
    { id: 'root', parents: [], timestamp: 1 },
    { id: 'a', parents: ['root'], timestamp: 2 },
    { id: 'b', parents: ['a'], timestamp: 3 }
  ];
  const layout = graphLayout(commits, {
    branches: { main: 'b', feature: 'a' }, tags: {},
    head: { type: 'branch', name: 'main' }
  });
  const rows = new Map(layout.rows.map(row => [row.id, row]));
  const a = rows.get('a');
  assert.equal(a.outputSwimlanes[0].id, 'root');
  assert.equal(a.outputSwimlanes[0].color, a.inputSwimlanes[0].color);
  assert.notEqual(a.circleColor, a.inputSwimlanes[0].color);
  assert.equal(rows.get('root').inputSwimlanes[0].color, a.outputSwimlanes[0].color);
});

test('复杂图谱：多分支、交叉合并、章鱼合并与游离历史均保持拓扑顺序', () => {
  const commits = [
    { id: 'root', parents: [], timestamp: 1 },
    { id: 'a1', parents: ['root'], timestamp: 2 },
    { id: 'a2', parents: ['a1'], timestamp: 3 },
    { id: 'b1', parents: ['root'], timestamp: 4 },
    { id: 'b2', parents: ['b1'], timestamp: 5 },
    { id: 'm1', parents: ['a2', 'b2'], timestamp: 6 },
    { id: 'a3', parents: ['m1'], timestamp: 7 },
    { id: 'b3', parents: ['m1'], timestamp: 8 },
    { id: 'm2', parents: ['a3', 'b3'], timestamp: 9 },
    { id: 'c1', parents: ['root'], timestamp: 10 },
    { id: 'm3', parents: ['c1', 'm2'], timestamp: 11 },
    { id: 'octopus', parents: ['a2', 'b2', 'c1'], timestamp: 12 },
    { id: 'dangling', parents: ['m3'], timestamp: 13 },
    { id: 'orphan-root', parents: [], timestamp: 14 },
    { id: 'orphan-tip', parents: ['orphan-root'], timestamp: 15 }
  ];
  const layout = graphLayout(commits, {
    branches: { main: 'm3', feature: 'm2', octopus: 'octopus', orphan: 'orphan-tip', detached: 'dangling' },
    tags: { v1: { commit: 'a2' }, v2: 'm1' },
    head: { type: 'branch', name: 'main' }
  });
  assert.equal(layout.rowCount, commits.length);
  assert.equal(new Set(layout.rows.map(row => row.id)).size, commits.length);
  const rows = new Map(layout.rows.map(row => [row.id, row]));
  for (const commit of commits) {
    for (const parent of commit.parents) {
      const child = rows.get(commit.id), target = rows.get(parent);
      assert.ok(child && target, `${commit.id} -> ${parent}`);
      assert.ok(target.index > child.index, `${parent} 必须排在 ${commit.id} 之后`);
      assert.ok(layout.edges.some(edge => edge.from.id === commit.id && edge.to.id === parent), `缺少边 ${commit.id} -> ${parent}`);
    }
  }
  assert.ok((rows.get('m1').commit.parents ?? []).length === 2);
  assert.ok(rows.get('root').incomingLanes.length >= 1);
  assert.ok(rows.get('octopus').commit.parents.length === 3);
  assert.ok(layout.laneCount >= 2);
  assert.ok(layout.edges.every(edge => rows.has(edge.from.id) && rows.has(edge.to.id)));
  assert.ok(rows.get('m3').head);
  assert.ok(rows.get('m1').refs.some(ref => ref.name === 'v2'));
  assert.ok(rows.get('a2').refs.some(ref => ref.name === 'v1'));
  assert.ok(rows.get('orphan-tip').refs.some(ref => ref.name === 'orphan'));
  assert.ok(rows.get('dangling').refs.some(ref => ref.name === 'detached'));
});

test('清理不可达提交但保留分支与引用日志可达提交', async () => {
  const repo = makeRepo();
  const base = await initial(repo, chartNamed('A'));
  const state = await repo.read();
  const dangling = await repo.createCommit(state, { tree: base.commit.tree, parents: [base.commit.id], author, message: '不可达提交' });
  const result = await repo.gc();
  assert.ok(result.removedCommits >= 1);
  assert.ok(!await repo.readCommit(dangling.id));
  assert.ok(await repo.readCommit(base.commit.id));
  assert.equal((await repo.headSnapshot()).chart.META.name, 'A');
});

test('序列化快照可恢复为合法谱面', async () => {
  const repo = makeRepo();
  await initial(repo, chartNamed('A', [createNote(2, 1, 0, 3)]));
  const snapshotValue = await repo.headSnapshot();
  const parsed = parseChart(serializeChart(snapshotValue.chart));
  assert.equal(parsed.META.name, 'A');
  assert.equal(parsed.judgeLineList[0].notes.length, 1);
});
