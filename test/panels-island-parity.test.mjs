import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('检查岛屿接入上游诊断控制器并保留分页、资源定位和删除限制', async () => {
  const [controller, diagnose, app, html] = await Promise.all([
    read('src/ui/diagnostics-panel.mjs'), read('app/islands/diagnose/DiagnosePanel.vue'),
    read('src/ui/app.mjs'), read('index.html'),
  ]);
  assert.match(controller, /this.island.render\(\{ issues: c.issues/);
  assert.match(controller, /onLocate: locate, onDelete: remove/);
  for (const field of ['issue.asset', 'issue.globalType', 'issue.removable', 'issue.code', 'diagnosticSubtype', 'limits']) assert.ok(diagnose.includes(field), `诊断岛屿缺少 ${field}`);
  assert.match(app, /historyIslandHandle/);
  assert.ok(html.includes('id="diagnose-results"') && html.includes('id="history-results"'));
});
