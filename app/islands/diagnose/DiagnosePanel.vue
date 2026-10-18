<script setup lang="ts">
import { computed, ref } from 'vue';
import type { RpenDiagnoseIssue, RpenDiagnosePanelData, RpenDiagnosePanelPayload } from '../../bridge';

const props = defineProps<RpenDiagnosePanelPayload>();
const issues = ref<RpenDiagnoseIssue[]>([]);
const visible = ref(true);

function render(data: RpenDiagnosePanelData) {
  issues.value = data.issues;
  visible.value = data.visible;
}

defineExpose({ render });

const category = (issue: RpenDiagnoseIssue) => {
  const top = issue.noiseArea !== undefined ? '噪域' : issue.path.startsWith('notes[') ? '音符' : issue.path.match(/Events\[/) ? '事件' : '其他';
  const sub = issue.message.includes('超出') ? '超界' : issue.message.includes('重叠') ? '重叠' : issue.message.includes('时长') ? '时长' : issue.message.includes('父线') ? '父线' : '其他';
  return [top, sub];
};

const groups = computed(() => [['error', '错误'], ['warning', '警告'], ['info', '提示']].map(([severity, title]) => {
  const list = issues.value.filter(issue => issue.severity === severity && (visible.value || severity !== 'info'));
  const kinds = new Map<string, { total: number; subs: Map<string, RpenDiagnoseIssue[]> }>();
  for (const issue of list) {
    const [kind, sub] = category(issue);
    if (!kinds.has(kind)) kinds.set(kind, { total: 0, subs: new Map() });
    const entry = kinds.get(kind)!;
    entry.total += 1;
    if (!entry.subs.has(sub)) entry.subs.set(sub, []);
    entry.subs.get(sub)!.push(issue);
  }
  return { severity, title, list, kinds: [...kinds.entries()] };
}));
</script>

<template>
  <details v-for="group in groups" :key="group.severity" class="diagnose-group" :class="group.severity" open>
    <summary>{{ `${group.title}（${group.list.length}）` }}</summary>
    <details v-for="[kind, entry] in group.kinds" :key="kind" class="diagnose-subgroup" open>
      <summary>{{ `${kind}（${entry.total}）` }}</summary>
      <details v-for="[sub, grouped] in entry.subs" :key="sub" class="diagnose-subgroup" open>
        <summary>{{ `${sub}（${grouped.length}）` }}</summary>
        <div v-for="(issue, index) in grouped" :key="index" class="diagnose-item" :class="group.severity">
          <button type="button" @click="props.onLocate(issue)">{{ `${issue.noiseArea !== undefined ? '噪域 ' + issue.noiseArea : 'Line ' + issue.line} · ${issue.beat} 拍 · ${issue.message}` }}</button>
          <button type="button" :disabled="!issue.path.includes('[') && issue.path !== 'father'" @click="props.onDelete(issue)">删除</button>
        </div>
      </details>
    </details>
  </details>
  <p v-if="!issues.length" class="hint">未发现当前检查规则覆盖的问题。</p>
</template>
