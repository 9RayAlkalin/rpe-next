<script setup lang="ts">
import { ref } from 'vue';
import type { RpenStorageTrashProject } from '../../bridge';

const props = defineProps<{
  projects: RpenStorageTrashProject[];
  onRestore(project: RpenStorageTrashProject): Promise<void>;
  onPurge(project: RpenStorageTrashProject): Promise<void>;
  reportError(error: unknown): void;
  refresh(): Promise<void>;
}>();

const rows = ref<RpenStorageTrashProject[]>(props.projects);
const busy = ref<Set<string>>(new Set());

async function act(project: RpenStorageTrashProject, method: 'restore' | 'purge') {
  busy.value.add(project.id);
  try {
    await (method === 'restore' ? props.onRestore : props.onPurge)(project);
    rows.value = rows.value.filter(entry => entry !== project);
    await props.refresh();
  } catch (error) {
    props.reportError(error);
    busy.value.delete(project.id);
  }
}

function purge(project: RpenStorageTrashProject) { if (confirm(`永久删除“${project.name}”？此操作无法撤销。`)) act(project, 'purge'); }
</script>

<template>
  <div v-for="project in rows" :key="project.id" class="storage-draft-row">
    <span>{{ `${project.name} · ${new Date(project.deletedAt).toLocaleString()}` }}</span>
    <button :disabled="busy.has(project.id)" @click="act(project, 'restore')">恢复</button>
    <button :disabled="busy.has(project.id)" @click="purge(project)">永久删除</button>
  </div>
</template>
