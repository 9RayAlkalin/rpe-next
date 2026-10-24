import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const CLASSES = [
  'mod-manager', 'mod-manager-heading', 'mod-manager-toolbar', 'mod-manager-body',
  'mod-manager-list', 'mod-manager-details', 'mod-card', 'mod-error', 'mod-source',
];

const STRINGS = [
  '模组管理器',
  '关闭',
  '导入模组包',
  '导入文件夹',
  '禁用全部模组',
  '协议与 API',
  '模组可更改编辑器行为与谱面结构；启用前请保存谱面。',
  '内置模组和导入模组均需手动启用。启用状态与参数保存在本机。',
  '已安装模组',
  '尚无模组',
  '启用模组',
  '禁用模组',
  '导出模组',
  '删除模组',
  '恢复默认参数',
  '操作',
  '包内文件与源码',
  '点击后按下组合键，Backspace 清除',
  '模组协议 API 1',
  '每个包包含 mod.json 和入口 ES 模块，入口导出 activate(api)。支持 package 内多文件导入、完整编辑器对象、提交谱面、事件钩子、界面挂载、预览叠加、快捷键与自动清理。',
  '模组运行于编辑器页面，没有权限沙箱。无法保证任意直接改写都可卸载还原；优先使用 api.patch / api.dispose，异常时禁用并重新载入。',
  '完整协议：protocols/MOD-PROTOCOL.zh-CN.md · API：window.rpenMods.editor · 恢复启动：?mods=off',
  '下载完整协议',
  '下载全局事件协议',
  '下载 API 声明',
  '下载清单 Schema',
  'protocols/MOD-PROTOCOL.zh-CN.md',
  'protocols/GLOBAL-EVENTS-PROTOCOL.zh-CN.md',
  'schemas/mod-api-v1.d.ts',
  'schemas/mod-v1.schema.json',
  'export function activate(api) {',
  "{protocol:'rpen-mod',api:1,id:'example-mod',name:'示例',version:'1.0.0',author:'作者',description:'说明',entry:'main.mjs'}",
];

const LEGACY_ONLY = [
  '模组设置已保存。',
  '模组已装载。',
  '模组已禁用，受管理的资源已清理。',
  '模组已导入，尚未启用。',
  "active?'已装载':this.errors.has(id)?'装载失败':'已禁用'",
  "record.builtin?'内置':'导入'",
  "'依赖：'",
  "'冲突：'",
  '运行中 · 错误 ',
  '恢复启动：本次启动不装载任何模组。',
  '上次装载模组时未完成，已跳过自动装载。请检查后逐个启用。',
  '文档读取失败',
];

test('模组管理器岛屿与旧实现的文案、类名和结构一致', async () => {
  const [legacy, vue, register, main] = await Promise.all([
    read('src/ui/mod-manager.mjs'),
    read('app/islands/mods/ModManagerPanel.vue'),
    read('app/islands/mods/register.ts'),
    read('app/main.ts'),
  ]);
  const island = `${vue}\n${register}`;
  const compact = value => value.replace(/\s+/g, '');
  assert.ok(legacy.includes('createModManagerDialog'), '旧实现缺少岛屿入口');
  assert.ok(main.includes('mods: { createModManagerDialog }'), '主入口未注册模组管理器岛屿');
  assert.ok(register.includes("dialog.id = 'mod-manager'") && register.includes("dialog.className = 'mod-manager'") && register.includes('dataset.modInteractive'), '岛屿未复刻管理器弹窗属性');
  assert.ok(vue.includes('defineExpose'), '岛屿未暴露渲染接口');
  for (const className of CLASSES) {
    assert.ok(legacy.includes(className), `旧实现缺少类名：${className}`);
    assert.ok(island.includes(className), `岛屿缺少类名：${className}`);
  }
  for (const text of STRINGS) {
    assert.ok(compact(legacy).includes(compact(text)), `旧实现缺少文案：${text}`);
    assert.ok(compact(island).includes(compact(text)), `岛屿缺少文案：${text}`);
  }
  for (const text of LEGACY_ONLY) {
    assert.ok(compact(legacy).includes(compact(text)), `旧实现缺少文案：${text}`);
    assert.ok(!compact(island).includes(compact(text)), `岛屿应由旧实现计算该文案：${text}`);
  }
});
