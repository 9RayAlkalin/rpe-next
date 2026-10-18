<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { RpenHomePanelProps, RpenHomeSummary } from '../../bridge';

const props = defineProps<RpenHomePanelProps>();

const OVERSCAN_ROWS = 2;
const FALLBACK_VIEWPORT = 800;
const windowed = ref<RpenHomeSummary[]>([]);
const topHeight = ref(0);
const bottomHeight = ref(0);
const columns = ref(1);
const coverUrls = ref<Record<string, string>>({});
const projects = ref<RpenHomeSummary[]>([]);
const coverCache = new Map<string, Blob>();
let entriesCache: RpenHomeSummary[] = [];
let heights: number[] = [];
let startRow = 0;
let observer: IntersectionObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let scrollScheduled = false;
let measuring = false;

const cardsHost = () => document.getElementById('project-cards') as HTMLElement | null;
const homeHost = () => document.getElementById('home') as HTMLElement | null;
const rowGap = () => { const host = cardsHost(); const gap = host ? Number.parseFloat(getComputedStyle(host).rowGap) : NaN; return Number.isFinite(gap) ? gap : 16; };

function detail(project: RpenHomeSummary) {
  return `${project.level || '未标难度'} · ${project.group ?? '未分组'} · ${project.notes ?? '—'} notes · ${project.lines ?? '—'} 条线`;
}

function credits(project: RpenHomeSummary) {
  return `${project.composer || '未知曲师'} / ${project.charter || '未知谱师'}`;
}

function filtered() {
  const query = (document.getElementById('project-search') as HTMLInputElement).value.trim().toLocaleLowerCase();
  const group = (document.getElementById('project-group') as HTMLSelectElement).value;
  const archived = (document.getElementById('show-archived') as HTMLInputElement).checked;
  const sort = (document.getElementById('project-sort') as HTMLSelectElement).value;
  return projects.value.filter(project => Boolean(project.archived) === archived && (!group || (project.group ?? '未分组') === group) && `${project.name} ${project.charter ?? ''} ${project.group ?? ''}`.toLocaleLowerCase().includes(query))
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || (sort === 'name' ? left.name.localeCompare(right.name) : (right.updated ?? right.imported ?? 0) - (left.updated ?? left.imported ?? 0)));
}

function ensureHeights(rows: number, estimate: number) {
  if (heights.length !== rows) {
    const next = heights.slice(0, rows);
    while (next.length < rows) next.push(estimate);
    heights = next;
  }
}

function updateWindow() {
  const host = cardsHost(); const home = homeHost();
  if (!host || !home) { windowed.value = entriesCache; topHeight.value = 0; bottomHeight.value = 0; return; }
  const rows = Math.ceil(entriesCache.length / columns.value);
  const viewport = home.clientHeight || FALLBACK_VIEWPORT;
  const gridTop = host.getBoundingClientRect().top - home.getBoundingClientRect().top + home.scrollTop;
  const top = Math.max(0, home.scrollTop - gridTop);
  const bottom = top + viewport;
  let acc = 0; let first = 0;
  while (first < rows && acc + (heights[first] ?? 0) <= top) { acc += heights[first] ?? 0; first++; }
  let probe = acc; let last = first;
  while (last < rows && probe < bottom) { probe += heights[last] ?? 0; last++; }
  startRow = Math.max(0, first - OVERSCAN_ROWS);
  const endRow = Math.min(rows, last + OVERSCAN_ROWS);
  let topSum = 0; for (let index = 0; index < startRow; index++) topSum += heights[index] ?? 0;
  let bottomSum = 0; for (let index = endRow; index < rows; index++) bottomSum += heights[index] ?? 0;
  topHeight.value = Math.round(topSum);
  bottomHeight.value = Math.round(bottomSum);
  windowed.value = entriesCache.slice(startRow * columns.value, Math.min(entriesCache.length, endRow * columns.value));
}

async function measure() {
  if (measuring) return;
  measuring = true;
  try {
    await nextTick();
    const host = cardsHost(); const home = homeHost();
    if (!host || !home || home.clientHeight === 0) return;
    const gap = rowGap();
    const hostTop = host.getBoundingClientRect().top;
    const byDelta = new Map<number, number>();
    for (const card of host.querySelectorAll<HTMLElement>(':scope > .project-card')) {
      const delta = Math.round(card.getBoundingClientRect().top - hostTop);
      byDelta.set(delta, Math.max(byDelta.get(delta) ?? 0, card.offsetHeight));
    }
    let changed = false;
    const deltas = [...byDelta.keys()].sort((left, right) => left - right);
    for (let index = 0; index < deltas.length; index++) {
      const row = startRow + index;
      const value = (byDelta.get(deltas[index]) ?? 0) + gap;
      if (heights[row] !== value) { heights[row] = value; changed = true; }
    }
    if (changed) updateWindow();
  } finally {
    measuring = false;
  }
}

function render() {
  for (const url of Object.values(coverUrls.value)) URL.revokeObjectURL(url);
  coverUrls.value = {};
  const host = cardsHost();
  const gap = rowGap();
  if (host) columns.value = Math.max(1, Math.floor((host.clientWidth + gap) / (265 + gap)));
  const entries = filtered();
  entriesCache = entries;
  document.getElementById('project-count')!.textContent = `${entries.length} 个项目`;
  document.getElementById('home-empty')!.textContent = entries.length ? '' : '尚无匹配项目。新建后保存，或选择原 RPE 主文件夹迁移项目。';
  const width = host ? host.clientWidth : 0;
  const columnWidth = width ? (width - (columns.value - 1) * gap) / columns.value : 265;
  const estimate = Math.round(columnWidth * 9 / 16 + 240) + gap;
  ensureHeights(Math.ceil(entries.length / columns.value), estimate);
  updateWindow();
  measure().catch(() => {});
}

