import { createApp, type ComponentPublicInstance } from 'vue';
import type {
  RpenStorageActions,
  RpenStorageCreatePayload,
  RpenStorageDraft,
  RpenStorageHandles,
  RpenStorageSnapshot,
  RpenStorageTrashProject,
} from '../../bridge';
import { mountContentIsland } from '../host';
import { bytes } from './bytes';
import RecoveryDialog from './RecoveryDialog.vue';
import StoragePanel from './StoragePanel.vue';
import TrashDialog from './TrashDialog.vue';

export function createStoragePanel(payload: RpenStorageCreatePayload): RpenStorageHandles {
  const { host, helpers, native, reportError, canSwitchLibrary, onReminder } = payload;
  let vm: ComponentPublicInstance | null = null;

  const refresh = (): Promise<void> => vm ? (vm as unknown as { refresh(): Promise<void> }).refresh() : Promise.resolve();
  const setStatus = (text: string) => { (vm as unknown as { setStatus(text: string): void } | null)?.setStatus(text); };

  const snapshot = async (): Promise<RpenStorageSnapshot> => {
    const info = await helpers.storageStatus();
    const { last, first } = helpers.readBackupTimestamps();
    const projectCount = (await helpers.listProjects()).length;
    return { ...info, native: helpers.nativeStorage, lastBackup: last, firstLibrary: first, projectCount };
  };

  const closeSettings = () => document.querySelector<HTMLDialogElement>('#settings-modal')?.close();

  const confirmRun = async (title: string, description: string, run: () => Promise<void>) => {
    closeSettings();
    helpers.showDialog(title, description);
    const shell = window.rpenIslands?.dialog?.createDialogShell?.();
    const apply = shell?.apply ?? document.querySelector<HTMLButtonElement>('#modal-apply');
    const modal = shell?.modal ?? document.querySelector<HTMLDialogElement>('#modal');
    const error = shell?.error ?? document.querySelector<HTMLElement>('#modal-error');
    if (!apply || !modal || !error) return;
    apply.hidden = false; apply.textContent = '确认';
    apply.onclick = async () => {
      apply.disabled = true;
      try { await run(); modal.close(); }
      catch (failure) { error.textContent = (failure as Error).message; }
      finally { apply.disabled = false; }
    };
  };

  const actions: RpenStorageActions = {
    persist: async () => {
      const result = await helpers.requestPersistence();
      helpers.notify(result === true ? '已获得持久化存储保护，仍请保留外部备份' : result === false ? '浏览器未批准持久化，可稍后重试；请导出外部备份' : '当前环境不支持持久化申请，请保留外部备份', result === true ? 'success' : 'warning');
      await refresh();
    },
    refreshUsage: () => refresh(),
    exportAll: async () => {
      const result = await helpers.exportLibrary({ progress: (index, count, name) => setStatus(`正在打包外部备份 ${index}/${count}${name ? '：' + name : ''}`) });
      helpers.download(result.blob, `rpe-next-library-${new Date().toISOString().slice(0, 10)}.zip`);
      helpers.noteExternalBackup();
      helpers.notify(`已发起 ${result.count} 个项目的备份下载；请确认下载完成。恢复时解压 ZIP，分别打开其中的 PEZ。`, 'success', 7000);
      await refresh();
    },
    openRoot: async () => { await helpers.nativeCall('openRoot'); },
    moveRoot: () => confirmRun('迁移谱面库', '将完整复制并校验谱面库到所选文件夹下的 RPENLibrary，成功后切换到新位置。原文件夹保留；请等当前保存结束后操作。', async () => {
      setStatus('正在复制并校验谱面库，请稍候…');
      await helpers.flushLocalPreferences();
      const result = await helpers.nativeCall('chooseRoot');
      if (result) helpers.notify('谱面库位置已更新，原文件夹已保留', 'success');
      await refresh();
    }),
    backupFolder: async () => {
      setStatus('正在复制并校验完整谱面库，请稍候…');
      await helpers.flushLocalPreferences();
      const result = await helpers.nativeCall('backupFolder') as { root?: string } | null;
      if (result) { helpers.noteExternalBackup(); helpers.notify('已完成独立备份：' + result.root, 'success', 7000); }
      await refresh();
    },
    manageTrash: async () => {
      closeSettings();
      const dialogHost = helpers.showDialog('谱面库回收站', '恢复会重新加入谱面库；永久删除后可使用“清理无引用素材”释放不再被历史或备份引用的文件。');
      const projects = await helpers.nativeList('projects', true);
      if (!projects.length) { dialogHost.textContent = '回收站为空。'; return; }
      mountContentIsland(createApp(TrashDialog, {
        projects,
        onRestore: async (project: RpenStorageTrashProject) => { await helpers.nativeCall('restore', project.id, project.storageRevision); },
        onPurge: async (project: RpenStorageTrashProject) => { await helpers.nativeCall('purge', project.id, project.storageRevision); },
        reportError,
        refresh: async () => { document.dispatchEvent(new Event('rpen-library-refresh')); await refresh(); },
      }), dialogHost);
    },
    manageRecovery: async () => {
      closeSettings();
      const dialogHost = helpers.showDialog('管理恢复备份', '删除只影响选中的恢复副本，不改变谱面库项目。请先保留需要的外部备份。');
      const drafts = await helpers.listDrafts();
      if (!drafts.length) { dialogHost.textContent = '没有恢复备份。'; return; }
      mountContentIsland(createApp(RecoveryDialog, {
        drafts,
        onDelete: (draft: RpenStorageDraft) => helpers.deleteDraft(draft.id),
        reportError,
        refresh,
      }), dialogHost);
    },
    useRoot: async () => {
      if (!canSwitchLibrary()) return;
      await confirmRun('使用已有谱面库', '选择一个包含 library.json 的完整库或备份文件夹，成功后重新载入并回到谱面库。当前库保留，两个库不会合并；请先保存正在编辑的项目。', async () => {
        await helpers.flushLocalPreferences();
        const result = await helpers.nativeCall('useRoot');
        if (result) helpers.reload();
      });
    },
    rebuild: async () => {
      await helpers.nativeCall('rebuild');
      document.dispatchEvent(new Event('rpen-library-refresh'));
      await refresh();
      helpers.notify('已从项目文件重建索引', 'success');
    },
    collect: () => confirmRun('清理无引用素材', '仅清理没有被项目、保留版本、回收站、恢复记录或皮肤模组引用的素材文件。历史版本仍会保留。', async () => {
      const result = await helpers.nativeCall('collect') as { bytes: number; removed: number };
      helpers.notify(`已释放 ${bytes(result.bytes)}，清理 ${result.removed} 个素材文件`, 'success');
      await refresh();
    }),
  };

  vm = createApp(StoragePanel, { native, reportError, snapshot, onReminder, actions }).mount(host);
  return { refresh, setStatus };
}
