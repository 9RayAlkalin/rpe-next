import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const IDS = [
  'project-card', 'project-cover', 'project-information', 'project-detail', 'project-credits',
  'project-open primary', 'project-actions', 'project-count', 'home-empty',
  'project-search', 'project-group', 'project-sort', 'show-archived',
  'modal-apply', 'modal-error',
];

const STRINGS = [
  '全部分组',
  '`${entries.length} 个项目`',
  '尚无匹配项目。新建后保存，或选择原 RPE 主文件夹迁移项目。',
  '`${project.level || \'未标难度\'} · ${project.group ?? \'未分组\'} · ${project.notes ?? \'—\'} notes · ${project.lines ?? \'—\'} 条线`',
  '`${project.composer || \'未知曲师\'} / ${project.charter || \'未知谱师\'}`',
  ').toLocaleString()} · ${(project.bytes / 1048576).toFixed(1)} MiB`',
  '`${project.pinned ? \'★ \' : \'\'}${project.name}`',
  '♪',
  '打开谱面',
  '名称 / 分组',
  '取消置顶',
  '置顶',
  '复制',
  '恢复',
  '归档',
  '删除',
  "source: 'Next 项目副本'",
  '`${source.chart.META.name} 副本`',
  '曲绘',
  '显示更多（还有 ',
  ' 个）',
  '此项目不存在，请刷新谱面库',
  '删除项目',
  '`将“${project.name}”移入回收站。可在设置 → 本地存储 → 管理回收站恢复；素材在仍被历史版本引用时保留。`',
  '`永久删除“${project.name}”及其音乐、曲绘等附属资源。归档不会释放空间；删除前建议导出 PEZ。`',
  '同时删除此项目的恢复备份',
  "'移入回收站'",
  "'确认永久删除'",
  '项目名称与分组',
  '修改本地副本信息；原 RPE 文件不变。',
  '项目名称',
  '项目分组名称',
  "'名称'",
  "'分组'",
  '请输入项目名称',
];

test('首页岛屿与旧实现的文案、类名和结构一致', async () => {
  const [legacy, vue, register] = await Promise.all([
    read('src/ui/home.mjs'),
    read('app/islands/home/HomePanel.vue'),
    read('app/islands/home/register.ts'),
  ]);
  const island = `${vue}\n${register}`;
  assert.ok(legacy.includes("document.getElementById('project-cards')"), '旧实现缺少卡片容器引用');
  for (const id of IDS) {
    assert.ok(legacy.includes(id), `旧实现缺少类名/id：${id}`);
    assert.ok(island.includes(id), `岛屿缺少类名/id：${id}`);
  }
  for (const text of STRINGS) {
    assert.ok(legacy.includes(text), `旧实现缺少文案：${text}`);
    assert.ok(island.includes(text), `岛屿缺少文案：${text}`);
  }
});
