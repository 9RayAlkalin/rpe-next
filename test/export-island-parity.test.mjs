import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const STRINGS = [
  'RPE Next · JSON',
  'RPE Next · PEZ',
  '原 RPE · JSON',
  '原 RPE · PEZ',
  '导出格式',
  '压缩 JSON（仅去掉多余空格和换行，保留全部属性）',
  '已了解噪域警告，保留原始内部时间后导出',
  '原 RPE 不支持噪域：仅在导出副本中移除全部噪域',
  '原 RPE 不支持全局事件：仅在导出副本中移除全部全局事件',
  '文件名（不含扩展名）',
  '整体轨迹兼容转换',
  '以较少的缓动事件近似',
  '拆分容忍度',
  '相对原始等分碎事件的每轴最大误差：X/Y 为坐标单位，旋转为度。越小越精确；关闭优化则保留各轨迹设定的全部等分段。',
  '噪域检查：',
  '请先阅读并勾选确认噪域检查提示',
  '原 RPE 无法表示噪域，请改用 Next 格式，或勾选移除噪域',
  '原 RPE 无法表示全局事件，请改用 Next 格式，或勾选移除全局事件',
  '导出',
  'next:pez',
];

const ENTRY_STRINGS = [
  '导出谱面',
  'Next 格式保留整体曲线轨迹；原 RPE 格式将轨迹转换为普通事件。JSON 只包含谱面，PEZ 同时打包已载入的音乐、图片及其他资源。',
];

test('导出岛屿与旧实现的文案和格式选项一致', async () => {
  const [legacy, island] = await Promise.all([
    read('src/ui/export-dialog.mjs'),
    read('app/islands/export/ExportDialog.vue'),
  ]);
  for (const text of STRINGS) {
    assert.ok(legacy.includes(text), `旧实现缺少文案：${text}`);
    assert.ok(island.includes(text), `导出岛屿缺少文案：${text}`);
  }
  for (const text of ENTRY_STRINGS) {
    assert.ok(legacy.includes(text), `导出入口缺少文案：${text}`);
  }
});
