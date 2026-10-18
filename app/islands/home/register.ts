import { createApp, type ComponentPublicInstance } from 'vue';
import HomePanel from './HomePanel.vue';
import type { RpenHomeActions, RpenHomeCreatePayload, RpenHomeHandles } from '../../bridge';

let current: { app: ReturnType<typeof createApp>; vm: (ComponentPublicInstance & { reload(): Promise<void> }) | null } | null = null;

export function createHomePanel(payload: RpenHomeCreatePayload): RpenHomeHandles {
  const { host, ...rest } = payload;
  current?.app.unmount();
  const actions: RpenHomeActions = {
    open: id => payload.openProject(id),
    modify: async (id, transform) => {
      const source = await payload.helpers.readProject(id);
      if (!source) throw new Error('此项目不存在，请刷新谱面库');
      const project = transform(source);
      project.updated = Date.now();
      await payload.helpers.storeProject(project);
      payload.changed(project);
      await current?.vm?.reload();
    },
    edit: async project => {
      const content = payload.helpers.showDialog('项目名称与分组', '修改本地副本信息；原 RPE 文件不变。');
      const name = document.createElement('input'); name.value = project.name; name.setAttribute('aria-label', '项目名称');
      const group = document.createElement('input'); group.value = project.group ?? '未分组'; group.setAttribute('aria-label', '项目分组名称');
      for (const [title, input] of [['名称', name], ['分组', group]] as const) { const label = document.createElement('label'); label.className = 'field'; label.append(title, input); content.append(label); }
      const apply = (document.getElementById('modal-apply') as HTMLButtonElement);
      apply.hidden = false;
      apply.onclick = async () => {
        try {
          if (!name.value.trim()) throw new Error('请输入项目名称');
          await actions.modify(project.id, source => ({ ...source, group: group.value.trim() || '未分组', chart: { ...source.chart, META: { ...source.chart.META, name: name.value.trim() } } }));
          (document.getElementById('modal') as HTMLDialogElement).close();
        } catch (error) { document.getElementById('modal-error')!.textContent = (error as Error).message; }
      };
    },
    remove: async project => {
      const content = payload.helpers.showDialog('删除项目', payload.helpers.nativeStorage ? `将“${project.name}”移入回收站。可在设置 → 本地存储 → 管理回收站恢复；素材在仍被历史版本引用时保留。` : `永久删除“${project.name}”及其音乐、曲绘等附属资源。归档不会释放空间；删除前建议导出 PEZ。`);
      const backups = document.createElement('input'); backups.type = 'checkbox'; backups.setAttribute('aria-label', '同时删除此项目的恢复备份');
      const label = document.createElement('label'); label.className = 'field'; label.append(backups, '同时删除此项目的恢复备份'); content.append(label);
      const apply = (document.getElementById('modal-apply') as HTMLButtonElement);
      apply.hidden = false; apply.textContent = payload.helpers.nativeStorage ? '移入回收站' : '确认永久删除';
      apply.onclick = async () => {
        apply.disabled = true;
        try {
          await payload.helpers.deleteProject(project.id, project.storageRevision);
          payload.changed({ ...project, deleted: true });
          if (backups.checked) await payload.helpers.deleteProjectDrafts(project.id);
          (document.getElementById('modal') as HTMLDialogElement).close(); await current?.vm?.reload();
        } catch (error) { apply.disabled = false; document.getElementById('modal-error')!.textContent = (error as Error).message; }
      };
    },
  };
  const app = createApp(HomePanel, { ...rest, actions });
  const vm = app.mount(host) as unknown as (ComponentPublicInstance & { reload(): Promise<void> }) | null;
  current = { app, vm };
  return { refresh: () => vm?.reload() ?? Promise.resolve() };
}
