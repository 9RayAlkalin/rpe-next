<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import type { RpenStoragePanelProps } from '../../bridge';
import { bytes } from './bytes';

const props = defineProps<RpenStoragePanelProps>();
const status = ref('');
const persistDisabled = ref(false);
const busy = reactive<Record<string, boolean>>({});

async function refresh() {
  const info = await props.snapshot();
  status.value = info.native ? `谱面库：${info.root}\n素材 ${bytes(info.usage)}（${info.blobs} 个去重文件） · 磁盘剩余 ${bytes(info.free)} · ${info.projects} 个项目 / 回收站 ${info.trash} 个` : `${info.persistent === true ? '持久化保护已开启' : info.supported ? '尚未获得持久化保护' : '当前环境无法查询持久化状态'} · 已用 ${bytes(info.usage)} / 估计配额 ${bytes(info.quota)}`;
  if (info.native && info.warnings?.length) status.value += '\n' + [...new Set(info.warnings)].join('；');
  persistDisabled.value = info.persistent === true || !globalThis.navigator?.storage?.persist;
  const due = info.firstLibrary > 0 && (!info.lastBackup || Date.now() - info.lastBackup > 7 * 86400000) && info.projectCount > 0;
  let hidden = !due;
  let text = !info.lastBackup ? '尚未记录外部备份。建议导出 PEZ；设置 → 本地存储可一次备份整个谱面库。' : info.native ? '距上次外部备份已超过 7 天，建议备份完整库到其他磁盘或导出 PEZ。' : '距上次发起外部备份已超过 7 天。建议导出 PEZ；自动备份也会随站点数据一同被清除。';
  if (info.quota && info.usage! / info.quota >= .85) { hidden = false; text = '本地存储已使用超过估计配额的 85%，建议先导出备份，再清理不需要的项目或恢复备份。'; }
  props.onReminder({ hidden, text });
}

function setStatus(text: string) { status.value = text; }

async function run(key: string, action: () => Promise<void>) {
  busy[key] = true;
  try { await action(); } catch (error) { props.reportError(error); } finally { busy[key] = false; }
}

let timer: ReturnType<typeof setTimeout> | undefined;
const onStorageChanged = () => { clearTimeout(timer); timer = setTimeout(() => refresh().catch(error => props.reportError(error)), 300); };
const onToggle = (event: Event) => { if ((event.target as HTMLDialogElement).open) refresh().catch(error => props.reportError(error)); };

onMounted(() => {
  document.addEventListener('rpen-storage-changed', onStorageChanged);
  document.querySelector('#settings-modal')?.addEventListener('toggle', onToggle);
  refresh().catch(error => props.reportError(error));
});
onUnmounted(() => {
  clearTimeout(timer);
  document.removeEventListener('rpen-storage-changed', onStorageChanged);
  document.querySelector('#settings-modal')?.removeEventListener('toggle', onToggle);
});

defineExpose({ refresh, setStatus });
</script>

<template>
  <section id="storage-settings">
    <h3>本地存储与外部备份</h3>
    <p id="storage-status" role="status">{{ status }}</p>
    <p class="hint">{{ props.native ? '桌面设置统一保存在当前谱面库的 preferences 目录，更新或移动程序后会自动沿用，无需复制程序文件夹。谱面库使用独立文件与去重素材保存，索引损坏可重建。版本历史随谱面库保存，完整库备份与搬迁会一并包含。恢复记录与回收站仍在库内，请另存独立文件夹备份或 PEZ。首次迁移保留旧数据库。' : '谱面库与自动备份属于同一份站点数据。持久化可降低浏览器回收风险，无法抵御主动清除网站数据；请保留外部 PEZ 备份。不同浏览器或地址的谱面库相互独立。' }}</p>
    <div class="storage-actions">
      <button type="button" id="storage-persist" :hidden="props.native" :disabled="persistDisabled || busy.persist" @click="run('persist', props.actions.persist)">申请持久化保护</button>
      <button type="button" id="storage-refresh" :disabled="busy.refresh" @click="run('refresh', props.actions.refreshUsage)">刷新用量</button>
      <button type="button" id="library-export-all" :disabled="busy.exportAll" @click="run('exportAll', props.actions.exportAll)">导出全部谱面备份</button>
      <button type="button" id="storage-recovery-manage" :disabled="busy.recovery" @click="run('recovery', props.actions.manageRecovery)">管理恢复备份</button>
      <template v-if="props.native">
        <button type="button" id="storage-open-root" :disabled="busy.openRoot" @click="run('openRoot', props.actions.openRoot)">打开谱面库文件夹</button>
        <button type="button" id="storage-move-root" :disabled="busy.moveRoot" @click="run('moveRoot', props.actions.moveRoot)">迁移谱面库位置</button>
        <button type="button" id="storage-backup-folder" :disabled="busy.backupFolder" @click="run('backupFolder', props.actions.backupFolder)">备份完整库到文件夹</button>
        <button type="button" id="storage-trash" :disabled="busy.trash" @click="run('trash', props.actions.manageTrash)">管理回收站</button>
        <button type="button" id="storage-use-root" :disabled="busy.useRoot" @click="run('useRoot', props.actions.useRoot)">使用已有谱面库 / 完整备份</button>
        <button type="button" id="storage-rebuild" :disabled="busy.rebuild" @click="run('rebuild', props.actions.rebuild)">重建库索引</button>
        <button type="button" id="storage-collect" :disabled="busy.collect" @click="run('collect', props.actions.collect)">清理无引用素材</button>
      </template>
    </div>
  </section>
</template>