async function reload() {
  projects.value = await props.helpers.listProjects();
  const select = document.getElementById('project-group') as HTMLSelectElement;
  const previous = select.value;
  select.replaceChildren(new Option('全部分组', ''));
  for (const group of [...new Set(projects.value.map(project => project.group ?? '未分组'))].sort()) select.append(new Option(group, group));
  select.value = previous;
  render();
}

function onFilterChange() { render(); }

function observeCover(el: unknown, project: RpenHomeSummary) {
  if (!(el instanceof Element) || coverUrls.value[project.id]) return;
  observer?.observe(el);
}

async function loadCover(project: RpenHomeSummary) {
  let summary = project;
  let thumbnail = summary.thumbnail ?? coverCache.get(summary.id) ?? null;
  if (summary.version !== 2) {
    const full = await props.helpers.readProject(summary.id);
    if (full) {
      thumbnail = await props.helpers.projectThumbnail(full);
      summary = props.helpers.projectSummary(full, thumbnail);
      await props.helpers.updateSummary(summary);
      projects.value = projects.value.map(entry => entry.id === summary.id ? summary : entry);
    }
  }
  if (!thumbnail) return;
  coverCache.set(summary.id, thumbnail);
  coverUrls.value = { ...coverUrls.value, [summary.id]: URL.createObjectURL(thumbnail) };
}

function open(project: RpenHomeSummary) { props.openProject(project.id).catch(props.reportError); }
function edit(project: RpenHomeSummary) { props.actions.edit(project).catch(props.reportError); }
function modify(project: RpenHomeSummary, transform: Parameters<RpenHomePanelProps['actions']['modify']>[1]) { props.actions.modify(project.id, transform).catch(props.reportError); }
function remove(project: RpenHomeSummary) { props.actions.remove(project).catch(props.reportError); }
function duplicate(project: RpenHomeSummary) { modify(project, source => ({ ...source, id: crypto.randomUUID(), storageRevision: null, source: 'Next 项目副本', pinned: false, archived: false, chart: { ...source.chart, META: { ...source.chart.META, name: `${source.chart.META.name} 副本` } } })); }

function onScroll() {
  if (scrollScheduled) return;
  scrollScheduled = true;
  requestAnimationFrame(() => {
    scrollScheduled = false;
    updateWindow();
    measure().catch(() => {});
  });
}

function onResize() {
  heights = [];
  render();
}

onMounted(() => {
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      observer!.unobserve(entry.target);
      const project = projects.value.find(item => item.id === (entry.target as HTMLElement).dataset.projectId);
      if (project) loadCover(project).catch(() => {});
    }
  }, { rootMargin: '100px' });
  for (const id of ['project-search', 'project-group', 'project-sort', 'show-archived']) document.getElementById(id)!.addEventListener(id === 'project-search' ? 'input' : 'change', onFilterChange);
  const home = homeHost();
  home?.addEventListener('scroll', onScroll);
  if (home) { resizeObserver = new ResizeObserver(() => onResize()); resizeObserver.observe(home); }
});

onUnmounted(() => {
  observer?.disconnect();
  resizeObserver?.disconnect();
  homeHost()?.removeEventListener('scroll', onScroll);
  for (const url of Object.values(coverUrls.value)) URL.revokeObjectURL(url);
  for (const id of ['project-search', 'project-group', 'project-sort', 'show-archived']) document.getElementById(id)?.removeEventListener(id === 'project-search' ? 'input' : 'change', onFilterChange);
});

defineExpose({ reload });
</script>

<template>
  <div v-if="topHeight" class="project-virtual-spacer" aria-hidden="true" :style="{ height: `${topHeight}px`, gridColumn: '1 / -1' }"></div>
  <article v-for="project in windowed" :key="project.id" class="project-card">
    <div class="project-cover" :data-project-id="project.id" :ref="el => observeCover(el, project)">
      <img v-if="coverUrls[project.id]" :src="coverUrls[project.id]" :alt="`${project.name} 曲绘`">
      <span v-else>♪</span>
    </div>
    <div class="project-information">
      <h2>{{ `${project.pinned ? '★ ' : ''}${project.name}` }}</h2>
      <p class="project-detail">{{ detail(project) }}</p>
      <p class="project-credits" :title="credits(project)">{{ credits(project) }}</p>
      <p>{{ `${new Date(project.updated ?? project.imported ?? NaN).toLocaleString()} · ${(project.bytes / 1048576).toFixed(1)} MiB` }}</p>
      <button class="project-open primary" @click="open(project)">打开谱面</button>
      <div class="project-actions">
        <button @click="edit(project)">名称 / 分组</button>
        <button @click="modify(project, source => ({ ...source, pinned: !source.pinned }))">{{ project.pinned ? '取消置顶' : '置顶' }}</button>
        <button @click="duplicate(project)">复制</button>
        <button @click="modify(project, source => ({ ...source, archived: !source.archived }))">{{ project.archived ? '恢复' : '归档' }}</button>
        <button @click="remove(project)">删除</button>
      </div>
    </div>
  </article>
  <div v-if="bottomHeight" class="project-virtual-spacer" aria-hidden="true" :style="{ height: `${bottomHeight}px`, gridColumn: '1 / -1' }"></div>
</template>
