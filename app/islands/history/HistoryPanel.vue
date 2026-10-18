<script setup lang="ts">
import { ref } from 'vue';
import type { RpenHistoryEntry, RpenHistoryPanelData, RpenHistoryPanelPayload } from '../../bridge';

const props = defineProps<RpenHistoryPanelPayload>();
const entries = ref<RpenHistoryEntry[]>([]);
const current = ref(0);

function render(data: RpenHistoryPanelData) {
  entries.value = data.entries;
  current.value = data.current;
}

defineExpose({ render });
</script>

<template>
  <button v-for="entry in entries" :key="entry.index" type="button" :class="entry.index === current ? 'active' : ''" @click="props.onTravel(entry.index)">{{ `${entry.index === current ? '● ' : ''}${entry.index} · ${entry.label}` }}</button>
</template>
