import test from 'node:test';
import assert from 'node:assert/strict';
import { intervalSelection, extendIntervalSelection, validSelectionInterval } from '../src/core/selection-interval.mjs';
import { DEFAULT_EDITOR_PREFERENCES } from '../src/core/default-settings.mjs';
import { normalizeEditorPreferences } from '../src/platform/editor-preferences.mjs';
import { createChart, createLine, createNote, createEvent } from '../src/core/chart.mjs';
import { createNoiseArea, createNoiseEvent } from '../src/core/noise-areas.mjs';
import { EditorSession } from '../src/application/session.mjs';
import { Timeline } from '../src/ui/timeline.mjs';
import { NoiseAreaEditor } from '../src/ui/noise-area.mjs';

test('间隔多选默认连续选择，只接受大于等于 1 的安全整数并可持久化', () => {
  assert.equal(DEFAULT_EDITOR_PREFERENCES.selectionInterval, 1);
  for (const value of [1, 2, 999, Number.MAX_SAFE_INTEGER]) {
    assert.equal(validSelectionInterval(value), true);
    assert.deepEqual(normalizeEditorPreferences({ selectionInterval: value }), { selectionInterval: value });
  }
  for (const value of [0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2', null]) {
    assert.equal(validSelectionInterval(value), false); assert.deepEqual(normalizeEditorPreferences({ selectionInterval: value }), {});
  }
});

test('候选按起拍排序，每个分组从第一项计数，已选项不占间隔，同拍保持稳定', () => {
  const entries = [
    { key: 'x3', start: 3, group: 'x' }, { key: 'y2', start: 2, group: 'y' }, { key: 'x0', start: 0, group: 'x', selected: true },
    { key: 'x1a', start: 1, group: 'x' }, { key: 'y1', start: 1, group: 'y' }, { key: 'x1b', start: 1, group: 'x' }, { key: 'y3', start: 3, group: 'y' },
  ];
  const original = structuredClone(entries);
  assert.deepEqual(intervalSelection(entries, 2).map(entry => entry.key), ['x1a', 'x3', 'y1', 'y3']);
  assert.deepEqual(intervalSelection(entries, 1).map(entry => entry.key), ['x3', 'y2', 'x1a', 'y1', 'x1b', 'y3']);
  assert.deepEqual(entries, original);
  assert.equal(intervalSelection(entries, 99).length, 2);
});

test('划线候选跨移动事件去重并按时间重新筛选，不受指针频率及经过方向影响', () => {
  const entries = Array.from({ length: 7 }, (unused, index) => ({ key: index, start: index }));
  for (const sequence of [entries, [...entries].reverse()]) {
    const selection = new Set([1]); const drag = {};
    for (const entry of sequence) { extendIntervalSelection(drag, [entry], selection, 2); extendIntervalSelection(drag, [entry], selection, 2); }
    assert.deepEqual([...selection].sort((left, right) => left - right), [0, 1, 3, 5]);
    const chosen = drag.intervalSelection.chosen;
    for (let index = 0; index < 500; index++) extendIntervalSelection(drag, sequence, selection, 2);
    assert.equal(drag.intervalSelection.chosen, chosen);
  }
});

function canvas() {
  return { clientWidth: 500, clientHeight: 600, style: {}, addEventListener() {}, focus() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 600 }) };
}
function timelineFor(chart = createChart(), interval = 2) {
  const session = new EditorSession(chart); const timeline = new Timeline(canvas(), canvas(), () => session, () => {}, () => {}, error => { throw error; });
  timeline.selectionInterval = interval; timeline.rectangleTimes = () => [-1, 20];
  return { timeline, session };
}
function rectangle(timeline, area = 'notes') {
  const drag = { kind: 'rectangle', finished: true, area, start: { x: 0, y: 590 }, current: { x: 500, y: 0 }, append: true };
  const interaction = area === 'notes' ? timeline : timeline.eventInteraction;
  interaction.drag = drag; interaction.up({ clientX: 500, clientY: 0 });
}

test('音符框选按时间筛选 Tap/Drag/Flick/Hold，重复增选跳过原选择并保持 k=1 原行为', () => {
  const chart = createChart(); chart.judgeLineList[0].notes = [createNote(2, 5, 0, 8), createNote(3, 1, 0), createNote(1, 3, 0), createNote(4, 2, 0), createNote(1, 4, 0)];
  const { timeline, session } = timelineFor(chart);
  rectangle(timeline); assert.deepEqual([...session.selection], [1, 2, 0]);
  rectangle(timeline); assert.deepEqual([...session.selection], [1, 2, 0, 3]);
  timeline.selectionInterval = 1; rectangle(timeline); assert.equal(session.selection.size, 5);
});

test('多线音符框选将不同判定线的候选一起排序，而不是每条线重新计数', () => {
  const chart = createChart(); chart.judgeLineList = [createLine(), createLine()];
  chart.judgeLineList[0].notes = [createNote(1, 0, 0), createNote(1, 3, 0), createNote(1, 5, 0)];
  chart.judgeLineList[1].notes = [createNote(1, 1, 0), createNote(1, 2, 0), createNote(1, 4, 0)];
  const { timeline, session } = timelineFor(chart); session.multiLineEnabled = true; session.multiLineMode = 'notes'; session.multiLineIndices = [0, 1];
  timeline.noteHorizontal = (position, line) => 100 + line * 200;
  rectangle(timeline);
  assert.deepEqual([...session.multiLineSelection.get(0)], [0]);
  assert.deepEqual([...session.multiLineSelection.get(1)], [1, 2]);
});

