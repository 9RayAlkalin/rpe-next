import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, createLine, createNote } from '../src/core/chart.mjs';
import { TempoMap } from '../src/core/tempo.mjs';
import { DEFAULT_EDITOR_PREFERENCES } from '../src/core/default-settings.mjs';
import { HitSounds, hitTimeline } from '../src/platform/hitsounds.mjs';
import { readEditorPreferences, writeEditorPreferences } from '../src/platform/editor-preferences.mjs';

test('三类音效延迟默认零，保存正负值与小数并忽略非有限数值', () => {
  for (const key of ['hitTapDelay', 'hitDragDelay', 'hitFlickDelay']) assert.equal(DEFAULT_EDITOR_PREFERENCES[key], 0);
  let saved;
  const storage = { setItem(key, value) { saved = value; }, getItem() { return saved; } };
  const values = { hitTapDelay: 125, hitDragDelay: -50, hitFlickDelay: 12.5 };
  writeEditorPreferences(values, storage); assert.deepEqual(readEditorPreferences(storage), values);
  writeEditorPreferences({ hitTapDelay: Infinity, hitDragDelay: NaN, hitFlickDelay: '10' }, storage);
  assert.deepEqual(readEditorPreferences(storage), {});
});

test('延迟分别用于 Tap/Hold、Drag 与 Flick，保留自定义音效、倍率、谱面延迟和假音符规则', () => {
  const chart = createChart(); chart.META.offset = 100;
  const line = chart.judgeLineList[0]; line.bpmfactor = 2;
  line.notes = [createNote(1, 1, 0), createNote(2, 1, 0), createNote(4, 1, 0), { ...createNote(3, 1, 0), hitsound: 'custom.ogg' }, { ...createNote(1, 1, 0), isFake: 1 }];
  chart.judgeLineList.push({ ...createLine(), notes: [createNote(3, 4, 0)] });
  const before = structuredClone(chart), tempo = new TempoMap(chart.BPMList);
  const entries = hitTimeline(chart, tempo, { tap: 0.2, drag: -0.1, flick: 0.05 }, 0);
  assert.deepEqual(entries.map(entry => entry.sound), ['drag', 'custom.ogg', 'tap', 'tap']);
  for (const [index, expected] of [1, 1.15, 1.3, 1.3].entries()) assert.ok(Math.abs(entries[index].time - expected) < 1e-9);
  assert.equal(hitTimeline(chart, tempo).length, 5);
  assert.deepEqual(chart, before);
  const legacy = hitTimeline(chart, tempo, [0.2, -0.1], 0);
  assert.ok(Math.abs(legacy.find(entry => entry.sound === 'custom.ogg').time - 1.3) < 1e-9);
});

function scheduler(rate = 1) {
  const sources = [], chart = createChart();
  chart.judgeLineList[0].notes = [createNote(1, 2, 0), createNote(2, 2, 0), createNote(4, 2, 0), createNote(3, 2, 0)];
  const transport = { playing: true, time: 0.85, rate, playRevision: 1, context: { currentTime: 10, createBufferSource() {
    const source = { connect() {}, disconnect() {}, start(at) { this.at = at; sources.push(this); }, stop() { this.stopped = true; } }; return source;
  } } };
  const sounds = new HitSounds(transport); sounds.gain = {};
  for (const kind of ['tap', 'drag', 'flick']) sounds.buffers.set(kind, { kind });
  return { sounds, transport, sources, chart, tempo: new TempoMap(chart.BPMList) };
}

test('提前音效能在音符前调度，延后音效在未来窗口调度，倍速换算正确且不重复', () => {
  for (const rate of [0.5, 1, 2]) {
    const { sounds, transport, sources, chart, tempo } = scheduler(rate);
    const original = structuredClone(chart);
    const beginning = 0.9 - 0.05 * rate; transport.time = beginning;
    sounds.setDelays({ tap: 300, drag: -100, flick: 50 });
    sounds.tick(chart, tempo); sounds.tick(chart, tempo);
    assert.equal(sources.length, 1); assert.equal(sources[0].buffer.kind, 'drag');
    assert.ok(Math.abs(sources[0].at - (10 + (0.9 - beginning) / rate)) < 1e-9);
    transport.time = 1.01; transport.context.currentTime = 10 + (1.01 - beginning) / rate;
    sounds.tick(chart, tempo); assert.equal(sources.length, 2); assert.equal(sources[1].buffer.kind, 'flick');
    assert.ok(Math.abs(sources[1].at - (10 + (1.05 - beginning) / rate)) < 1e-9);
    transport.time = 1.28; transport.context.currentTime = 10 + (1.28 - beginning) / rate;
    sounds.tick(chart, tempo); sounds.tick(chart, tempo);
    assert.deepEqual(sources.map(source => source.buffer.kind), ['drag', 'flick', 'tap', 'tap']);
    for (const source of sources.slice(2)) assert.ok(Math.abs(source.at - (10 + (1.3 - beginning) / rate)) < 1e-9);
    assert.deepEqual(chart, original);
    transport.playing = false; sounds.tick(chart, tempo); assert.ok(sources.every(source => source.stopped));
  }
});

test('修改延迟取消旧调度并重新编译，不变的值保持缓存，跳转后遵循新时间且切谱保留设置', () => {
  const { sounds, transport, sources, chart, tempo } = scheduler();
  transport.time = 0.95; sounds.tick(chart, tempo); assert.equal(sources.length, 4);
  sounds.setDelays({ tap: 300, drag: -100, flick: 50 }); assert.ok(sources.every(source => source.stopped));
  transport.time = 1.27; sounds.tick(chart, tempo); assert.equal(sources.length, 6);
  const entries = sounds.entries;
  sounds.setDelays({ tap: 300, drag: -100, flick: 50 });
  sounds.tick(chart, tempo); assert.equal(sounds.entries, entries); assert.equal(sources.length, 6);
  transport.time = 0.85; transport.playRevision++; sounds.tick(chart, tempo);
  assert.equal(sources.at(-1).buffer.kind, 'drag'); assert.ok(sources.slice(0, 6).every(source => source.stopped));
  sounds.setProject(chart, new Map(), 'chart.json');
  assert.deepEqual(sounds.delays, { tap: 300, drag: -100, flick: 50 });
});
