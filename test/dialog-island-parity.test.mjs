import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const TAG_ID = /<(dialog|form|h2|p|div|button)\b[^>]*\bid="([^"]+)"/g;
const tagMap = text => new Map([...text.matchAll(TAG_ID)].map(match => [match[2], match[1]]));

test('弹窗岛屿外壳与 index.html 的 #modal 结构一致', async () => {
  const [html, shell, dialog] = await Promise.all([
    read('index.html'),
    read('app/islands/dialog/DialogShell.vue'),
    read('src/ui/dialog.mjs'),
  ]);
  const start = html.indexOf('<dialog id="modal">');
  const end = html.indexOf('</dialog>', start);
  assert.ok(start >= 0 && end > start, 'index.html 缺少 #modal');
  const legacyFragment = html.slice(start, end);
  const legacy = tagMap(legacyFragment);
  const island = tagMap(shell);
  legacy.delete('modal');
  assert.deepEqual([...island].sort(), [...legacy].sort(), '弹窗外壳元素集合不一致');

  for (const fragment of [legacyFragment, shell]) {
    assert.match(fragment, /<form method="dialog">/);
    assert.equal([...fragment.matchAll(/formnovalidate/g)].length, 2, '取消按钮缺少 formnovalidate');
    assert.match(fragment, /<button id="modal-delete" type="button" hidden>删除<\/button>/);
    assert.match(fragment, /<button id="modal-apply" type="button" class="primary">应用<\/button>/);
  }

  for (const id of ['modal-title', 'modal-description']) assert.match(dialog, new RegExp(`#${id}`), `dialog.mjs 未引用 #${id}`);
});