test('普通和多线事件框选按每条判定线、每种事件独立筛选，保留已选事件', () => {
  for (const multi of [false, true]) {
    const chart = createChart(); chart.judgeLineList = [createLine(), createLine()];
    for (const line of chart.judgeLineList) line.eventLayers[0] = Object.fromEntries(['moveXEvents', 'moveYEvents'].map(type => [type, [3, 1, 2, 0].map(beat => createEvent(0, 10, beat, beat + 0.4))]));
    const { timeline, session } = timelineFor(chart);
    if (multi) { session.multiLineEnabled = true; session.multiLineMode = 'events'; session.multiLineIndices = [0, 1]; }
    session.eventSelection.add('moveXEvents:3');
    if (multi) session.multiEventSelection.set(0, session.eventSelection);
    timeline.multiLineEventWidth = 240; timeline.multiLineEventWidthExplicit = true;
    rectangle(timeline, 'events');
    assert.deepEqual(new Set(session.eventSelection), new Set(['moveXEvents:3', 'moveXEvents:1', 'moveXEvents:0', 'moveYEvents:3', 'moveYEvents:2']));
    if (multi) assert.deepEqual(new Set(session.multiEventSelection.get(1)), new Set(['moveXEvents:3', 'moveXEvents:2', 'moveYEvents:3', 'moveYEvents:2']));
  }
});

test('普通事件划线依据完整手势候选分组取间隔，跨帧重入不增加计数', () => {
  const chart = createChart(); chart.judgeLineList[0].eventLayers[0] = { moveXEvents: [0, 1, 2, 3, 4].map(beat => createEvent(0, 10, beat, beat + 0.4)) };
  const { timeline, session } = timelineFor(chart);
  timeline.eventRects = Array.from({ length: 5 }, (unused, index) => ({ x: 100, y: 100 + index * 60, width: 60, height: 30, type: 'moveXEvents', index: 4 - index }));
  const pointer = (clientX, clientY) => ({ button: 0, clientX, clientY, pointerId: 1 }); const interaction = timeline.eventInteraction;
  interaction.down(pointer(120, 70));
  for (let vertical = 80; vertical < 400; vertical += 10) interaction.move(pointer(120, vertical));
  interaction.up(pointer(120, 400));
  assert.deepEqual([...session.eventSelection].sort(), ['moveXEvents:0', 'moveXEvents:2', 'moveXEvents:4']);
});

function noiseEditor(side, interval = 2) {
  const chart = createChart(); chart.blockAreaList = [3, 1, 2, 0].map(beat => createNoiseArea(beat, beat + 10));
  const area = chart.blockAreaList[0];
  for (const type of ['moveXEvents', 'rotateEvents', 'activeIntervals']) area[type] = [3, 1, 2, 0].map(beat => type === 'activeIntervals' ? { startTime: [beat, 0, 1], endTime: [beat, 1, 2], readyFlash: 0.5 } : createNoiseEvent(0, 1, beat, beat + 0.5));
  const editor = Object.create(NoiseAreaEditor.prototype); editor.getContext = () => ({ session: { chart }, timeline: { selectionInterval: interval } });
  editor.selected = 0; editor.selection = new Set(); editor.areaX = () => 100; editor.eventBounds = () => ({ x: 400, width: 60 });
  editor.canvas = { hasPointerCapture: () => false }; editor.syncHover = editor.render = editor.invalidate = editor.activate = () => {};
  editor.point = () => ({ x: 800, y: 10, rawBeat: 10, side });
  editor.drag = { kind: 'rectangle', start: { x: 0, y: 0, rawBeat: 0, side }, current: { x: 800, y: 10, rawBeat: 10 }, baseSelection: new Set(), moved: true };
  return editor;
}

test('噪域生命周期和内部各类事件支持同一间隔规则，生命周期以出现拍排序', () => {
  const areaEditor = noiseEditor('areas'); areaEditor.up({}, true); assert.deepEqual([...areaEditor.selection], ['area:3', 'area:2']);
  const internal = noiseEditor('events'); internal.up({}, true);
  assert.deepEqual(new Set(internal.selection), new Set(['moveXEvents:3', 'moveXEvents:2', 'rotateEvents:3', 'rotateEvents:2', 'activeIntervals:3', 'activeIntervals:2']));
});

test('单个点选与 Ctrl 点选绕过间隔筛选，不改变物件或撤销历史', () => {
  const chart = createChart(); chart.judgeLineList[0].notes = [0, 1, 2].map(beat => createNote(1, beat, 0));
  const { timeline, session } = timelineFor(chart, 99); const original = JSON.stringify(chart);
  const first = { clientX: timeline.noteHorizontal(0), clientY: timeline.vertical(0), button: 0, pointerId: 1 };
  timeline.down(first); timeline.up(first); assert.deepEqual([...session.selection], [0]);
  const second = { ...first, clientY: timeline.vertical(1), ctrlKey: true };
  timeline.down(second); timeline.up(second); assert.deepEqual([...session.selection], [0, 1]);
  assert.equal(JSON.stringify(chart), original); assert.equal(session.history.undoStack.length, 0);
});
