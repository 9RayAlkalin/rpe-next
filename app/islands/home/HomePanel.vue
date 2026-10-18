<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { RpenHomePanelProps, RpenHomeSummary } from '../../bridge';

const props = defineProps<RpenHomePanelProps>();

const projects = ref<RpenHomeSummary[]>([]);
const visible = ref<RpenHomeSummary[]>([]);
const remaining = ref(0);
const coverUrls = ref<Record<string, string>>({});
const coverCache = new Map<string, Blob>();
let limit = 24;
let observer: IntersectionObserver | null = null;

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

function render() {
  for (const url of Object.values(coverUrls.value)) URL.revokeObjectURL(url);
  coverUrls.value = {};
  const entries = filtered();
  document.getElementById('project-count')!.textContent = `${entries.length} 个项目`;
  document.getElementById('home-empty')!.textContent = entries.length ? '' : '尚无匹配项目。新建后保存，或选择原 RPE 主文件夹迁移项目。';
  visible.value = entries.slice(0, limit);
  remaining.value = Math.max(0, entries.length - limit);
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

function showMore() { limit += 24; render(); }

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

onMounted(() => {
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      observer!.unobserve(entry.target);
      const project = projects.value.find(item => item.id === (entry.target as HTMLElement).dataset.projectId);
      if (project) loadCover(project).catch(() => {});
    }
  }, { rootMargin: '100px' });
  for (const id of ['project-search', 'project-group', 'project-sort', 'show-archived']) document.getElementById(id)!.addEventListener(id === 'project-search' ? 'input' : 'change', onFilterChange);
});

onUnmounted(() => {
  observer?.disconnect();
  for (const url of Object.values(coverUrls.value)) URL.revokeObjectURL(url);
  for (const id of ['project-search', 'project-group', 'project-sort', 'show-archived']) document.getElementById(id)?.removeEventListener(id === 'project-search' ? 'input' : 'change', onFilterChange);
});

defineExpose({ reload });
</script>

<template>
  <article v-for="project in visible" :key="project.id" class="project-card">
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
  <button v-if="remaining" @click="showMore">{{ `显示更多（还有 ${remaining} 个）` }}</button>
</template>
