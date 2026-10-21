import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart } from '../src/core/chart.mjs';
import { applyMergeResolutions, canonicalJson, deepEqual, mergeCharts, resolveChartMerge, sha256Hex } from '../src/core/chart-vcs.mjs';
import { ChartRepository } from '../src/application/chart-vcs.mjs';
import { createMemoryVersionStore } from '../src/platform/version-store.mjs';

const marker = 'rpenVcsSecurityTestMarker';
const ownData = (object, key, value) => Object.defineProperty(object, key, { value, enumerable: true, configurable: true, writable: true });
const snapshot = chart => ({ chart, assets: new Map(), folders: [], chartName: 'chart.json' });
const repository = (store = createMemoryVersionStore(), id = 'security-test') => {
  let timestamp = 1;
  return new ChartRepository(store, id, { now: () => timestamp++ });
};
const chartWithData = (name, key, value) => {
  const chart = createChart(); chart.META.name = name;
  ownData(chart, key, { [marker]: value });
  return chart;
};

test('规范化、比较与内容哈希保留所有自有 JSON 键，包括嵌套 __proto__', async () => {
  const value = JSON.parse('{"a":1,"__proto__":{"nested":[{"__proto__":null}]},"constructor":{"prototype":{"data":2}}}');
  const normalized = JSON.parse(canonicalJson(value));
  assert.deepEqual(normalized, value); assert.ok(Object.hasOwn(normalized, '__proto__'));
  assert.ok(Object.hasOwn(normalized.__proto__.nested[0], '__proto__'));
  const clean = { a: 1, constructor: { prototype: { data: 2 } } };
  assert.equal(deepEqual(value, clean), false);
  assert.notEqual(await sha256Hex(canonicalJson(value)), await sha256Hex(canonicalJson(clean)));
  assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
});

test('特殊名称作为普通谱面字段参与三路合并，结果仍有普通原型且没有字段丢失', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const base = chartWithData('same', key, 'base'), ours = chartWithData('same', key, 'ours'), theirs = chartWithData('same', key, 'theirs');
    const merged = mergeCharts(base, ours, theirs);
    assert.equal(merged.conflicts.length, 1); assert.deepEqual(merged.conflicts[0].pathArray, [key, marker]);
    assert.ok(Object.hasOwn(merged.chart, key)); assert.equal(Object.getPrototypeOf(merged.chart), Object.prototype);
    for (const choice of ['ours', 'theirs']) {
      const direct = applyMergeResolutions(merged.chart, merged.conflicts, [choice]);
      const resolved = resolveChartMerge(base, ours, theirs, [choice]);
      for (const chart of [direct, resolved]) {
        assert.ok(Object.hasOwn(chart, key)); assert.equal(chart[key][marker], choice);
        assert.equal(Object.getPrototypeOf(chart), Object.prototype);
      }
    }
  }
  assert.equal(Object.hasOwn(Object.prototype, marker), false);
});

test('新增特殊字段不使用继承属性作为共同祖先，也不改变合并结果的原型', () => {
  const base = createChart(), ours = chartWithData('ours', '__proto__', 'ours'), theirs = chartWithData('theirs', 'constructor', 'theirs');
  const result = mergeCharts(base, ours, theirs), selected = resolveChartMerge(base, ours, theirs, result.conflicts.map(() => 'theirs'));
  assert.equal(result.conflicts.length, 1); assert.equal(result.conflicts[0].path, 'META.name');
  assert.ok(Object.hasOwn(selected, '__proto__')); assert.ok(Object.hasOwn(selected, 'constructor'));
  assert.equal(selected.__proto__[marker], 'ours'); assert.equal(selected.constructor[marker], 'theirs');
  assert.equal(Object.getPrototypeOf(selected), Object.prototype); assert.equal(Object.hasOwn(Object.prototype, marker), false);
});

test('冲突路径只能沿自有属性行走，缺失的 __proto__ 和 constructor 路径创建本地数据', () => {
  const originalConstructor = Object.prototype.constructor;
  for (const path of [['__proto__', marker], ['constructor', 'prototype', marker], ['nested', '__proto__', marker], ['nested', 'constructor', 'prototype', marker]]) {
    const result = applyMergeResolutions({}, [{ pathArray: path, ours: 'local data', theirs: 'other data' }], ['ours']);
    let current = result;
    for (const key of path) { assert.ok(Object.hasOwn(current, key)); current = current[key]; }
    assert.equal(current, 'local data'); assert.equal(Object.getPrototypeOf(result), Object.prototype);
  }
  const leaf = applyMergeResolutions({}, [{ pathArray: ['__proto__'], ours: { [marker]: 'leaf' } }], ['ours']);
  assert.ok(Object.hasOwn(leaf, '__proto__')); assert.equal(leaf.__proto__[marker], 'leaf');
  assert.equal(Object.getPrototypeOf(leaf), Object.prototype); assert.equal(Object.prototype.constructor, originalConstructor);
  assert.equal(Object.hasOwn(Object.prototype, marker), false);
});

