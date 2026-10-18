import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const STRINGS = [
  '迁移热键及设置',
  '可应用：${report.appliedHotkeys.length} 项热键，${report.appliedSettings.join(\'、\') || \'默认设置\'}。其余 ${report.retainedHotkeys.length} 项热键、${report.retainedSettings.length} 项设置和 UI 布局仅保留；尚未生效。浏览器保留的系统快捷键可能无法覆盖。',
  ' ${project.name || project.path}${project.error ? \' · \' + project.error : \'\'}',
  '迁移选中项目',
  '下载迁移报告',
  'rpe-migration-report.json',
  '正在迁移 ${index + 1}/${prepared.length}：${entry.project.name}',
  '，跳过 ',
  ' 项未迁移',
  '。关闭后点击“谱面库”打开；数据保存在当前浏览器，建议另导出 PEZ。',
  '已取消，尚未写入项目或设置。',
  '标识冲突，用户选择跳过',
  '迁移未完成：',
  ' 个谱面标识已存在',
  '覆盖将替换谱面库中对应项目的谱面和资源；跳过则保留原有项目。原 RPE 文件夹不会修改。',
  '查看全部冲突项目',
  '${project.identifier} · ${project.name}',
  '覆盖同标识谱面',
  '跳过重复谱面',
  '取消迁移',
];

const ENTRY_STRINGS = [
  '迁移原 RPE 文件夹',
  '发现 ${plan.projects.length} 个谱面项目；${plan.failures.length} 项待处理。选择要复制到本浏览器谱面库的项目。原文件夹只读。音乐、封面及谱面文件夹内附属文件一同保存。',
];

test('迁移岛屿与旧实现的文案一致', async () => {
  const [legacy, island] = await Promise.all([
    read('src/ui/migration-dialog.mjs'),
    read('app/islands/migration/MigrationDialog.vue'),
  ]);
  for (const text of STRINGS) {
    assert.ok(legacy.includes(text), `旧实现缺少文案：${text}`);
    assert.ok(island.includes(text), `迁移岛屿缺少文案：${text}`);
  }
  for (const text of ENTRY_STRINGS) {
    assert.ok(legacy.includes(text), `迁移入口缺少文案：${text}`);
  }
});
