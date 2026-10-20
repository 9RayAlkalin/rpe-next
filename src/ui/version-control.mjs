import { ChartRepository } from '../application/chart-vcs.mjs';
import { shortId } from '../core/chart-vcs.mjs';
import { serializeChart } from '../core/chart.mjs';
import { createMemoryVersionStore, openVersionStore } from '../platform/version-store.mjs';
import { download } from '../platform/files.mjs';
import { showDialog } from './dialog.mjs';

const SVG = 'http://www.w3.org/2000/svg';
const COLORS = ['#FFB000', '#DC267F', '#994F00', '#40B0A6', '#B66DFF', '#72D6A8', '#8CB4FF', '#FF9A8A'];
const ROW_HEIGHT = 22;
const LANE_WIDTH = 11;
const CURVE_RADIUS = 5;
const CIRCLE_RADIUS = 4;
const CIRCLE_STROKE = 2;
const GRAPH_BACKGROUND = '#1f2329';

function el(tag, options = {}, ...children) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title) node.title = options.title;
  if (options.type) node.type = options.type;
  if (options.value !== undefined) node.value = options.value;
  if (options.placeholder !== undefined) node.placeholder = options.placeholder;
  if (options.hidden) node.hidden = true;
  if (options.disabled) node.disabled = true;
  if (options.dataset) Object.assign(node.dataset, options.dataset);
  if (options.attrs) for (const [key, value] of Object.entries(options.attrs)) node.setAttribute(key, value);
  if (options.on) for (const [event, handler] of Object.entries(options.on)) node.addEventListener(event, handler);
  for (const child of children) if (child !== null && child !== undefined) node.append(child);
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  return node;
}

function button(label, onClick, options = {}) {
  return el('button', { type: 'button', text: label, className: options.className, title: options.title, disabled: options.disabled, on: { click: onClick } });
}

function formatDate(timestamp) {
  if (!Number.isFinite(timestamp)) return '未知时间';
  return new Date(timestamp).toLocaleString();
}