test('删除冲突不读取继承对象，也不删除继承对象的数组项目', () => {
  assert.equal(Object.hasOwn(Object.prototype, marker), false);
  const inherited = { items: [1, 2], value: 'retained' };
  Object.defineProperty(Object.prototype, marker, { value: inherited, configurable: true });
  try {
    const conflicts = [['__proto__', marker], ['__proto__', marker, 'value'], ['__proto__', marker, 'items', 0]].map(pathArray => ({ pathArray, oursPresent: false }));
    applyMergeResolutions({}, conflicts, conflicts.map(() => 'ours'));
    assert.equal(Object.prototype[marker], inherited); assert.deepEqual(inherited, { items: [1, 2], value: 'retained' });
    const local = JSON.parse('{"__proto__":{"items":[1,2]}}');
    const removed = applyMergeResolutions(local, [{ pathArray: ['__proto__', 'items', 0], oursPresent: false }], ['ours']);
    assert.deepEqual(removed.__proto__.items, [2]); assert.deepEqual(local.__proto__.items, [1, 2]);
  } finally { delete Object.prototype[marker]; }
});

test('真实仓库包导入、产生冲突并解决后，特殊字段完整保存且不污染全局原型', async () => {
  assert.equal(Object.hasOwn(Object.prototype, marker), false);
  try {
    const source = repository();
    await source.init(); await source.stage(snapshot(chartWithData('base', '__proto__', 'base'))); await source.commit({ message: 'base' });
    await source.createBranch('feature'); await source.checkoutBranch('feature');
    await source.stage(snapshot(chartWithData('theirs', '__proto__', 'theirs'))); await source.commit({ message: 'feature' });
    await source.checkoutBranch('main'); await source.stage(snapshot(chartWithData('ours', '__proto__', 'ours'))); await source.commit({ message: 'main' });
    const bundle = JSON.parse(JSON.stringify(await source.exportBundle()));
    const imported = repository(createMemoryVersionStore(), 'imported'); await imported.init(); await imported.importBundle(bundle);
    const result = await imported.merge('feature');
    assert.ok(result.conflicts.some(conflict => conflict.pathArray[0] === '__proto__'));
    const resolved = await imported.resolveMerge(result.conflicts.map(() => 'theirs'));
    assert.ok(Object.hasOwn(resolved.snapshot.chart, '__proto__')); assert.equal(resolved.snapshot.chart.__proto__[marker], 'theirs');
    assert.equal(Object.getPrototypeOf(resolved.snapshot.chart), Object.prototype);
    assert.equal(({})[marker], undefined); assert.equal(Object.hasOwn(Object.prototype, marker), false);
    assert.equal((await imported.headSnapshot()).chart.__proto__[marker], 'theirs');
  } finally { delete Object.prototype[marker]; }
});

test('仓库包树新增 __proto__ 不能绕过内容哈希校验', async () => {
  const source = repository(); await source.init(); await source.stage(snapshot(createChart())); await source.commit({ message: 'initial' });
  const bundle = JSON.parse(JSON.stringify(await source.exportBundle()));
  ownData(bundle.trees[0], '__proto__', { [marker]: 'tampered' });
  const target = repository(createMemoryVersionStore(), 'target'); await target.init();
  await assert.rejects(target.importBundle(bundle), /树对象校验失败/);
  assert.equal((await target.log()).length, 0); assert.equal(Object.hasOwn(Object.prototype, marker), false);
});

test('分支和标签的特殊名称是自有数据，创建、重命名、提交与仓库包往返保持有效', async () => {
  const source = repository(); await source.init(); await source.stage(snapshot(createChart())); await source.commit({ message: 'initial' });
  await source.createBranch('__proto__'); await source.checkoutBranch('__proto__');
  const changed = createChart(); changed.META.name = 'changed'; await source.stage(snapshot(changed));
  const committed = await source.commit({ message: 'special branch' });
  let state = await source.read(); assert.ok(Object.hasOwn(state.branches, '__proto__')); assert.equal(state.branches.__proto__, committed.commit.id);
  await source.renameBranch('__proto__', 'constructor'); await source.createBranch('__proto__'); await source.createBranch('prototype');
  await source.createTag('__proto__'); await source.createTag('constructor'); await source.createTag('prototype');
  state = await source.read(); assert.equal(state.head.name, 'constructor'); assert.equal(source.resolveHead(state), committed.commit.id);
  for (const refs of [state.branches, state.tags]) {
    for (const name of ['__proto__', 'constructor', 'prototype']) assert.ok(Object.hasOwn(refs, name));
    assert.equal(Object.getPrototypeOf(refs), Object.prototype);
  }
  const target = repository(createMemoryVersionStore(), 'target'); await target.init();
  await target.importBundle(JSON.parse(JSON.stringify(await source.exportBundle())));
  const restored = await target.read();
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    assert.ok(Object.hasOwn(restored.branches, name)); assert.ok(Object.hasOwn(restored.tags, name));
    assert.ok(await target.readCommit(restored.branches[name]));
  }
  await target.checkoutBranch('__proto__'); assert.equal((await target.headSnapshot()).chart.META.name, 'changed');
  assert.equal(source.resolveHead({ head: { type: 'branch', name: 'toString' }, branches: {} }), null);
  assert.equal(Object.getPrototypeOf(restored.tags), Object.prototype); assert.equal(Object.hasOwn(Object.prototype, marker), false);
});
