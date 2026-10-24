import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const FIELD_ROW = /\['([a-z][a-z0-9-]*)', '[^']*', '(?:range|checkbox|number|color)'/g;
const GROUP_ID = /^\s*id: '([a-z][a-z0-9-]*)'/gm;
const ASSIGNED_ID = /\.id = '([a-z][a-z0-9-]*)'/g;
const STATIC_ID = / id="([a-z][a-z0-9-]*)"/g;
const collect = (text, pattern) => [...text.matchAll(pattern)].map(match => match[1]);

test('设置岛屿与旧面板的元素集合和偏好键一一对应', async () => {
  const [legacy, islandFields, islandTemplate, register, app] = await Promise.all([
    read('src/ui/settings.mjs'),
    read('app/islands/settings/fields.ts'),
    read('app/islands/settings/SettingsContent.vue'),
    read('app/islands/settings/register.ts'),
    read('src/ui/app.mjs'),
  ]);
  const legacyIds = new Set([...collect(legacy, FIELD_ROW), ...collect(legacy, ASSIGNED_ID)]);
  const islandIds = new Set([...collect(islandFields, FIELD_ROW), ...collect(islandFields, GROUP_ID), ...collect(islandTemplate, STATIC_ID), ...collect(register, ASSIGNED_ID)]);
  assert.deepEqual([...islandIds].sort(), [...legacyIds].sort(), '岛屿与旧面板的元素集合不一致');

  const islandKeys = new Map([...islandFields.slice(islandFields.indexOf('DISPLAY_KEYS')).matchAll(/'([a-z][a-z0-9-]+)': '([A-Za-z][A-Za-z0-9]*)'/g)].map(match => [match[1], match[2]]));
  const appStart = app.indexOf('const displayFields = [');
  const appBlock = app.slice(appStart, app.indexOf('];', appStart));
  const wired = new Map([...appBlock.matchAll(/\[\'([a-z][a-z0-9-]+)\', \'([A-Za-z][A-Za-z0-9]*)\'/g)].map(match => [match[1], match[2]]));

  for (const [id, key] of wired) {
    if (!legacyIds.has(id)) continue;
    assert.ok(islandKeys.has(id), `面板内字段缺少岛屿绑定：${id}`);
    assert.equal(islandKeys.get(id), key, `字段 ${id} 的偏好键与 app.mjs 不一致`);
  }
  for (const id of islandKeys.keys()) {
    assert.ok(wired.has(id), `岛屿绑定了 app.mjs 未接线的字段：${id}`);
    assert.ok(legacyIds.has(id), `岛屿绑定了旧面板不存在的字段：${id}`);
  }
});