function jsonPreview(value, limit = 120) {
  if (value === undefined) return '（未定义）';
  let text;
  try { text = JSON.stringify(value); } catch { text = String(value); }
  if (text === undefined) return '（未定义）';
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function assetLabel(entry) {
  if (!entry) return '（已删除）';
  return `${entry.path} · ${shortId(entry.blob)} · ${entry.size} B`;
}

function changeCount(diff) {
  if (!diff) return 0;
  return (diff.chartChanged ? 1 : 0) + (diff.added?.length ?? 0) + (diff.modified?.length ?? 0) + (diff.deleted?.length ?? 0) + (diff.foldersChanged ? 1 : 0);
}

function commitMessage(commit) {
  return String(commit?.message ?? '').split('\n')[0];
}

export class VersionControlPanel {
  constructor(host, context, actions) {
    this.host = host;
    this.context = context;
    this.actions = actions;
    this.tab = 'graph';
    this.scope = 'refs';
    this.store = null;
    this.repo = null;
    this.repoId = null;
    this.repoState = null;
    this.state = null;
    this.commits = [];
    this.layout = null;
    this.selectedCommit = null;
    this.detail = null;
    this.workingDiff = null;
    this.mergeChoices = new Map();
    this.messageDraft = '';
    this.authorDraft = null;
    this.amendDraft = false;
    this.stashDraft = '';
    this.branchDraft = '';
    this.tagDraft = '';
    this.mergeTarget = '';
    this.busy = false;
    this.error = null;
    this.build();
  }

  build() {
    this.host.replaceChildren();
    this.host.classList.add('vcs-panel');
    this.branchLabel = el('strong', { className: 'vcs-branch-name', text: '未初始化' });
    this.headState = el('span', { className: 'vcs-state' });
    const header = el('div', { className: 'vcs-head' },
      el('div', { className: 'vcs-head-main' }, this.branchLabel, this.headState),
      button('刷新', () => this.refresh().catch(error => this.report(error)), { title: '重新读取仓库状态' })
    );
    this.tabs = new Map();
    const tabs = el('div', { className: 'vcs-tabs', attrs: { role: 'tablist' } });
    for (const [name, label] of [['graph', '图表'], ['changes', '更改'], ['branches', '分支'], ['stash', '储藏'], ['reflog', '日志']]) {
      const tab = button(label, () => {
        this.tab = name;
        this.error = null;
        if (name === 'changes') this.refresh().catch(error => this.report(error));
        else this.render();
      });
      tab.dataset.vcsTab = name;
      this.tabs.set(name, tab);
      tabs.append(tab);
    }
    this.banner = el('p', { className: 'vcs-banner', hidden: true });
    this.body = el('div', { className: 'vcs-body' });
    this.fileInput = el('input', { type: 'file', hidden: true, attrs: { accept: '.json,.rpevcs,application/json' } });
    this.fileInput.addEventListener('change', () => this.importBundleFile().catch(error => this.report(error)));
    this.host.append(header, tabs, this.banner, this.body, this.fileInput);
  }

  detach() {
    this.repo = null;
    this.repoId = null;
    this.repoState = null;
    this.state = null;
    this.commits = [];
    this.layout = null;
    this.selectedCommit = null;
    this.detail = null;
    this.workingDiff = null;
    this.mergeChoices.clear();
    this.tab = 'graph';
    this.messageDraft = '';
    this.authorDraft = null;
    this.amendDraft = false;
    this.branchDraft = '';
    this.tagDraft = '';
    this.stashDraft = '';
    this.mergeTarget = '';
    this.error = null;
    this.branchLabel.textContent = '未初始化';
    this.headState.textContent = '';
    this.banner.hidden = true;
    this.body.replaceChildren();
  }

  snapshot() {
    return {
      chart: this.context.getChart(), assets: this.context.getAssets(),
      folders: this.context.getFolders(), chartName: this.context.getChartName()
    };
  }

  notify(message, level = 'success') { this.actions.notify?.(message, level); }

  report(error) {
    this.error = error?.message ?? String(error);
    this.render();
    this.actions.reportError?.(error);
  }

  async run(task) {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    try { await task(); }
    catch (error) { this.report(error); }
    finally { this.busy = false; }
  }

  async ensure() {
    const repoId = this.context.getRepoId();
    if (this.repo && this.repoId === repoId) return;
    this.store = this.store ?? openVersionStore();
    this.repoId = repoId;
    this.repo = new ChartRepository(this.store, repoId);
    try { await this.repo.init(); }
    catch (error) {
      this.store = createMemoryVersionStore();
      this.repo = new ChartRepository(this.store, repoId);
      await this.repo.init();
      this.notify('版本数据库不可用，已切换到临时内存仓库；关闭页面后会丢失版本记录。', 'warning', 8000);
      this.error = error.message;
    }
    const repo = await this.repo.read();
    const hasCommit = Object.values(repo.branches ?? {}).some(Boolean) || Boolean(repo.head?.commit);
    if (!hasCommit) {
      await this.repo.stage(this.snapshot());
      await this.repo.commit({ message: '初始版本', author: repo.config?.author });
      this.notify('已创建版本库初始提交', 'success');
    }
  }

  async open() {
    if (!this.context.hasDocument()) {
      this.branchLabel.textContent = '未打开谱面';
      this.headState.textContent = '';
      this.body.replaceChildren(el('p', { className: 'vcs-empty', text: '请先打开或新建一个谱面。' }));
      return;
    }
    await this.run(async () => {
      await this.ensure();
      await this.refresh();
    });
  }

  async refresh() {
    if (!this.context.hasDocument()) return;
    this.error = null;
    await this.ensure();
    const repo = await this.repo.read();
    this.repoState = repo;
    this.state = await this.repo.status(this.snapshot());
    this.commits = await this.repo.log({ currentOnly: this.scope === 'current', includeDangling: this.scope === 'all' });
    this.layout = this.repo.graph(this.commits, repo);
    this.workingDiff = this.tab === 'changes' ? await this.repo.workingDiff(this.snapshot()).catch(() => null) : null;
    if (!this.selectedCommit || !this.commits.some(commit => commit.id === this.selectedCommit)) this.selectedCommit = this.state.headId ?? this.commits[0]?.id ?? null;
    this.detail = this.selectedCommit ? await this.repo.diffCommit(this.selectedCommit).catch(() => null) : null;
    if (this.authorDraft === null) this.authorDraft = { ...(repo.config?.author ?? { name: '本地用户', email: 'local@rpe-next' }) };
    this.mergeChoices.clear();
    this.render();
  }

  render() {
    if (!this.repoState) return;
    const state = this.state;
    const branch = state?.branch ?? (state?.headId ? `游离 HEAD @ ${shortId(state.headId)}` : '未出生分支');
    this.branchLabel.textContent = branch;
    this.branchLabel.title = state?.detached ? '当前处于游离 HEAD 状态；提交不会移动分支' : '当前分支';
    const pending = (state?.staged.total ?? 0) + (state?.unstaged.total ?? 0);
    this.headState.textContent = state?.clean ? '工作区干净' : `${pending} 项更改`;
    this.headState.className = `vcs-state ${state?.clean ? 'clean' : 'dirty'}`;
    for (const [name, tab] of this.tabs) {
      tab.classList.toggle('active', name === this.tab);
      tab.setAttribute('aria-selected', String(name === this.tab));
    }
    const messages = [];
    if (this.store?.ephemeral) messages.push('当前使用临时内存版本库，刷新或关闭页面会丢失版本记录。');
    if (this.context.isPersisted && !this.context.isPersisted()) messages.push('谱面尚未保存到谱面库：版本库当前使用临时标识，保存项目后会固定。');
    if (this.repoState.merge) messages.push(`正在${this.repoState.merge.kind === 'merge' ? '合并' : this.repoState.merge.kind === 'cherry-pick' ? '拣选' : this.repoState.merge.kind === 'revert' ? '回退' : '操作'}：${this.repoState.merge.conflicts.length} 处冲突待解决。`);
    if (this.error) messages.push(this.error);
    this.banner.textContent = messages.join(' ');
    this.banner.hidden = !messages.length;
    this.banner.className = `vcs-banner ${this.error ? 'error' : ''}`;
    const scrollTop = this.body.scrollTop;
    const graphScroll = this.body.querySelector('.vcs-graph-scroll');
    const graphPosition = graphScroll ? { left: graphScroll.scrollLeft, top: graphScroll.scrollTop } : null;
    this.body.replaceChildren(this.renderTab());
    this.body.scrollTop = scrollTop;
    if (graphPosition) {
      const next = this.body.querySelector('.vcs-graph-scroll');
      if (next) { next.scrollLeft = graphPosition.left; next.scrollTop = graphPosition.top; }
    }
    const selectedRow = this.body.querySelector('.vcs-graph-row.selected');
    const graphContainer = this.body.querySelector('.vcs-graph-scroll');
    if (selectedRow && graphContainer) {
      const top = Number(selectedRow.dataset.index ?? 0) * ROW_HEIGHT;
      const bottom = top + ROW_HEIGHT;
      if (top < graphContainer.scrollTop) graphContainer.scrollTop = top;
      else if (bottom > graphContainer.scrollTop + graphContainer.clientHeight) graphContainer.scrollTop = bottom - graphContainer.clientHeight;
    }
  }

  tick() {
    if (!this.state) return;
    const pending = (this.state.staged.total ?? 0) + (this.state.unstaged.total ?? 0);
    const dirty = this.context.isDirty?.();
    this.headState.textContent = `${this.state.clean ? '工作区干净' : `${pending} 项更改`}${dirty ? ' · 编辑器未保存' : ''}`;
    this.headState.className = `vcs-state ${this.state.clean ? 'clean' : 'dirty'}`;
  }

  renderTab() {
    if (this.repoState?.merge) return this.renderMergeState();
    if (this.tab === 'changes') return this.renderChangesTab();
    if (this.tab === 'branches') return this.renderBranchesTab();
    if (this.tab === 'stash') return this.renderStashTab();
    if (this.tab === 'reflog') return this.renderReflogTab();
    return this.renderGraphTab();
  }

  renderGraphTab() {
    const pane = el('div', { className: 'vcs-pane' });
    const scope = el('select', { value: this.scope, attrs: { 'aria-label': '历史范围' }, on: { change: event => { this.scope = event.target.value; this.refresh().catch(error => this.report(error)); } } },
      new Option('所有引用', 'refs'), new Option('当前分支', 'current'), new Option('全部提交（含游离）', 'all'));
    scope.value = this.scope;
    const toolbar = el('div', { className: 'vcs-toolbar' }, scope,
      button('刷新', () => this.refresh().catch(error => this.report(error))),
      button('新建提交', () => { this.tab = 'changes'; this.render(); }, { className: 'primary' }));
    const scroll = el('div', { className: 'vcs-graph-scroll' }, this.buildGraph());
    pane.append(toolbar, scroll);
    if (this.detail) pane.append(this.buildCommitDetail());
    else if (!this.commits.length) pane.append(el('p', { className: 'vcs-empty', text: '尚无提交。切换到“更改”创建第一个版本。' }));
    return pane;
  }

  buildGraph() {
    const layout = this.layout;
    if (!layout?.rows.length) return el('p', { className: 'vcs-empty', text: '尚无提交。' });
    const laneX = lane => LANE_WIDTH * (lane + 1);
    const colorOf = index => COLORS[index % COLORS.length];
    const labelX = LANE_WIDTH * (Math.max(1, layout.laneCount) + 1) + 8;
    const messageChars = Math.max(18, Math.min(48, ...layout.rows.map(row => commitMessage(row.commit).length)));
    const messageWidth = messageChars * 12;
    const width = labelX + 170 + messageWidth + 12;
    const height = layout.rows.length * ROW_HEIGHT + 4;
    const svg = svgEl('svg', { class: 'vcs-graph', viewBox: `0 0 ${width} ${height}`, width, height, role: 'tree', 'aria-label': '提交图谱' });
    const defs = svgEl('defs');
    for (const row of layout.rows) {
      const clip = svgEl('clipPath', { id: `vcs-row-clip-${row.index}` });
      clip.append(svgEl('rect', { x: 0, y: 0, width, height: ROW_HEIGHT }));
      defs.append(clip);
    }
    svg.append(defs);
    const addPath = (group, d, color, strokeWidth = 1) => {
      group.append(svgEl('path', {
        d, fill: 'none', stroke: colorOf(color), 'stroke-width': strokeWidth,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      }));
    };
    const findLastIndex = (nodes, id) => {
      for (let index = nodes.length - 1; index >= 0; index--) if (nodes[index].id === id) return index;
      return -1;
    };
    for (const row of layout.rows) {
      const group = svgEl('g', {
        class: `vcs-graph-row${this.selectedCommit === row.id ? ' selected' : ''}`,
        'data-commit': row.id, 'data-index': row.index, tabindex: '0', role: 'button',
        transform: `translate(0 ${row.index * ROW_HEIGHT})`, 'clip-path': `url(#vcs-row-clip-${row.index})`
      });
      group.append(svgEl('rect', { x: 0, y: 0, width, height: ROW_HEIGHT, class: 'vcs-graph-hit' }));

      let outputIndex = 0;
      for (let index = 0; index < row.inputSwimlanes.length; index++) {
        const node = row.inputSwimlanes[index];
        if (node.id === row.id) {
          if (index !== row.circleIndex) {
            addPath(group, `M ${laneX(index)} 0 A ${LANE_WIDTH} ${LANE_WIDTH} 0 0 1 ${LANE_WIDTH * index} ${LANE_WIDTH} H ${laneX(row.circleIndex)}`, node.color);
          } else {
            outputIndex++;
          }
        } else if (outputIndex < row.outputSwimlanes.length && node.id === row.outputSwimlanes[outputIndex].id) {
          if (index === outputIndex) {
            addPath(group, `M ${laneX(index)} 0 V ${ROW_HEIGHT}`, node.color);
          } else {
            const x1 = laneX(index), x2 = laneX(outputIndex);
            addPath(group, `M ${x1} 0 V ${LANE_WIDTH - CURVE_RADIUS} A ${CURVE_RADIUS} ${CURVE_RADIUS} 0 0 1 ${x1 - CURVE_RADIUS} ${ROW_HEIGHT / 2} H ${x2 + CURVE_RADIUS} A ${CURVE_RADIUS} ${CURVE_RADIUS} 0 0 0 ${x2} ${ROW_HEIGHT / 2 + CURVE_RADIUS} V ${ROW_HEIGHT}`, node.color);
          }
          outputIndex++;
        }
      }

      for (let index = 1; index < (row.commit.parents ?? []).length; index++) {
        const parentOutputIndex = findLastIndex(row.outputSwimlanes, row.commit.parents[index]);
        if (parentOutputIndex === -1) continue;
        const color = row.outputSwimlanes[parentOutputIndex].color;
        const startX = LANE_WIDTH * parentOutputIndex;
        addPath(group, `M ${startX} ${ROW_HEIGHT / 2} A ${LANE_WIDTH} ${LANE_WIDTH} 0 0 1 ${laneX(parentOutputIndex)} ${ROW_HEIGHT} M ${startX} ${ROW_HEIGHT / 2} H ${laneX(row.circleIndex)}`, color);
      }

      const inputIndex = row.inputSwimlanes.findIndex(node => node.id === row.id);
      if (inputIndex !== -1) addPath(group, `M ${laneX(row.circleIndex)} 0 V ${ROW_HEIGHT / 2}`, row.inputSwimlanes[inputIndex].color);
      if ((row.commit.parents ?? []).length > 0) {
        const laneColor = inputIndex !== -1 ? row.inputSwimlanes[inputIndex].color : row.circleColor;
        addPath(group, `M ${laneX(row.circleIndex)} ${ROW_HEIGHT / 2} V ${ROW_HEIGHT}`, laneColor);
      }

      const cx = laneX(row.circleIndex), cy = LANE_WIDTH;
      if (row.head) {
        group.append(svgEl('circle', { cx, cy, r: CIRCLE_RADIUS + 3, fill: colorOf(row.circleColor), stroke: colorOf(row.circleColor), 'stroke-width': CIRCLE_STROKE }));
        group.append(svgEl('circle', { cx, cy, r: CIRCLE_STROKE, fill: 'none', stroke: GRAPH_BACKGROUND, 'stroke-width': CIRCLE_STROKE * 2 }));
      } else if ((row.commit.parents ?? []).length > 1) {
        group.append(svgEl('circle', { cx, cy, r: CIRCLE_RADIUS + 2, fill: colorOf(row.circleColor), stroke: colorOf(row.circleColor), 'stroke-width': CIRCLE_STROKE }));
        group.append(svgEl('circle', { cx, cy, r: CIRCLE_RADIUS - 1, fill: colorOf(row.circleColor), stroke: colorOf(row.circleColor), 'stroke-width': CIRCLE_STROKE }));
      } else {
        group.append(svgEl('circle', { cx, cy, r: CIRCLE_RADIUS + 1, fill: colorOf(row.circleColor), stroke: colorOf(row.circleColor), 'stroke-width': CIRCLE_STROKE }));
      }

      group.append(svgEl('text', { x: labelX, y: cy + 4, class: 'vcs-graph-id', text: shortId(row.id) }));
      const refLabels = row.refs.map(ref => ({
        text: ref.type === 'branch' ? ref.name : ref.type === 'tag' ? `#${ref.name}` : 'HEAD',
        color: ref.color
      }));
      if (refLabels.length) {
        const refNode = svgEl('text', { x: labelX + 58, y: cy + 4, class: 'vcs-graph-ref' });
        let remaining = 12;
        for (const ref of refLabels) {
          if (remaining <= 0) break;
          const text = ref.text.length > remaining ? `${ref.text.slice(0, Math.max(1, remaining - 1))}…` : ref.text;
          const tspan = svgEl('tspan', { fill: colorOf(ref.color) });
          tspan.textContent = `${text} `;
          refNode.append(tspan);
          remaining -= text.length + 1;
        }
        group.append(refNode);
      }
      const message = svgEl('text', { x: labelX + 170, y: cy + 4, class: 'vcs-graph-message' });
      const text = commitMessage(row.commit);
      message.textContent = text.length > messageChars ? `${text.slice(0, messageChars - 1)}…` : text;
      group.append(message);
      const title = svgEl('title');
      const refs = refLabels.map(ref => ref.text).join(' ');
      title.textContent = `${shortId(row.id)} ${text}\n${formatDate(row.commit.timestamp)} · ${row.commit.author?.name ?? ''}${refs ? `\n${refs}` : ''}`;
      group.append(title);
      svg.append(group);
    }
    svg.addEventListener('click', event => {
      const group = event.target.closest?.('[data-commit]');
      if (group) this.selectCommit(group.dataset.commit);
    });
    svg.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      const group = event.target.closest?.('[data-commit]');
      if (group) { event.preventDefault(); this.selectCommit(group.dataset.commit); }
    });
    return svg;
  }

  selectCommit(id) {
    if (this.selectedCommit === id && this.detail) return;
    if (!this.repo) return;
    this.selectedCommit = id;
    this.detail = null;
    this.render();
    this.repo.diffCommit(id).then(detail => {
      if (this.selectedCommit !== id) return;
      this.detail = detail;
      this.render();
    }).catch(error => this.report(error));
  }

  buildCommitDetail() {
    const { commit, parent, chartDiff, treeDiff } = this.detail;
    const host = el('div', { className: 'vcs-detail' });
    const refs = [];
    for (const [name, id] of Object.entries(this.repoState.branches ?? {})) if (id === commit.id) refs.push(`分支 ${name}`);
    for (const [name, tag] of Object.entries(this.repoState.tags ?? {})) if ((typeof tag === 'string' ? tag : tag?.commit) === commit.id) refs.push(`标签 #${name}`);
    if (this.state?.headId === commit.id) refs.push('HEAD');
    host.append(el('h3', { text: commit.message || '（无提交说明）' }));
    host.append(el('p', { className: 'vcs-meta', text: `${shortId(commit.id)} · ${commit.author?.name ?? ''} <${commit.author?.email ?? ''}> · ${formatDate(commit.timestamp)}` }));
    if (refs.length) host.append(el('p', { className: 'vcs-refs', text: refs.join(' · ') }));
    if (commit.parents?.length) {
      const parents = el('p', { className: 'vcs-parents' }, '父提交：');
      for (const id of commit.parents) parents.append(button(shortId(id), () => this.selectCommit(id), { className: 'vcs-link' }));
      host.append(parents);
    }
    const actions = el('div', { className: 'vcs-action-grid' });
    actions.append(
      button('检出此提交', () => this.checkoutCommit(commit.id)),
      button('新建分支', () => this.createBranchAt(commit.id)),
      button('新建标签', () => this.createTagAt(commit.id)),
      button('拣选到当前分支', () => this.cherryPick(commit.id)),
      button('反向提交（回退）', () => this.revert(commit.id)),
      button('重置当前分支', () => this.resetTo(commit.id)),
      button('导出此版本谱面', () => this.exportCommitChart(commit.id))
    );
    host.append(actions);
    host.append(el('h4', { text: parent ? `与父提交 ${shortId(parent.id)} 的差异` : '初始提交' }));
    host.append(this.renderTreeDiff(treeDiff, { initial: !parent }));
    host.append(this.renderChartDiff(chartDiff));
    return host;
  }

  renderTreeDiff(diff, { initial = false } = {}) {
    const host = el('div', { className: 'vcs-tree-diff' });
    if (!diff || changeCount(diff) === 0) { host.append(el('p', { className: 'vcs-muted', text: '文件无变化。' })); return host; }
    if (diff.chartChanged) host.append(el('div', { className: 'vcs-file-row' }, el('span', { text: '谱面 JSON' }), el('span', { className: `vcs-badge ${initial ? 'added' : 'modified'}`, text: initial ? '新增' : '已修改' })));
    if (diff.chartNameChanged) host.append(el('div', { className: 'vcs-file-row' }, el('span', { text: '谱面文件名' }), el('span', { className: `vcs-badge ${initial ? 'added' : 'modified'}`, text: initial ? '新增' : '已修改' })));
    if (diff.foldersChanged) host.append(el('div', { className: 'vcs-file-row' }, el('span', { text: '素材文件夹' }), el('span', { className: `vcs-badge ${initial ? 'added' : 'modified'}`, text: initial ? '新增' : '已修改' })));
    for (const entry of diff.added ?? []) host.append(el('div', { className: 'vcs-file-row' }, el('span', { text: entry.path }), el('span', { className: 'vcs-badge added', text: '新增' })));
    for (const entry of diff.modified ?? []) host.append(el('div', { className: 'vcs-file-row' }, el('span', { text: entry.path }), el('span', { className: 'vcs-badge modified', text: '修改' })));
    for (const entry of diff.deleted ?? []) host.append(el('div', { className: 'vcs-file-row' }, el('span', { text: entry.path }), el('span', { className: 'vcs-badge deleted', text: '删除' })));
    return host;
  }

  renderChartDiff(diff) {
    const host = el('div', { className: 'vcs-chart-diff' });
    if (!diff || diff.total === 0) { host.append(el('p', { className: 'vcs-muted', text: '谱面语义无变化。' })); return host; }
    const rows = [
      ['判定线', diff.lines.added, diff.lines.removed, diff.lines.modified],
      ['音符', diff.notes.added, diff.notes.removed, diff.notes.modified],
      ['事件', diff.events.added, diff.events.removed, diff.events.modified],
      ['BPM', diff.bpm.added, diff.bpm.removed, diff.bpm.modified]
    ];
    const maximum = Math.max(1, ...rows.flatMap(row => row.slice(1)));
    const bars = el('div', { className: 'vcs-diff-bars' });
    for (const [label, added, removed, modified] of rows) {
      if (!added && !removed && !modified) continue;
      const row = el('div', { className: 'vcs-diff-bar-row' });
      row.append(el('span', { className: 'vcs-diff-label', text: label }));
      const bar = el('div', { className: 'vcs-diff-bar' });
      for (const [value, kind, title] of [[added, 'added', `新增 ${added}`], [removed, 'deleted', `删除 ${removed}`], [modified, 'modified', `修改 ${modified}`]]) {
        if (!value) continue;
        bar.append(el('span', { className: `vcs-diff-segment ${kind}`, title, attrs: { style: `flex:${value / maximum}` } }));
      }
      row.append(bar);
      row.append(el('span', { className: 'vcs-diff-count', text: `+${added} -${removed} ~${modified}` }));
      bars.append(row);
    }
    host.append(bars);
    const groups = [
      ['meta', '谱面信息'], ['bpm', 'BPM'], ['line', '判定线'],
      ['note', '音符'], ['event', '事件'], ['other', '其他数据']
    ];
    for (const [kind, label] of groups) {
      const items = (diff.details ?? []).filter(item => item.kind === kind);
      if (!items.length) continue;
      const section = el('details', { className: 'vcs-change-group', attrs: { open: '' } },
        el('summary', { text: `${label}（${items.length}）` }));
      const list = el('div', { className: 'vcs-change-list' });
      for (const item of items.slice(0, 60)) list.append(el('div', { className: 'vcs-change-row', text: item.text }));
      if (items.length > 60) list.append(el('p', { className: 'vcs-muted', text: `还有 ${items.length - 60} 项未显示。` }));
      section.append(list);
      host.append(section);
    }
    if (diff.detailsTruncated) host.append(el('p', { className: 'vcs-muted', text: '差异项过多，仅显示前 200 项。' }));
    if (!diff.details?.length) {
      const samples = [
        ['新增音符', diff.notes.samples.added], ['删除音符', diff.notes.samples.removed], ['修改音符', diff.notes.samples.modified],
        ['新增事件', diff.events.samples.added], ['删除事件', diff.events.samples.removed], ['修改事件', diff.events.samples.modified],
        ['修改判定线', diff.lines.samples]
      ].filter(([, values]) => values?.length);
      if (samples.length) {
        const list = el('div', { className: 'vcs-samples' });
        for (const [label, values] of samples) {
          list.append(el('div', { className: 'vcs-sample-row' }, el('strong', { text: label }), el('span', { text: values.join('；') })));
        }
        host.append(list);
      }
    }
    return host;
  }

  renderChangesTab() {
    const state = this.state;
    const pane = el('div', { className: 'vcs-pane' });
    const status = el('div', { className: 'vcs-status-card' });
    status.append(el('strong', { text: state.clean ? '工作区干净' : '存在未提交更改' }));
    status.append(el('span', { text: `暂存 ${state.staged.total} 项 · 未暂存 ${state.unstaged.total} 项` }));
    pane.append(status);
    const actions = el('div', { className: 'vcs-action-grid' });
    actions.append(
      button('暂存全部', () => this.stageAll()),
      button('取消暂存', () => this.unstageAll()),
      button('放弃未暂存更改', () => this.discardUnstaged()),
      button('刷新', () => this.refresh().catch(error => this.report(error)))
    );
    pane.append(actions);
    const staged = el('details', { className: 'vcs-changes-group', attrs: { open: '' } }, el('summary', { text: `暂存区（${state.staged.total}）` }), this.renderTreeDiff(state.staged));
    const unstaged = el('details', { className: 'vcs-changes-group', attrs: { open: '' } }, el('summary', { text: `工作区（${state.unstaged.total}）` }), this.renderTreeDiff(state.unstaged));
    pane.append(staged, unstaged);
    if (this.workingDiff) {
      pane.append(el('h4', { text: '工作区与 HEAD 的谱面差异' }));
      pane.append(this.renderChartDiff(this.workingDiff.chartDiff));
    }
    const form = el('div', { className: 'vcs-commit-form' });
    form.append(el('h4', { text: '提交' }));
    const message = el('textarea', { placeholder: '提交说明（必填）', value: this.messageDraft, attrs: { rows: '3', 'aria-label': '提交说明' } });
    message.value = this.messageDraft;
    message.addEventListener('input', () => { this.messageDraft = message.value; });
    form.append(message);
    const author = this.authorDraft ?? { name: '本地用户', email: 'local@rpe-next' };
    const name = el('input', { value: author.name, attrs: { 'aria-label': '提交者名称', placeholder: '提交者名称' } });
    const email = el('input', { value: author.email, attrs: { 'aria-label': '提交者邮箱', placeholder: '提交者邮箱' } });
    name.addEventListener('input', () => { this.authorDraft = { ...(this.authorDraft ?? author), name: name.value }; });
    email.addEventListener('input', () => { this.authorDraft = { ...(this.authorDraft ?? author), email: email.value }; });
    form.append(el('div', { className: 'vcs-field' }, el('label', { text: '名称' }), name));
    form.append(el('div', { className: 'vcs-field' }, el('label', { text: '邮箱' }), email));
    const amend = el('input', { type: 'checkbox' });
    amend.checked = this.amendDraft;
    amend.addEventListener('change', () => { this.amendDraft = amend.checked; });
    form.append(el('label', { className: 'vcs-check' }, amend, '修正上一次提交（amend）'));
    const commitButton = button('提交已暂存内容', () => this.commitStaged(), { className: 'primary' });
    commitButton.disabled = state.staged.total === 0 && !this.amendDraft;
    form.append(commitButton);
    form.append(el('p', { className: 'vcs-muted', text: '提示：先“暂存全部”，再填写说明提交；未暂存的修改不会进入提交。' }));
    pane.append(form);
    return pane;
  }

  renderBranchesTab() {
    const repo = this.repoState;
    const pane = el('div', { className: 'vcs-pane' });
    pane.append(el('h4', { text: '分支' }));
    const list = el('div', { className: 'vcs-ref-list' });
    for (const [name, id] of Object.entries(repo.branches ?? {})) {
      const current = repo.head?.type === 'branch' && repo.head.name === name;
      const row = el('div', { className: `vcs-ref-row${current ? ' current' : ''}` });
      row.append(el('div', { className: 'vcs-ref-name' }, el('strong', { text: name }), current ? el('span', { className: 'vcs-badge current', text: '当前' }) : null, el('small', { text: id ? shortId(id) : '未出生' })));
      const actions = el('div', { className: 'vcs-ref-actions' });
      if (!current) actions.append(button('检出', () => this.checkoutBranch(name)));
      actions.append(button('重命名', () => this.renameBranch(name)));
      if (!current) actions.append(button('删除', () => this.deleteBranch(name)));
      row.append(actions);
      list.append(row);
    }
    pane.append(list);
    const create = el('div', { className: 'vcs-inline-form' });
    const branchName = el('input', { value: this.branchDraft, placeholder: '新分支名称', attrs: { 'aria-label': '新分支名称' } });
    branchName.addEventListener('input', () => { this.branchDraft = branchName.value; });
    create.append(branchName, button('从当前提交创建', () => this.createBranchFromDraft()));
    pane.append(create);

    pane.append(el('h4', { text: '合并' }));
    const targets = [
      ...Object.entries(repo.branches ?? {}).filter(([name, id]) => id && !(repo.head?.type === 'branch' && repo.head.name === name)).map(([name]) => name),
      ...Object.entries(repo.tags ?? {}).filter(([, tag]) => typeof tag === 'string' ? tag : tag?.commit).map(([name]) => name)
    ];
    if (targets.length) {
      const select = el('select', { attrs: { 'aria-label': '合并目标' } });
      for (const name of targets) select.append(new Option(name, name));
      select.value = this.mergeTarget && targets.includes(this.mergeTarget) ? this.mergeTarget : targets[0];
      this.mergeTarget = select.value;
      select.addEventListener('change', () => { this.mergeTarget = select.value; });
      pane.append(el('div', { className: 'vcs-inline-form' }, select, button('合并到当前分支', () => this.mergeRef(this.mergeTarget))));
    } else pane.append(el('p', { className: 'vcs-muted', text: '没有可合并的其他分支或标签。' }));

    pane.append(el('h4', { text: '标签' }));
    const tags = el('div', { className: 'vcs-ref-list' });
    const entries = Object.entries(repo.tags ?? {});
    if (!entries.length) tags.append(el('p', { className: 'vcs-muted', text: '尚无标签。' }));
    for (const [name, tag] of entries) {
      const id = typeof tag === 'string' ? tag : tag?.commit;
      const row = el('div', { className: 'vcs-ref-row' }, el('div', { className: 'vcs-ref-name' }, el('strong', { text: `#${name}` }), el('small', { text: shortId(id) })));
      row.append(el('div', { className: 'vcs-ref-actions' }, button('删除', () => this.deleteTag(name))));
      tags.append(row);
    }
    pane.append(tags);
    const tagForm = el('div', { className: 'vcs-inline-form' });
    const tagName = el('input', { value: this.tagDraft, placeholder: '新标签名称', attrs: { 'aria-label': '新标签名称' } });
    tagName.addEventListener('input', () => { this.tagDraft = tagName.value; });
    tagForm.append(tagName, button('在当前提交创建标签', () => this.createTagFromDraft()));
    pane.append(tagForm);
    return pane;
  }

  renderStashTab() {
    const repo = this.repoState;
    const pane = el('div', { className: 'vcs-pane' });
    pane.append(el('h4', { text: '储藏' }));
    pane.append(el('p', { className: 'vcs-muted', text: '储藏会把当前工作区保存起来，并把编辑器恢复到 HEAD；可稍后应用或弹出。' }));
    const form = el('div', { className: 'vcs-inline-form' });
    const message = el('input', { value: this.stashDraft, placeholder: '储藏说明（可选）', attrs: { 'aria-label': '储藏说明' } });
    message.addEventListener('input', () => { this.stashDraft = message.value; });
    form.append(message, button('储藏当前更改', () => this.stashPush()));
    pane.append(form);
    const list = el('div', { className: 'vcs-ref-list' });
    if (!repo.stash?.length) list.append(el('p', { className: 'vcs-muted', text: '没有储藏记录。' }));
    for (const [index, entry] of (repo.stash ?? []).entries()) {
      const row = el('div', { className: 'vcs-stash-row' });
      row.append(el('div', { className: 'vcs-stash-main' }, el('strong', { text: entry.message }), el('small', { text: `${formatDate(entry.timestamp)}${entry.branch ? ` · ${entry.branch}` : ''}` })));
      row.append(el('div', { className: 'vcs-ref-actions' },
        button('应用', () => this.stashApply(index)), button('弹出', () => this.stashPop(index)), button('删除', () => this.stashDrop(index))));
      list.append(row);
    }
    pane.append(list);
    return pane;
  }

  renderReflogTab() {
    const repo = this.repoState;
    const pane = el('div', { className: 'vcs-pane' });
    pane.append(el('h4', { text: '引用日志' }));
    const list = el('div', { className: 'vcs-ref-list' });
    if (!repo.reflog?.length) list.append(el('p', { className: 'vcs-muted', text: '没有引用日志。' }));
    for (const entry of repo.reflog ?? []) {
      const row = el('div', { className: 'vcs-reflog-row' });
      row.append(el('div', { className: 'vcs-reflog-main' }, el('strong', { text: entry.message }), el('small', { text: `${formatDate(entry.timestamp)} · ${shortId(entry.from) || '∅'} → ${shortId(entry.to) || '∅'}` })));
      if (entry.to) row.append(button('检出', () => this.checkoutCommit(entry.to)));
      list.append(row);
    }
    pane.append(list);
    pane.append(el('h4', { text: '仓库工具' }));
    const tools = el('div', { className: 'vcs-action-grid' });
    tools.append(
      button('导出仓库包', () => this.exportBundle()),
      button('导入仓库包', () => this.fileInput.click()),
      button('清理不可达对象', () => this.gc()),
      button('导出当前谱面 JSON', () => this.exportCurrentChart())
    );
    pane.append(tools);
    return pane;
  }

  renderMergeState() {
    const merge = this.repoState.merge;
    const pane = el('div', { className: 'vcs-pane' });
    const label = merge.kind === 'cherry-pick' ? '拣选' : merge.kind === 'revert' ? '回退' : '合并';
    pane.append(el('h4', { text: `解决${label}冲突` }));
    if (merge.targetRef) pane.append(el('p', { className: 'vcs-muted', text: `目标：${merge.targetRef} · ${merge.message ?? ''}` }));
    pane.append(el('p', { className: 'vcs-muted', text: `共 ${merge.conflicts.length} 处冲突。选择“当前”保留本分支内容，选择“对方”采用目标版本内容。` }));
    const list = el('div', { className: 'vcs-conflicts' });
    merge.conflicts.forEach((conflict, index) => {
      const choice = this.mergeChoices.get(index) ?? 'ours';
      const row = el('div', { className: 'vcs-conflict' });
      row.append(el('strong', { text: conflict.path }));
      const options = el('div', { className: 'vcs-conflict-options' });
      for (const [value, label] of [['ours', '当前'], ['theirs', '对方']]) {
        const input = el('input', { type: 'radio', attrs: { name: `vcs-conflict-${index}`, value } });
        input.checked = choice === value;
        input.addEventListener('change', () => { if (input.checked) this.mergeChoices.set(index, value); });
        options.append(el('label', { className: 'vcs-check' }, input, label));
      }
      row.append(options);
      row.append(el('div', { className: 'vcs-conflict-values' },
        el('span', {}, el('strong', { text: '当前：' }), conflict.oursPresent === false ? '（已删除）' : conflict.kind === 'asset' ? assetLabel(conflict.ours) : jsonPreview(conflict.ours)),
        el('span', {}, el('strong', { text: '对方：' }), conflict.theirsPresent === false ? '（已删除）' : conflict.kind === 'asset' ? assetLabel(conflict.theirs) : jsonPreview(conflict.theirs))));
      list.append(row);
    });
    pane.append(list);
    pane.append(el('div', { className: 'vcs-action-grid' },
      button('完成并提交', () => this.resolveMerge(), { className: 'primary' }),
      button('放弃本次操作', () => this.abortMerge())));
    return pane;
  }

  async stageAll() {
    await this.run(async () => {
      await this.repo.stage(this.snapshot());
      this.notify('已暂存当前谱面与素材');
      await this.refresh();
    });
  }

  async unstageAll() {
    await this.run(async () => {
      await this.repo.unstage();
      this.notify('已取消暂存');
      await this.refresh();
    });
  }

  async commitStaged() {
    await this.run(async () => {
      const message = this.messageDraft.trim();
      if (!message) throw new Error('请输入提交说明');
      const author = {
        name: this.authorDraft?.name?.trim() || '本地用户',
        email: this.authorDraft?.email?.trim() || 'local@rpe-next'
      };
      const repo = await this.repo.read();
      repo.config = { ...(repo.config ?? {}), author };
      await this.repo.save(repo);
      const result = await this.repo.commit({ message, author, amend: this.amendDraft });
      this.messageDraft = '';
      this.amendDraft = false;
      this.selectedCommit = result.commit.id;
      this.tab = 'graph';
      this.notify(`已提交 ${shortId(result.commit.id)}`);
      await this.refresh();
    });
  }

  async discardUnstaged() {
    if (!await this.confirm('放弃未暂存更改', '工作区将恢复到暂存区（若暂存区为空则恢复到 HEAD）的内容。此操作不可撤销。')) return;
    await this.run(async () => {
      const tree = this.state?.indexTree?.id ?? this.state?.headTree?.id;
      if (!tree) throw new Error('没有可恢复的版本');
      const result = await this.repo.restore(tree);
      await this.afterSnapshot(result, true);
      this.notify('已放弃未暂存更改');
    });
  }

  async checkoutCommit(id) {
    if (!await this.confirmEditorDiscard()) return;
    await this.run(async () => {
      try {
        const result = await this.repo.checkoutCommit(id, { snapshot: this.snapshot() });
        await this.afterSnapshot(result, true);
        this.notify(`已检出 ${shortId(id)}（游离 HEAD）`);
      } catch (error) {
        if (error.code !== 'DIRTY_WORKING_TREE') throw error;
        if (!await this.confirm('工作区有未提交更改', '检出会丢弃当前工作区更改。建议先提交或储藏。继续？')) return;
        const result = await this.repo.checkoutCommit(id, { snapshot: this.snapshot(), force: true });
        await this.afterSnapshot(result, true);
        this.notify(`已检出 ${shortId(id)}（游离 HEAD）`);
      }
    });
  }

  async checkoutBranch(name) {
    if (!await this.confirmEditorDiscard()) return;
    await this.run(async () => {
      try {
        const result = await this.repo.checkoutBranch(name, { snapshot: this.snapshot() });
        await this.afterSnapshot(result, true);
        this.notify(`已切换到分支 ${name}`);
      } catch (error) {
        if (error.code !== 'DIRTY_WORKING_TREE') throw error;
        if (!await this.confirm('工作区有未提交更改', '切换分支会丢弃当前工作区更改。建议先提交或储藏。继续？')) return;
        const result = await this.repo.checkoutBranch(name, { snapshot: this.snapshot(), force: true });
        await this.afterSnapshot(result, true);
        this.notify(`已切换到分支 ${name}`);
      }
    });
  }

  async confirmEditorDiscard() {
    if (!this.context.isDirty?.()) return true;
    return this.confirm('编辑器有未保存修改', '该操作会替换编辑器中的谱面，尚未保存的修改会丢失。建议先保存到谱面库。继续？');
  }

  async createBranchAt(commitId) {
    const name = await this.askText('新建分支', `从 ${commitId ? shortId(commitId) : '当前提交'} 创建分支。`, '分支名称', this.branchDraft);
    if (!name) return;
    await this.run(async () => {
      await this.repo.createBranch(name, commitId ?? null);
      this.branchDraft = '';
      this.notify(`已创建分支 ${name}`);
      await this.refresh();
    });
  }

  async createBranchFromDraft() {
    const name = this.branchDraft.trim();
    if (!name) { this.notify('请输入分支名称', 'warning'); return; }
    await this.run(async () => {
      await this.repo.createBranch(name, this.state?.headId ?? null);
      this.branchDraft = '';
      this.notify(`已创建分支 ${name}`);
      await this.refresh();
    });
  }

  async renameBranch(name) {
    const next = await this.askText('重命名分支', `将分支“${name}”重命名。`, '新名称', name);
    if (!next || next === name) return;
    await this.run(async () => {
      await this.repo.renameBranch(name, next);
      this.notify(`分支已重命名为 ${next}`);
      await this.refresh();
    });
  }

  async deleteBranch(name) {
    if (!await this.confirm('删除分支', `确定删除分支“${name}”？该分支上的提交仍可能通过其他引用或引用日志访问。`)) return;
    await this.run(async () => {
      await this.repo.deleteBranch(name);
      this.notify(`已删除分支 ${name}`);
      await this.refresh();
    });
  }

  async createTagAt(commitId) {
    const name = await this.askText('新建标签', `在 ${commitId ? shortId(commitId) : '当前提交'} 创建标签。`, '标签名称', this.tagDraft);
    if (!name) return;
    await this.run(async () => {
      await this.repo.createTag(name, commitId ?? null, '');
      this.tagDraft = '';
      this.notify(`已创建标签 #${name}`);
      await this.refresh();
    });
  }

  async createTagFromDraft() {
    const name = this.tagDraft.trim();
    if (!name) { this.notify('请输入标签名称', 'warning'); return; }
    await this.run(async () => {
      await this.repo.createTag(name, this.state?.headId ?? null, '');
      this.tagDraft = '';
      this.notify(`已创建标签 #${name}`);
      await this.refresh();
    });
  }

  async deleteTag(name) {
    if (!await this.confirm('删除标签', `确定删除标签“#${name}”？`)) return;
    await this.run(async () => {
      await this.repo.deleteTag(name);
      this.notify(`已删除标签 #${name}`);
      await this.refresh();
    });
  }

  async mergeRef(ref) {
    if (!ref || !await this.confirmEditorDiscard()) return;
    await this.run(async () => {
      const result = await this.repo.merge(ref, { snapshot: this.snapshot() });
      if (result.type === 'conflict') {
        this.tab = 'branches';
        this.notify(`合并产生 ${result.conflicts.length} 处冲突`, 'warning', 5000);
        await this.refresh();
        return;
      }
      if (result.type === 'up-to-date') { this.notify('已经是最新，无需合并'); await this.refresh(); return; }
      await this.afterSnapshot(result, true);
      this.notify(result.type === 'fast-forward' ? '已快进合并' : `已创建合并提交 ${shortId(result.commit.id)}`);
    });
  }

  async cherryPick(id) {
    if (!await this.confirmEditorDiscard()) return;
    await this.run(async () => {
      const result = await this.repo.cherryPick(id, { snapshot: this.snapshot() });
      if (result.type === 'conflict') { this.tab = 'branches'; this.notify(`拣选产生 ${result.conflicts.length} 处冲突`, 'warning', 5000); await this.refresh(); return; }
      await this.afterSnapshot(result, true);
      this.notify(`已拣选 ${shortId(id)}`);
    });
  }

  async revert(id) {
    if (!await this.confirmEditorDiscard()) return;
    await this.run(async () => {
      const result = await this.repo.revert(id, { snapshot: this.snapshot() });
      if (result.type === 'conflict') { this.tab = 'branches'; this.notify(`回退产生 ${result.conflicts.length} 处冲突`, 'warning', 5000); await this.refresh(); return; }
      await this.afterSnapshot(result, true);
      this.notify(`已创建回退提交 ${shortId(result.commit.id)}`);
    });
  }

  async resetTo(id) {
    const mode = await this.askSelect('重置当前分支', `将当前分支重置到 ${shortId(id)}。`, [['soft', '软重置：只移动分支，保留暂存区与工作区'], ['mixed', '混合重置：移动分支并重置暂存区，保留工作区'], ['hard', '硬重置：移动分支并恢复工作区']], 'mixed');
    if (!mode) return;
    if (mode === 'hard' && !await this.confirmEditorDiscard()) return;
    await this.run(async () => {
      const result = await this.repo.reset(id, mode);
      if (result.snapshot) await this.afterSnapshot(result, true);
      else await this.refresh();
      this.notify(`已${mode === 'hard' ? '硬' : mode === 'soft' ? '软' : '混合'}重置到 ${shortId(id)}`);
    });
  }

  async resolveMerge() {
    if (!await this.confirmEditorDiscard()) return;
    await this.run(async () => {
      const merge = this.repoState.merge;
      const choices = merge.conflicts.map((_, index) => this.mergeChoices.get(index) ?? 'ours');
      const result = await this.repo.resolveMerge(choices);
      await this.afterSnapshot(result, true);
      this.notify(`冲突已解决，提交 ${shortId(result.commit.id)}`);
    });
  }

  async abortMerge() {
    if (!await this.confirm('放弃本次操作', '将清除合并状态并恢复当前分支的版本。')) return;
    if (!await this.confirmEditorDiscard()) return;
    await this.run(async () => {
      const result = await this.repo.abortMerge();
      await this.afterSnapshot(result, true);
      this.notify('已放弃合并');
    });
  }

  async stashPush() {
    await this.run(async () => {
      const result = await this.repo.stashPush(this.snapshot(), this.stashDraft);
      this.stashDraft = '';
      await this.afterSnapshot(result, true);
      this.notify('已储藏当前更改并恢复到 HEAD');
    });
  }

  async stashApply(index) {
    await this.run(async () => {
      try {
        const result = await this.repo.stashApply(index, this.snapshot());
        await this.afterSnapshot(result, true);
        this.notify('已应用储藏');
      } catch (error) {
        if (error.code !== 'STASH_CONFLICT') throw error;
        this.notify(error.message, 'error', 7000);
        this.error = error.conflicts.map(conflict => conflict.path).join('、');
        this.render();
      }
    });
  }

  async stashPop(index) {
    await this.run(async () => {
      try {
        const result = await this.repo.stashPop(index, this.snapshot());
        await this.afterSnapshot(result, true);
        this.notify('已弹出储藏');
      } catch (error) {
        if (error.code !== 'STASH_CONFLICT') throw error;
        this.notify(error.message, 'error', 7000);
        this.error = error.conflicts.map(conflict => conflict.path).join('、');
        this.render();
      }
    });
  }

  async stashDrop(index) {
    if (!await this.confirm('删除储藏', '删除后无法恢复；确定删除这条储藏？')) return;
    await this.run(async () => {
      await this.repo.stashDrop(index);
      this.notify('已删除储藏');
      await this.refresh();
    });
  }

  async exportCommitChart(id) {
    await this.run(async () => {
      const snapshot = await this.repo.readSnapshot((await this.repo.readCommit(id)).tree);
      const stem = String(snapshot.chartName || 'chart.json').replace(/\.json$/i, '');
      const name = `${stem}-${shortId(id)}.json`;
      download(new Blob([serializeChart(snapshot.chart)], { type: 'application/json' }), name);
      this.notify(`已导出 ${name}`);
    });
  }

  async exportCurrentChart() {
    const name = String(this.context.getChartName() || 'chart.json').replace(/[\\/:*?"<>|]/g, '_');
    download(new Blob([serializeChart(this.context.getChart())], { type: 'application/json' }), name);
    this.notify(`已导出 ${name}`);
  }

  async exportBundle() {
    await this.run(async () => {
      const bundle = await this.repo.exportBundle();
      const name = `rpe-next-vcs-${new Date().toISOString().slice(0, 10)}.json`;
      download(new Blob([JSON.stringify(bundle)], { type: 'application/json' }), name);
      this.notify(`已导出仓库包（${bundle.commits.length} 个提交）`);
    });
  }

  async importBundleFile() {
    const file = this.fileInput.files?.[0];
    if (!file) return;
    this.fileInput.value = '';
    await this.run(async () => {
      const bundle = JSON.parse(await file.text());
      const result = await this.repo.importBundle(bundle);
      this.notify(`已导入 ${result.commits} 个提交、${result.branches.length} 个分支、${result.tags.length} 个标签`);
      await this.refresh();
    });
  }

  async gc() {
    if (!await this.confirm('清理不可达对象', '将删除所有仓库中无法从分支、标签、储藏、合并状态或引用日志到达的提交、树和素材对象。此操作不可撤销。')) return;
    await this.run(async () => {
      const result = await this.repo.gc();
      this.notify(`已清理 ${result.removedCommits} 个提交、${result.removedTrees} 个树、${result.removedBlobs} 个对象`);
      await this.refresh();
    });
  }

  async afterSnapshot(result, force) {
    if (result?.snapshot) await this.actions.loadSnapshot?.(result.snapshot, { force });
    await this.refresh();
  }

  confirm(title, description) {
    return new Promise(resolve => {
      showDialog(title, description);
      const modal = document.querySelector('#modal');
      const apply = document.querySelector('#modal-apply');
      let done = false;
      apply.hidden = false;
      apply.textContent = '确认';
      modal.addEventListener('close', () => { if (!done) { done = true; resolve(false); } }, { once: true });
      apply.onclick = () => { done = true; modal.close(); resolve(true); };
    });
  }

  askText(title, description, label, value = '') {
    return new Promise(resolve => {
      const content = showDialog(title, description);
      const input = el('input', { value, attrs: { 'aria-label': label } });
      content.append(el('label', { className: 'vcs-field' }, el('span', { text: label }), input));
      const modal = document.querySelector('#modal');
      const apply = document.querySelector('#modal-apply');
      let done = false;
      apply.hidden = false;
      apply.textContent = '确定';
      modal.addEventListener('close', () => { if (!done) { done = true; resolve(null); } }, { once: true });
      apply.onclick = () => { done = true; modal.close(); resolve(input.value.trim()); };
      input.focus();
      input.select();
    });
  }

  askSelect(title, description, options, value) {
    return new Promise(resolve => {
      const content = showDialog(title, description);
      const select = el('select', { attrs: { 'aria-label': title } });
      for (const [optionValue, label] of options) select.append(new Option(label, optionValue));
      select.value = value;
      content.append(select);
      const modal = document.querySelector('#modal');
      const apply = document.querySelector('#modal-apply');
      let done = false;
      apply.hidden = false;
      apply.textContent = '确定';
      modal.addEventListener('close', () => { if (!done) { done = true; resolve(null); } }, { once: true });
      apply.onclick = () => { done = true; modal.close(); resolve(select.value); };
    });
  }
}
