<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { RpenMigrationDialogPayload, RpenMigrationEntry, RpenMigrationProject, RpenMigrationResult } from '../../bridge';

interface MigrationChoice {
  project: RpenMigrationProject;
  checked: boolean;
  disabled: boolean;
}

const props = defineProps<RpenMigrationDialogPayload>();

const choices = ref<MigrationChoice[]>(props.plan.projects.map(project => ({ project, checked: !project.error, disabled: Boolean(project.error) })));
const applyConfig = ref(true);
const progress = ref('');
const phase = ref<'idle' | 'running' | 'done'>('idle');
const conflicts = ref<RpenMigrationEntry[] | null>(null);
const conflictRoot = ref<HTMLElement | null>(null);
const report = props.plan.preferences.report;
const summaryText = `可应用：${report.appliedHotkeys.length} 项热键，${report.appliedSettings.join('、') || '默认设置'}。其余 ${report.retainedHotkeys.length} 项热键、${report.retainedSettings.length} 项设置和 UI 布局仅保留；尚未生效。浏览器保留的系统快捷键可能无法覆盖。`;
const busy = computed(() => phase.value === 'running');
const migrateLabel = computed(() => (phase.value === 'done' ? '下载迁移报告' : '迁移选中项目'));
const choiceText = (project: RpenMigrationProject) => ` ${project.name || project.path}${project.error ? ' · ' + project.error : ''}`;

let result: RpenMigrationResult | null = null;
let conflictResolve: ((decision: 'overwrite' | 'skip' | 'cancel') => void) | null = null;

function decide(decision: 'overwrite' | 'skip' | 'cancel') {
  conflicts.value = null;
  const resolve = conflictResolve;
  conflictResolve = null;
  resolve?.(decision);
}

function resolveConflicts(items: RpenMigrationEntry[]) {
  conflicts.value = items;
  return new Promise<'overwrite' | 'skip' | 'cancel'>(resolve => { conflictResolve = resolve; });
}

function onModalClose() { if (conflictResolve) decide('cancel'); }

watch(conflicts, async () => { await nextTick(); conflictRoot.value?.querySelector('button')?.focus(); });

onMounted(() => document.querySelector<HTMLDialogElement>('#modal')?.addEventListener('close', onModalClose));
onUnmounted(() => document.querySelector<HTMLDialogElement>('#modal')?.removeEventListener('close', onModalClose));

async function runMigration() {
  if (phase.value === 'running') return;
  if (phase.value === 'done' && result) { props.helpers.download(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }), 'rpe-migration-report.json'); return; }
  phase.value = 'running';
  for (const choice of choices.value) choice.disabled = true;
  const apply = applyConfig.value;
  const migrationResult: RpenMigrationResult = { source: props.plan.sourceName, imported: [], failed: [...props.plan.failures], preferences: report };
  try {
    const selected = choices.value.filter(choice => choice.checked && !choice.project.error);
    const existing = await props.helpers.listProjects();
    const prepared = props.helpers.migrationConflicts(selected.map(choice => choice.project), existing);
    const found = prepared.filter(entry => entry.existing);
    let overwrite = true;
    if (found.length) {
      const decision = await resolveConflicts(found);
      if (decision === 'cancel') {
        phase.value = 'idle';
        for (const choice of choices.value) choice.disabled = Boolean(choice.project.error);
        progress.value = '已取消，尚未写入项目或设置。';
        return;
      }
      overwrite = decision === 'overwrite';
    }
    if (apply) { await props.helpers.storePreferences(props.plan.preferences); props.applyPreferences(props.plan.preferences); }
    for (const [index, entry] of prepared.entries()) {
      const existingProject = entry.existing;
      if (existingProject && !overwrite) { (migrationResult.skipped ??= []).push({ source: entry.project.path, reason: '标识冲突，用户选择跳过' }); continue; }
      progress.value = `正在迁移 ${index + 1}/${prepared.length}：${entry.project.name}`;
      try {
        const project = await props.helpers.materializeProject(props.plan, entry.project);
        if (existingProject) { project.id = existingProject.id; project.storageRevision = existingProject.storageRevision; }
        else { const previous = await props.helpers.readProjectRevision(project.id); if (previous?.deleted) project.storageRevision = previous.revision; }
        await props.helpers.storeProject(project);
        migrationResult.imported.push({ source: project.source, bytes: project.bytes, overwritten: Boolean(existingProject), extra: entry.project.extra });
      } catch (error) { migrationResult.failed.push({ path: entry.project.path, message: props.helpers.storageFailure(error) }); }
    }
    progress.value = `已迁移 ${migrationResult.imported.length} 个项目，${migrationResult.failed.length} 项未迁移${migrationResult.skipped?.length ? `，跳过 ${migrationResult.skipped.length} 项` : ''}。关闭后点击“谱面库”打开；数据保存在当前浏览器，建议另导出 PEZ。`;
    result = migrationResult;
    phase.value = 'done';
  } catch (error) {
    progress.value = `迁移未完成：${(error as Error).message}`;
  }
}
</script>

<template>
  <label><input v-model="applyConfig" type="checkbox" :disabled="phase !== 'idle'"> 迁移热键及设置</label>
  <p>{{ summaryText }}</p>
  <label v-for="(choice, index) in choices" :key="index" class="choice">
    <input v-model="choice.checked" type="checkbox" :disabled="choice.disabled">{{ choiceText(choice.project) }}
  </label>
  <p>{{ progress }}</p>
  <button type="button" class="primary" :disabled="busy" @click="runMigration">{{ migrateLabel }}</button>
  <section v-if="conflicts" ref="conflictRoot">
    <h3>{{ `${conflicts.length} 个谱面标识已存在` }}</h3>
    <p>覆盖将替换谱面库中对应项目的谱面和资源；跳过则保留原有项目。原 RPE 文件夹不会修改。</p>
    <details :open="conflicts.length <= 8">
      <summary>查看全部冲突项目</summary>
      <ul>
        <li v-for="{ project } in conflicts" :key="project.path">{{ `${project.identifier} · ${project.name}` }}</li>
      </ul>
    </details>
    <button type="button" @click="decide('overwrite')">覆盖同标识谱面</button>
    <button type="button" @click="decide('skip')">跳过重复谱面</button>
    <button type="button" @click="decide('cancel')">取消迁移</button>
  </section>
</template>
