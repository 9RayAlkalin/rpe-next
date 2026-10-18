import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const SHARED = [
  '${entry.index === current ? \'● \' : \'\'}${entry.index} · ${entry.label}',
  '[[\'error\', \'错误\'], [\'warning\', \'警告\'], [\'info\', \'提示\']]',
  'diagnose-group',
  'diagnose-subgroup',
  'diagnose-item',
  '未发现当前检查规则覆盖的问题。',
  '${sub}（${grouped.length}）',
  '${issue.noiseArea !== undefined ? \'噪域 \' + issue.noiseArea : \'Line \' + issue.line} · ${issue.beat} 拍 · ${issue.message}',
  '!issue.path.includes(\'[\') && issue.path !== \'father\'',
  'const top = issue.noiseArea !== undefined ? \'噪域\' : issue.path.startsWith(\'notes[\') ? \'音符\' : issue.path.match(/Events\\[/) ? \'事件\' : \'其他\';',
  'const sub = issue.message.includes(\'超出\') ? \'超界\' : issue.message.includes(\'重叠\') ? \'重叠\' : issue.message.includes(\'时长\') ? \'时长\' : issue.message.includes(\'父线\') ? \'父线\' : \'其他\';',
];

test('检查/历史岛屿与旧实现的文案和分组规则一致', async () => {
  const [legacy, history, diagnose, html] = await Promise.all([
    read('src/ui/app.mjs'),
    read('app/islands/history/HistoryPanel.vue'),
    read('app/islands/diagnose/DiagnosePanel.vue'),
    read('index.html'),
  ]);
  const island = history + diagnose;
  for (const text of SHARED) {
    assert.ok(legacy.includes(text), `旧实现缺少文案：${text}`);
    assert.ok(island.includes(text), `岛屿缺少文案：${text}`);
  }
  assert.ok(html.includes('id="diagnose-results"') && html.includes('id="history-results"'), 'index.html 缺少面板容器');
  assert.ok(legacy.includes('当前可回退的起点'), '旧实现缺少起点标签');
  assert.ok(legacy.includes('details.className = `diagnose-group ${severity}`'), '旧实现分组类名缺失');
  assert.ok(legacy.includes('${title}（${list.length}）'), '旧实现分组标题缺失');
  assert.ok(diagnose.includes('`${group.title}（${group.list.length}）`'), '岛屿分组标题缺失');
  assert.ok(diagnose.includes('`${kind}（${entry.total}）`'), '岛屿类别标题缺失');
});
