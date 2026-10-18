<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { RpenExportChart, RpenExportDialogPayload, RpenExportHelpers } from '../../bridge';

const props = defineProps<{
  chart: RpenExportChart;
  assets: Map<string, Uint8Array>;
  chartName: string;
  identifier?: string;
  onExport: RpenExportDialogPayload['onExport'];
  helpers: RpenExportHelpers;
}>();

const formats: Array<[string, string]> = [
  ['next:json', 'RPE Next · JSON'],
  ['next:pez', 'RPE Next · PEZ'],
  ['rpe:json', '原 RPE · JSON'],
  ['rpe:pez', '原 RPE · PEZ'],
];

const format = ref('next:pez');
const compact = ref(true);
const acknowledgement = ref(false);
const removeNoise = ref(false);
const removeGlobal = ref(false);
const name = ref('');
const simplify = ref(props.helpers.DEFAULT_TRAJECTORY_SPLIT.simplify);
const tolerance = ref(String(props.helpers.DEFAULT_TRAJECTORY_SPLIT.tolerance));

const noiseIssues = props.helpers.diagnoseNoiseAreas(props.chart.blockAreaList);
const hasNoiseAreas = Boolean(props.chart.blockAreaList?.length);
const hasGlobalEvents = Object.values(props.chart.globalEvents?.types ?? {}).some(type => Object.values(type.columns).some(column => column.events.length));
const isNext = computed(() => format.value.startsWith('next:'));
const defaultStem = props.helpers.chartExportStem(props.chart, props.chartName);

let suggestedStem: string | undefined;
function suggestName() {
  if (suggestedStem !== undefined && name.value !== suggestedStem) return;
  const extension = '.' + format.value.split(':')[1];
  suggestedStem = props.helpers.suggestDownloadName(defaultStem + extension).slice(0, -extension.length);
  name.value = suggestedStem;
}
suggestName();
watch(format, suggestName);

function applyExport() {
  const error = document.querySelector('#modal-error');
  try {
    const [compatibility, container] = format.value.split(':');
    if (noiseIssues.length && !acknowledgement.value) throw new Error('请先阅读并勾选确认噪域检查提示');
    if (compatibility === 'rpe' && hasNoiseAreas && !removeNoise.value) throw new Error('原 RPE 无法表示噪域，请改用 Next 格式，或勾选移除噪域');
    if (compatibility === 'rpe' && hasGlobalEvents && !removeGlobal.value) throw new Error('原 RPE 无法表示全局事件，请改用 Next 格式，或勾选移除全局事件');
    const result = props.helpers.createChartExport(props.chart, props.assets, props.chartName, {
      compatibility, format: container, compact: compact.value, name: name.value, identifier: props.identifier,
      removeNoiseAreas: compatibility === 'rpe' && removeNoise.value,
      removeGlobalEvents: compatibility === 'rpe' && removeGlobal.value,
      split: { simplify: simplify.value, tolerance: Number(tolerance.value) },
    });
    const filename = props.helpers.download(result.blob, result.name);
    document.querySelector<HTMLDialogElement>('#modal')?.close();
    props.onExport(filename, container);
  } catch (failure) {
    if (error) error.textContent = (failure as Error).message;
  }
}

onMounted(() => {
  const apply = document.querySelector<HTMLButtonElement>('#modal-apply');
  if (!apply) return;
  apply.hidden = false;
  apply.textContent = '导出';
  apply.onclick = applyExport;
});
</script>

<template>
  <label class="field">导出格式<select v-model="format" aria-label="导出格式"><option v-for="[value, title] in formats" :key="value" :value="value">{{ title }}</option></select></label>
  <label class="field">压缩 JSON（仅去掉多余空格和换行，保留全部属性）<input v-model="compact" type="checkbox" aria-label="压缩 JSON（仅去掉多余空格和换行，保留全部属性）"></label>
  <div class="noise-export-warning">
    <template v-if="noiseIssues.length">
      <p>噪域检查：{{ noiseIssues.length }} 项。内部事件超出生命周期时仅限制显示，原始时间不会被裁剪。</p>
      <p v-for="(issue, index) in noiseIssues.slice(0, 20)" :key="index">{{ issue.path }}：{{ issue.message }}</p>
    </template>
  </div>
  <label class="field" :hidden="!noiseIssues.length"><input v-model="acknowledgement" type="checkbox">已了解噪域警告，保留原始内部时间后导出</label>
  <label class="field" :hidden="isNext || !hasNoiseAreas"><input v-model="removeNoise" type="checkbox">原 RPE 不支持噪域：仅在导出副本中移除全部噪域</label>
  <label class="field" :hidden="isNext || !hasGlobalEvents"><input v-model="removeGlobal" type="checkbox">原 RPE 不支持全局事件：仅在导出副本中移除全部全局事件</label>
  <label class="field">文件名（不含扩展名）<input v-model="name" aria-label="文件名（不含扩展名）"></label>
  <fieldset :hidden="isNext">
    <legend>整体轨迹兼容转换</legend>
    <label class="field"><input v-model="simplify" type="checkbox" aria-label="以较少的缓动事件近似">以较少的缓动事件近似</label>
    <label class="field">拆分容忍度<input v-model="tolerance" type="number" min="0.001" max="10000" step="any" :disabled="!simplify" aria-label="拆分容忍度"></label>
    <p class="hint">相对原始等分碎事件的每轴最大误差：X/Y 为坐标单位，旋转为度。越小越精确；关闭优化则保留各轨迹设定的全部等分段。</p>
  </fieldset>
</template>
