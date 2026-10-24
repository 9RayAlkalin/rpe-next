import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const IDS = [
  'storage-settings', 'storage-status', 'storage-persist', 'storage-refresh', 'library-export-all',
  'storage-recovery-manage', 'storage-open-root', 'storage-move-root', 'storage-backup-folder',
  'storage-trash', 'storage-use-root', 'storage-rebuild', 'storage-collect',
  'storage-actions', 'storage-draft-row',
];

const STRINGS = [
  '本地存储与外部备份',
  '申请持久化保护',
  '刷新用量',
  '导出全部谱面备份',
  '管理恢复备份',
  '打开谱面库文件夹',
  '迁移谱面库位置',
  '备份完整库到文件夹',
  '管理回收站',
  '使用已有谱面库 / 完整备份',
  '重建库索引',
  '清理无引用素材',
  '谱面库与自动备份属于同一份站点数据。持久化可降低浏览器回收风险，无法抵御主动清除网站数据；请保留外部 PEZ 备份。不同浏览器或地址的谱面库相互独立。',
  '桌面设置统一保存在当前谱面库的 preferences 目录，更新或移动程序后会自动沿用，无需复制程序文件夹。谱面库使用独立文件与去重素材保存，索引损坏可重建。版本历史随谱面库保存，完整库备份与搬迁会一并包含。恢复记录与回收站仍在库内，请另存独立文件夹备份或 PEZ。首次迁移保留旧数据库。',
  '谱面库：${info.root}\\n素材 ${bytes(info.usage)}（${info.blobs} 个去重文件） · 磁盘剩余 ${bytes(info.free)} · ${info.projects} 个项目 / 回收站 ${info.trash} 个',
  '${info.persistent === true ? \'持久化保护已开启\' : info.supported ? \'尚未获得持久化保护\' : \'当前环境无法查询持久化状态\'} · 已用 ${bytes(info.usage)} / 估计配额 ${bytes(info.quota)}',
  '[...new Set(info.warnings)].join(\'；\')',
  '尚未记录外部备份。建议导出 PEZ；设置 → 本地存储可一次备份整个谱面库。',
  '距上次外部备份已超过 7 天，建议备份完整库到其他磁盘或导出 PEZ。',
  '距上次发起外部备份已超过 7 天。建议导出 PEZ；自动备份也会随站点数据一同被清除。',
  '本地存储已使用超过估计配额的 85%，建议先导出备份，再清理不需要的项目或恢复备份。',
  '已获得持久化存储保护，仍请保留外部备份',
  '浏览器未批准持久化，可稍后重试；请导出外部备份',
  '当前环境不支持持久化申请，请保留外部备份',
  '正在打包外部备份 ${index}/${count}${name ? \'：\' + name : \'\'}',
  '迁移谱面库',
  '将完整复制并校验谱面库到所选文件夹下的 RPENLibrary，成功后切换到新位置。原文件夹保留；请等当前保存结束后操作。',
  '正在复制并校验谱面库，请稍候…',
  '谱面库位置已更新，原文件夹已保留',
  '正在复制并校验完整谱面库，请稍候…',
  '已完成独立备份：',
  '使用已有谱面库',
  '选择一个包含 library.json 的完整库或备份文件夹，成功后重新载入并回到谱面库。当前库保留，两个库不会合并；请先保存正在编辑的项目。',
  '已从项目文件重建索引',
  '仅清理没有被项目、保留版本、回收站、恢复记录或皮肤模组引用的素材文件。历史版本仍会保留。',
  '已释放 ${bytes(result.bytes)}，清理 ${result.removed} 个素材文件',
  '确认',
  '谱面库回收站',
  '恢复会重新加入谱面库；永久删除后可使用“清理无引用素材”释放不再被历史或备份引用的文件。',
  '永久删除“${project.name}”？此操作无法撤销。',
  '${project.name} · ${new Date(project.deletedAt).toLocaleString()}',
  '删除只影响选中的恢复副本，不改变谱面库项目。请先保留需要的外部备份。',
  '永久删除这份恢复备份？',
  '${draft.title || draft.name} · ${new Date(draft.updated).toLocaleString()}',
  '删除此备份',
  '回收站为空。',
  '没有恢复备份。',
];

test('存储面板岛屿与旧实现的文案、id 和状态模板一致', async () => {
  const [legacy, ...islandFiles] = await Promise.all([
    read('src/ui/storage-panel.mjs'),
    read('app/islands/storage/StoragePanel.vue'),
    read('app/islands/storage/register.ts'),
    read('app/islands/storage/TrashDialog.vue'),
    read('app/islands/storage/RecoveryDialog.vue'),
  ]);
  const island = islandFiles.join('\n');
  assert.ok(legacy.includes('storage-backup-reminder'), '旧实现缺少备份提醒条');
  for (const id of IDS) {
    assert.ok(legacy.includes(id), `旧实现缺少 id/class：${id}`);
    assert.ok(island.includes(id), `岛屿缺少 id/class：${id}`);
  }
  for (const text of STRINGS) {
    assert.ok(legacy.includes(text), `旧实现缺少文案：${text}`);
    assert.ok(island.includes(text), `岛屿缺少文案：${text}`);
  }
});
