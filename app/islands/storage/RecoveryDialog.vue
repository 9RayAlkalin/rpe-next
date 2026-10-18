<script setup lang="ts">
import { ref } from 'vue';
import type { RpenStorageDraft } from '../../bridge';

const props = defineProps<{
  drafts: RpenStorageDraft[];
  onDelete(draft: RpenStorageDraft): Promise<void>;
  reportError(error: unknown): void;
  refresh(): Promise<void>;
}>();

const rows = ref<RpenStorageDraft[]>(props.drafts);
const busy = ref<Set<string>>(new Set());

async function remove(draft: RpenStorageDraft) {
  if (!confirm('永久删除这份恢复备份？')) return;
  busy.value.add(draft.id);
  try {
    await props.onDelete(draft);
    rows.value = rows.value.filter(entry => entry !== draft);
    await props.refresh();
  } catch (error) {
    busy.value.delete(draft.id);
    props.reportError(error);
  }
}
</script>

<template>
  <div v-for="draft in rows" :key="draft.id" class="storage-draft-row">
    <span>{{ `${draft.title || draft.name} · ${new Date(draft.updated).toLocaleString()}` }}</span>
    <button type="button" :disabled="busy.has(draft.id)" @click="remove(draft)">删除此备份</button>
  </div>
</template>
