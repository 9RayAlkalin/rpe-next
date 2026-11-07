<script setup lang="ts">
import { computed, ref } from 'vue';
import type { RpenDiagnoseIssue, RpenDiagnosePanelData, RpenDiagnosePanelPayload } from '../../bridge';

const props = defineProps<RpenDiagnosePanelPayload>();
const { t, diagnosticSubtype } = props;
const issues = ref<RpenDiagnoseIssue[]>([]);
const visible = ref(true);
const limits = ref<Record<string, number>>({});

function render(data: RpenDiagnosePanelData) {
  issues.value = data.issues;
  visible.value = data.visible;
}

defineExpose({ render });

const category = (issue: RpenDiagnoseIssue) => {
  const top = t(issue.asset ? 'diag.resources' : issue.target ? 'diag.compatibility' : issue.globalType ? 'app.s895a20e' : issue.noiseArea !== undefined ? 'app.s81b3bb2' : issue.path.startsWith('notes[') ? 'app.s7ac3289' : issue.eventType || /Events\[|effects\./.test(issue.path) ? 'app.s550e328' : 'app.s1a26edf');
  const sub = diagnosticSubtype(issue);
  return [top, sub];
};

const groups = computed(() => [['error', t('app.sb859c7b')], ['warning', t('app.s5521e36')], ['info', t('app.sab3656a')]].map(([severity, title]) => {
  const list = issues.value.filter(issue => issue.severity === severity && (visible.value || severity !== 'info'));
  const kinds = new Map<string, { total: number; subs: Map<string, RpenDiagnoseIssue[]> }>();
  for (const issue of list.slice(0, limits.value[severity] ?? 80)) {
    const [kind, sub] = category(issue);
    if (!kinds.has(kind)) kinds.set(kind, { total: 0, subs: new Map() });
    const entry = kinds.get(kind)!;
    entry.total += 1;
    if (!entry.subs.has(sub)) entry.subs.set(sub, []);
    entry.subs.get(sub)!.push(issue);
  }
  return { severity, title, list, kinds: [...kinds.entries()], remaining: Math.max(0, list.length - (limits.value[severity] ?? 80)) };
}));
</script>

<template>
  <details v-for="group in groups" v-show="visible || group.severity !== 'info'" :key="group.severity" class="diagnose-group" :class="group.severity" open>
    <summary>{{ `${group.title}（${group.list.length}）` }}</summary>
    <details v-for="[kind, entry] in group.kinds" :key="kind" class="diagnose-subgroup" open>
      <summary>{{ `${kind}（${entry.total}）` }}</summary>
      <details v-for="[sub, grouped] in entry.subs" :key="sub" class="diagnose-subgroup" open>
        <summary>{{ `${sub}（${grouped.length}）` }}</summary>
        <div v-for="(issue, index) in grouped" :key="index" class="diagnose-item" :class="group.severity" :data-diagnostic-code="issue.code ?? ''">
          <button type="button" class="diagnose-locate" @click="props.onLocate(issue)">{{ `${issue.asset ?? (issue.globalType ? issue.globalType + (issue.globalColumn ? '/' + issue.globalColumn : '') : issue.noiseArea !== undefined ? t('app.s3a2d2c2') + issue.noiseArea : '#' + (issue.line ?? 0))} · ${Number(issue.beat ?? 0).toFixed(2)} · ${issue.message}` }}</button>
          <button v-if="issue.removable || issue.code === undefined && issue.path.startsWith('blockAreaList[')" type="button" @click="props.onDelete(issue)">{{ t('app.s3755f56') }}</button>
        </div>
      </details>
    </details>
    <button v-if="group.remaining" type="button" class="wide-button" @click="limits[group.severity] = (limits[group.severity] ?? 80) + 80">{{ t('diag.more', { count: group.remaining }) }}</button>
  </details>
  <p v-if="!issues.length" class="hint">{{ t('app.sad38555') }}</p>
</template>
