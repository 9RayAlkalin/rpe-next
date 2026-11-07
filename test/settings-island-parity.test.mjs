import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('设置岛屿使用上游字段定义，原生事件继续保存偏好并保留搜索导航', async () => {
  const [legacy, template, register, app] = await Promise.all([
    read('src/ui/settings.mjs'), read('app/islands/settings/SettingsContent.vue'),
    read('app/islands/settings/register.ts'), read('src/ui/app.mjs'),
  ]);
  assert.match(legacy, /island\(\{ host: section, fields \}\)/);
  assert.match(register, /createApp\(SettingsContent, \{ fields \}\)/);
  assert.match(template, /v-for="field in fields"/);
  assert.match(template, /field\[2\] === 'select'/);
  assert.match(template, /:id="field\[0\]"/);
  assert.match(legacy, /new SettingsNavigation\(dialog, body\)/);
  assert.match(app, /settingsDialog.dataset.rpenSettingsIsland === 'true'/);
  assert.match(app, /control.addEventListener/);
  for (const id of ['wheel-input-mode', 'xy-binding', 'overlapping-line-picker', 'note-spacing', 'ui-language']) assert.ok(legacy.includes(id), `缺少上游设置：${id}`);
});
