import test from 'node:test';
import assert from 'node:assert/strict';
import { NoiseAreaEditor } from '../src/ui/noise-area.mjs';
import { createNoiseArea } from '../src/core/noise-areas.mjs';
import { fromNumber } from '../src/core/beat.mjs';
import { TempoMap } from '../src/core/tempo.mjs';

const interval = (start, end, readyFlash) => ({ startTime: fromNumber(start), endTime: fromNumber(end), readyFlash });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function distributionEditor(tempo) {
  const editor = Object.create(NoiseAreaEditor.prototype);
  editor.distributions = new WeakMap(); editor.getContext = () => ({ tempo });
  editor.layout = () => ({ height: 1000 }); editor.y = beat => 900 - tempo.seconds(beat) * 100;
  return editor;
}
function strokes(editor, area) {
  const points = []; const context = new Proxy({ globalAlpha: 1, moveTo: (...point) => points.push(point), lineTo: (...point) => points.push(point) }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  editor.drawDistribution(context, area, 10, 60, editor.y(10), editor.y(0)); return points;
}

test('激活概览的虚线使用秒数跨 BPM 映射，并在生命周期及上个激活段处裁剪', () => {
  const tempo = new TempoMap([{ startTime: fromNumber(0), bpm: 120 }, { startTime: fromNumber(3), bpm: 60 }]);
  const editor = distributionEditor(tempo); const area = createNoiseArea(0, 10);
  area.activeIntervals = [interval(4, 5, 1.2), interval(5.1, 6, 1), interval(7, 8, 0)];
  const points = strokes(editor, area); assert.equal(points.length, 4);
  near(points[0][1], editor.y(4)); near(points[1][1], editor.y(2.6));
  near(points[2][1], editor.y(5.1)); near(points[3][1], editor.y(5));
  area.appearTime = fromNumber(3.8); editor.distributions.delete(area);
  near(strokes(editor, area)[1][1], editor.y(3.8));
});

test('虚线支持旧预闪布尔值，并在 BPM 变化后更新缓存', () => {
  const area = createNoiseArea(0, 10); area.activeIntervals = [interval(2, 3, true), interval(5, 6, false)];
  const tempo = new TempoMap([{ startTime: fromNumber(0), bpm: 120 }]); const editor = distributionEditor(tempo);
  const points = strokes(editor, area); assert.equal(points.length, 2); near(points[1][1], editor.y(1));
  const nextTempo = new TempoMap([{ startTime: fromNumber(0), bpm: 60 }]);
  editor.getContext = () => ({ tempo: nextTempo }); editor.y = beat => 900 - nextTempo.seconds(beat) * 100;
  near(strokes(editor, area)[1][1], editor.y(1.5));
});
