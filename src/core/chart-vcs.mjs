const encoder = new TextEncoder();
const decoder = new TextDecoder();
const hashCache = new WeakMap();

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = sortValue(value[key]);
    }
    return result;
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

export function deepEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

export function cloneValue(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function toBytes(input) {
  if (typeof input === 'string') return encoder.encode(input);
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return new Uint8Array(input);
}

function fallbackHash(bytes) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

export async function sha256Hex(input) {
  const bytes = toBytes(input);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  }
  return fallbackHash(bytes);
}

export async function hashBytes(bytes, cacheKey = bytes) {
  if (cacheKey && typeof cacheKey === 'object') {
    const cached = hashCache.get(cacheKey);
    if (cached) return cached;
  }
  const hash = await sha256Hex(bytes);
  if (cacheKey && typeof cacheKey === 'object') hashCache.set(cacheKey, hash);
  return hash;
}

export const shortId = id => String(id ?? '').slice(0, 7);
export const GRAPH_COLOR_COUNT = 8;

export function textBytes(text) {
  return encoder.encode(text);
}

export function decodeText(bytes) {
  return decoder.decode(bytes);
}

export function bytesToBase64(input) {
  const bytes = toBytes(input);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(binary);
  return Buffer.from(binary, 'binary').toString('base64');
}

export function base64ToBytes(text) {
  const binary = typeof globalThis.atob === 'function' ? globalThis.atob(text) : Buffer.from(text, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function validateRefName(name) {
  const value = String(name ?? '').trim();
  if (!value) return '名称不能为空';
  if (value.length > 120) return '名称不能超过 120 个字符';
  if (/[\s~^:?*[\\]/.test(value)) return '名称不能包含空格或 ~ ^ : ? * [ \\';
  if (value.startsWith('/') || value.endsWith('/') || value.includes('//') || value.includes('..')) return '名称格式无效';
  if (value.includes('@{')) return '名称不能包含 @{';
  if (value.endsWith('.') || value.endsWith('.lock')) return '名称不能以点或 .lock 结尾';
  return null;
}

export function assertRefName(name, label = '引用') {
  const message = validateRefName(name);
  if (message) throw new Error(`${label}名称无效：${message}`);
  return String(name).trim();
}

function formatBeat(beat) {
  if (!Array.isArray(beat) || beat.length !== 3) return '?';
  const value = beat[0] + beat[1] / beat[2];
  return Number.isFinite(value) ? value.toFixed(3) : '?';
}

function noteLabel(note) {
  const types = { 1: 'Tap', 2: 'Hold', 3: 'Flick', 4: 'Drag' };
  return `${types[note?.type] ?? 'Note'} @ ${formatBeat(note?.startTime)} 拍 · X ${Number(note?.positionX ?? 0)}`;
}

function eventLabel(type, event) {
  return `${type} @ ${formatBeat(event?.startTime)} 拍`;
}

function groupItems(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function countValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function unmatched(items, otherItems) {
  const counts = countValues(otherItems.map(canonicalJson));
  const result = [];
  for (const item of items) {
    const key = canonicalJson(item);
    const count = counts.get(key) ?? 0;
    if (count) counts.set(key, count - 1);
    else result.push(item);
  }
  return result;
}

function diffItems(beforeItems, afterItems, keyOf, label) {
  const beforeGroups = groupItems(beforeItems, keyOf);
  const afterGroups = groupItems(afterItems, keyOf);
  const result = { added: 0, removed: 0, modified: 0, samples: { added: [], removed: [], modified: [] } };
  const keys = new Set([...beforeGroups.keys(), ...afterGroups.keys()]);
  for (const key of keys) {
    const before = beforeGroups.get(key) ?? [];
    const after = afterGroups.get(key) ?? [];
    const beforeLeft = unmatched(before, after);
    const afterLeft = unmatched(after, before);
    const modified = Math.min(beforeLeft.length, afterLeft.length);
    result.modified += modified;
    result.removed += beforeLeft.length - modified;
    result.added += afterLeft.length - modified;
    if (modified && result.samples.modified.length < 5) result.samples.modified.push(label(afterLeft[0] ?? beforeLeft[0]));
    if (afterLeft.length > modified && result.samples.added.length < 5) result.samples.added.push(label(afterLeft[modified]));
    if (beforeLeft.length > modified && result.samples.removed.length < 5) result.samples.removed.push(label(beforeLeft[modified]));
  }
  return result;
}

function eventTypeKeys(beforeLayer, afterLayer) {
  const keys = new Set([...Object.keys(beforeLayer ?? {}), ...Object.keys(afterLayer ?? {})]);
  return [...keys].filter(key => key.endsWith('Events'));
}

const META_LABELS = {
  name: '曲名', composer: '曲师', charter: '谱师', illustration: '画师',
  level: '难度', song: '歌曲', background: '背景', offset: '偏移'
};
const NOTE_FIELD_LABELS = {
  type: '类型', startTime: '开始拍', endTime: '结束拍', positionX: '横坐标', above: '方向',
  speed: '速度', size: '大小', yOffset: 'Y 偏移', visibleTime: '可见时间', alpha: '透明度', isFake: '假音符'
};
const EVENT_FIELD_LABELS = {
  startTime: '开始拍', endTime: '结束拍', start: '起始值', end: '结束值',
  easingType: '缓动', easingLeft: '缓动左端', easingRight: '缓动右端',
  bezier: 'Bezier', bezierPoints: 'Bezier 控制点', linkgroup: '绑定组'
};
const OTHER_LABELS = {
  markers: '标记点', globalEvents: '全局事件', noiseAreaLayers: '噪域层',
  effects: '效果', blockAreaList: '噪域列表', noiseAreaOptions: '噪域选项'
};

function formatDiffValue(value) {
  if (value === undefined) return '（无）';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length && value.every(item => item && typeof item === 'object' && 'time' in item)) {
      return value.map(item => `${item.name ?? '标记'} @ ${formatDiffValue(item.time)}`).join('；');
    }
    if (value.length === 3 && value.every(Number.isFinite)) return `${formatBeat(value)} 拍`;
    return value.map(formatDiffValue).join(' / ');
  }
  if (typeof value === 'object') {
    const text = canonicalJson(value);
    return text.length > 90 ? `${text.slice(0, 89)}…` : text;
  }
  return String(value);
}

function describeFieldChanges(before, after, labels) {
  const changes = [];
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    if (deepEqual(before?.[key], after?.[key])) continue;
    changes.push(`${labels[key] ?? key}：${formatDiffValue(before?.[key])} → ${formatDiffValue(after?.[key])}`);
    if (changes.length >= 6) { changes.push('…'); break; }
  }
  return changes.join('，');
}

function matchItems(beforeItems, afterItems, keyOf) {
  const beforeGroups = groupItems(beforeItems, keyOf);
  const afterGroups = groupItems(afterItems, keyOf);
  const result = { added: [], removed: [], modified: [] };
  for (const key of new Set([...beforeGroups.keys(), ...afterGroups.keys()])) {
    const before = beforeGroups.get(key) ?? [];
    const after = afterGroups.get(key) ?? [];
    const beforeLeft = unmatched(before, after);
    const afterLeft = unmatched(after, before);
    const modified = Math.min(beforeLeft.length, afterLeft.length);
    for (let index = 0; index < modified; index++) result.modified.push({ before: beforeLeft[index], after: afterLeft[index] });
    result.removed.push(...beforeLeft.slice(modified));
    result.added.push(...afterLeft.slice(modified));
  }
  return result;
}

export function diffCharts(before, after) {
  const beforeChart = before ?? {};
  const afterChart = after ?? {};
  const meta = [];
  const details = [];
  const metaKeys = new Set([...Object.keys(beforeChart.META ?? {}), ...Object.keys(afterChart.META ?? {})]);
  for (const key of [...metaKeys].sort()) {
    if (!deepEqual(beforeChart.META?.[key], afterChart.META?.[key])) {
      meta.push({ key, before: beforeChart.META?.[key], after: afterChart.META?.[key] });
    }
  }
  for (const entry of meta) {
    details.push({ kind: 'meta', text: `${META_LABELS[entry.key] ?? entry.key}：${formatDiffValue(entry.before)} → ${formatDiffValue(entry.after)}` });
  }

  const bpm = diffItems(beforeChart.BPMList ?? [], afterChart.BPMList ?? [],
    entry => canonicalJson(entry?.startTime), entry => `${Number(entry?.bpm ?? 0)} BPM @ ${formatBeat(entry?.startTime)} 拍`);
  const bpmChanges = matchItems(beforeChart.BPMList ?? [], afterChart.BPMList ?? [], entry => canonicalJson(entry?.startTime));
  for (const entry of bpmChanges.added) details.push({ kind: 'bpm', text: `新增 BPM：${Number(entry?.bpm ?? 0)} @ ${formatBeat(entry?.startTime)} 拍` });
  for (const entry of bpmChanges.removed) details.push({ kind: 'bpm', text: `删除 BPM：${Number(entry?.bpm ?? 0)} @ ${formatBeat(entry?.startTime)} 拍` });
  for (const change of bpmChanges.modified) {
    details.push({ kind: 'bpm', text: `BPM @ ${formatBeat(change.after?.startTime ?? change.before?.startTime)} 拍：${Number(change.before?.bpm ?? 0)} → ${Number(change.after?.bpm ?? 0)}` });
  }

  const beforeLines = beforeChart.judgeLineList ?? [];
  const afterLines = afterChart.judgeLineList ?? [];
  const lineCount = Math.min(beforeLines.length, afterLines.length);
  let lineModified = 0;
  const lineSamples = [];
  for (let index = 0; index < lineCount; index++) {
    if (!deepEqual(beforeLines[index], afterLines[index])) {
      lineModified++;
      const lineName = afterLines[index]?.Name ?? beforeLines[index]?.Name ?? `第 ${index + 1} 条线`;
      if (lineSamples.length < 5) lineSamples.push(lineName);
      details.push({ kind: 'line', text: `判定线「${lineName}」内容已修改` });
    }
  }
  for (let index = lineCount; index < afterLines.length; index++) {
    details.push({ kind: 'line', text: `新增判定线「${afterLines[index]?.Name ?? `第 ${index + 1} 条线`}」` });
  }
  for (let index = lineCount; index < beforeLines.length; index++) {
    details.push({ kind: 'line', text: `删除判定线「${beforeLines[index]?.Name ?? `第 ${index + 1} 条线`}」` });
  }
  const lines = {
    before: beforeLines.length, after: afterLines.length,
    added: Math.max(0, afterLines.length - beforeLines.length),
    removed: Math.max(0, beforeLines.length - afterLines.length),
    modified: lineModified, samples: lineSamples
  };

  const notes = { added: 0, removed: 0, modified: 0, samples: { added: [], removed: [], modified: [] } };
  const events = { added: 0, removed: 0, modified: 0, samples: { added: [], removed: [], modified: [] } };
  const mergeCounts = (target, source) => {
    for (const key of ['added', 'removed', 'modified']) target[key] += source[key];
    for (const key of ['added', 'removed', 'modified']) target.samples[key].push(...source.samples[key].slice(0, Math.max(0, 5 - target.samples[key].length)));
  };
  const countLayerEvents = (layer, direction) => {
    for (const type of eventTypeKeys(layer, layer)) {
      const list = layer?.[type] ?? [];
      if (direction === 'added') events.added += list.length;
      else events.removed += list.length;
    }
  };

  for (let index = 0; index < lineCount; index++) {
    const beforeLine = beforeLines[index] ?? {};
    const afterLine = afterLines[index] ?? {};
    const lineName = afterLine.Name ?? beforeLine.Name ?? `第 ${index + 1} 条线`;
    const noteKey = note => `${note?.type}|${canonicalJson(note?.startTime)}|${note?.positionX}|${note?.above ?? 1}`;
    mergeCounts(notes, diffItems(beforeLine.notes ?? [], afterLine.notes ?? [], noteKey, noteLabel));
    const noteChanges = matchItems(beforeLine.notes ?? [], afterLine.notes ?? [], noteKey);
    for (const note of noteChanges.added) details.push({ kind: 'note', text: `第 ${index + 1} 条线「${lineName}」：新增 ${noteLabel(note)}` });
    for (const note of noteChanges.removed) details.push({ kind: 'note', text: `第 ${index + 1} 条线「${lineName}」：删除 ${noteLabel(note)}` });
    for (const change of noteChanges.modified) {
      const fields = describeFieldChanges(change.before, change.after, NOTE_FIELD_LABELS);
      details.push({ kind: 'note', text: `第 ${index + 1} 条线「${lineName}」：修改 ${noteLabel(change.after)}${fields ? `（${fields}）` : ''}` });
    }
    const beforeLayers = [...(beforeLine.eventLayers ?? []), beforeLine.extended ?? {}];
    const afterLayers = [...(afterLine.eventLayers ?? []), afterLine.extended ?? {}];
    const layerCount = Math.max(beforeLayers.length, afterLayers.length);
    for (let layerIndex = 0; layerIndex < layerCount; layerIndex++) {
      const beforeLayer = beforeLayers[layerIndex] ?? {};
      const afterLayer = afterLayers[layerIndex] ?? {};
      for (const type of eventTypeKeys(beforeLayer, afterLayer)) {
        const eventKey = event => canonicalJson(event?.startTime);
        mergeCounts(events, diffItems(beforeLayer[type] ?? [], afterLayer[type] ?? [], eventKey, event => eventLabel(type, event)));
        const eventChanges = matchItems(beforeLayer[type] ?? [], afterLayer[type] ?? [], eventKey);
        for (const event of eventChanges.added) details.push({ kind: 'event', text: `第 ${index + 1} 条线「${lineName}」：新增 ${eventLabel(type, event)}` });
        for (const event of eventChanges.removed) details.push({ kind: 'event', text: `第 ${index + 1} 条线「${lineName}」：删除 ${eventLabel(type, event)}` });
        for (const change of eventChanges.modified) {
          const fields = describeFieldChanges(change.before, change.after, EVENT_FIELD_LABELS);
          details.push({ kind: 'event', text: `第 ${index + 1} 条线「${lineName}」：修改 ${eventLabel(type, change.after)}${fields ? `（${fields}）` : ''}` });
        }
      }
    }
  }
  for (let index = lineCount; index < afterLines.length; index++) {
    notes.added += afterLines[index]?.notes?.length ?? 0;
    for (const layer of [...(afterLines[index]?.eventLayers ?? []), afterLines[index]?.extended ?? {}]) countLayerEvents(layer, 'added');
  }
  for (let index = lineCount; index < beforeLines.length; index++) {
    notes.removed += beforeLines[index]?.notes?.length ?? 0;
    for (const layer of [...(beforeLines[index]?.eventLayers ?? []), beforeLines[index]?.extended ?? {}]) countLayerEvents(layer, 'removed');
  }

  const summary = [];
  const other = [];
  const ignoredKeys = new Set(['META', 'BPMList', 'judgeLineList', 'chartTime']);
  for (const key of new Set([...Object.keys(beforeChart), ...Object.keys(afterChart)])) {
    if (ignoredKeys.has(key)) continue;
    if (!deepEqual(beforeChart[key], afterChart[key])) other.push({ key, before: beforeChart[key], after: afterChart[key] });
  }
  for (const entry of other) {
    details.push({ kind: 'other', text: `${OTHER_LABELS[entry.key] ?? entry.key}：${formatDiffValue(entry.before)} → ${formatDiffValue(entry.after)}` });
  }
  let detailsTruncated = false;
  if (details.length > 200) {
    details.length = 200;
    detailsTruncated = true;
  }
  if (meta.length) summary.push(`谱面信息 ${meta.length} 项`);
  if (bpm.added || bpm.removed || bpm.modified) summary.push(`BPM +${bpm.added} -${bpm.removed} ~${bpm.modified}`);
  if (lines.added || lines.removed || lines.modified) summary.push(`判定线 +${lines.added} -${lines.removed} ~${lines.modified}`);
  if (notes.added || notes.removed || notes.modified) summary.push(`音符 +${notes.added} -${notes.removed} ~${notes.modified}`);
  if (events.added || events.removed || events.modified) summary.push(`事件 +${events.added} -${events.removed} ~${events.modified}`);
  if (other.length) summary.push(`其他谱面数据 ${other.length} 项`);
  const total = meta.length + bpm.added + bpm.removed + bpm.modified + lines.added + lines.removed + lines.modified + notes.added + notes.removed + notes.modified + events.added + events.removed + events.modified + other.length;
  return { meta, bpm, lines, notes, events, other, details, detailsTruncated, summary, total };
}

export function diffTrees(before, after) {
  const beforeAssets = new Map((before?.assets ?? []).map(entry => [entry.path, entry]));
  const afterAssets = new Map((after?.assets ?? []).map(entry => [entry.path, entry]));
  const added = [], modified = [], deleted = [];
  for (const [path, entry] of afterAssets) {
    const previous = beforeAssets.get(path);
    if (!previous) added.push(entry);
    else if (previous.blob !== entry.blob) modified.push({ path, before: previous, after: entry });
  }
  for (const [path, entry] of beforeAssets) if (!afterAssets.has(path)) deleted.push(entry);
  const foldersChanged = !deepEqual([...(before?.folders ?? [])].sort(), [...(after?.folders ?? [])].sort());
  return {
    chartChanged: (before?.chart ?? null) !== (after?.chart ?? null),
    chartNameChanged: (before?.chartName ?? '') !== (after?.chartName ?? ''),
    foldersChanged, added, modified, deleted,
    total: Number((before?.chart ?? null) !== (after?.chart ?? null)) + Number((before?.chartName ?? '') !== (after?.chartName ?? '')) + added.length + modified.length + deleted.length + Number(foldersChanged)
  };
}

export function hasTreeChanges(diff) {
  return Boolean(diff && diff.total > 0);
}

export function mergeFolders(base = [], ours = [], theirs = []) {
  const baseSet = new Set(base), ourSet = new Set(ours), theirSet = new Set(theirs);
  const result = new Set();
  for (const folder of new Set([...ourSet, ...theirSet])) {
    if (ourSet.has(folder) && theirSet.has(folder)) result.add(folder);
    else if (ourSet.has(folder)) { if (!baseSet.has(folder)) result.add(folder); }
    else if (!baseSet.has(folder)) result.add(folder);
  }
  return [...result].sort();
}

function mergeConflict(path, base, ours, theirs, oursPresent = true, theirsPresent = true, kind = 'chart') {
  return { path: formatPath(path), pathArray: path, base, ours, theirs, oursPresent, theirsPresent, kind };
}

export function formatPath(path) {
  let text = '';
  for (const part of path) {
    if (typeof part === 'number') text += `[${part}]`;
    else text += text ? `.${part}` : String(part);
  }
  return text || '(root)';
}

function mergeObject(base, ours, theirs, path, conflicts) {
  const result = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  for (const key of keys) {
    const inBase = Object.hasOwn(base, key);
    const inOurs = Object.hasOwn(ours, key);
    const inTheirs = Object.hasOwn(theirs, key);
    const childPath = [...path, key];
    if (inOurs && inTheirs) result[key] = mergeValue(base[key], ours[key], theirs[key], childPath, conflicts);
    else if (inOurs) {
      if (!inBase) result[key] = cloneValue(ours[key]);
      else if (!deepEqual(ours[key], base[key])) {
        conflicts.push(mergeConflict(childPath, base[key], ours[key], undefined, true, false));
        result[key] = cloneValue(ours[key]);
      }
    } else if (inTheirs) {
      if (!inBase) result[key] = cloneValue(theirs[key]);
      else if (!deepEqual(theirs[key], base[key])) {
        conflicts.push(mergeConflict(childPath, base[key], undefined, theirs[key], false, true));
        result[key] = cloneValue(theirs[key]);
      }
    }
  }
  return result;
}

function arrayConfig(path) {
  const last = path.at(-1);
  if (last === 'BPMList') return { keyOf: entry => canonicalJson(entry?.startTime), sortByTime: true };
  if (last === 'notes') return { keyOf: note => `${note?.type}|${canonicalJson(note?.startTime)}|${note?.positionX}|${note?.above ?? 1}`, sortByTime: true };
  if (last === 'markers') return { keyOf: marker => String(marker?.time ?? ''), sortByTime: true };
  if (typeof last === 'string' && last.endsWith('Events')) return { keyOf: event => canonicalJson(event?.startTime), sortByTime: true };
  return null;
}

function timeValue(item) {
  const beat = item?.startTime ?? item?.time;
  if (Array.isArray(beat) && beat.length === 3) return beat[0] + beat[1] / beat[2];
  const value = Number(beat);
  return Number.isFinite(value) ? value : 0;
}

function groupKeyed(items, keyOf) {
  const groups = new Map();
  const occurrences = new Map();
  for (const item of items) {
    const raw = keyOf(item);
    const occurrence = occurrences.get(raw) ?? 0;
    occurrences.set(raw, occurrence + 1);
    groups.set(`${raw}#${occurrence}`, item);
  }
  return groups;
}

function lineName(line) {
  return String(line?.Name ?? '');
}

function lineWithoutName(line) {
  if (!line || typeof line !== 'object' || Array.isArray(line)) return line;
  const copy = { ...line };
  delete copy.Name;
  return copy;
}

function matchLineIndices(base, branch) {
  const used = new Set();
  const matches = new Map();
  const match = predicate => {
    for (let branchIndex = 0; branchIndex < branch.length; branchIndex++) {
      if (matches.has(branchIndex)) continue;
      for (let baseIndex = 0; baseIndex < base.length; baseIndex++) {
        if (used.has(baseIndex) || !predicate(base[baseIndex], branch[branchIndex])) continue;
        used.add(baseIndex);
        matches.set(branchIndex, baseIndex);
        break;
      }
    }
  };
  match((left, right) => deepEqual(left, right));
  match((left, right) => deepEqual(lineWithoutName(left), lineWithoutName(right)));
  match((left, right) => lineName(left) === lineName(right));
  return { matches, used };
}

function invertLineMatches(matches) {
  const result = new Map();
  for (const [branchIndex, baseIndex] of matches) result.set(baseIndex, branchIndex);
  return result;
}

function chooseLineSource(merged, ourLine, theirLine, ourIndex, theirIndex) {
  if (deepEqual(merged, ourLine)) return { branch: 'ours', index: ourIndex };
  if (deepEqual(merged, theirLine)) return { branch: 'theirs', index: theirIndex };
  if (deepEqual(merged?.father, ourLine?.father)) return { branch: 'ours', index: ourIndex };
  if (deepEqual(merged?.father, theirLine?.father)) return { branch: 'theirs', index: theirIndex };
  return { branch: 'ours', index: ourIndex };
}

function mergeJudgeLines(base, ours, theirs, path, conflicts) {
  const ourMatch = matchLineIndices(base, ours);
  const theirMatch = matchLineIndices(base, theirs);
  const ourByBase = invertLineMatches(ourMatch.matches);
  const theirByBase = invertLineMatches(theirMatch.matches);
  const ourAddedIndices = ours.map((_, index) => index).filter(index => !ourMatch.matches.has(index));
  const theirAddedIndices = theirs.map((_, index) => index).filter(index => !theirMatch.matches.has(index));
  const addedMatch = matchLineIndices(
    ourAddedIndices.map(index => ours[index]),
    theirAddedIndices.map(index => theirs[index])
  );
  const addedByOur = invertLineMatches(addedMatch.matches);
  const pairedTheir = new Set(addedByOur.values());
  const entries = [];
  const add = entry => {
    entry.index = entries.length;
    entries.push(entry);
    return entry;
  };

  for (let baseIndex = 0; baseIndex < base.length; baseIndex++) {
    const ourIndex = ourByBase.get(baseIndex);
    const theirIndex = theirByBase.get(baseIndex);
    const hasOurs = ourIndex !== undefined, hasTheirs = theirIndex !== undefined;
    const baseLine = base[baseIndex];
    if (hasOurs && hasTheirs) {
      const ourLine = ours[ourIndex], theirLine = theirs[theirIndex];
      const merged = mergeValue(baseLine, ourLine, theirLine, [...path, entries.length], conflicts);
      add({ identity: `base:${baseIndex}`, line: merged, baseIndex, ourIndex, theirIndex, source: chooseLineSource(merged, ourLine, theirLine, ourIndex, theirIndex) });
    } else if (hasOurs) {
      const ourLine = ours[ourIndex];
      if (!deepEqual(ourLine, baseLine)) {
        conflicts.push(mergeConflict([...path, entries.length], baseLine, ourLine, undefined, true, false));
        add({ identity: `base:${baseIndex}`, line: cloneValue(ourLine), baseIndex, ourIndex, source: { branch: 'ours', index: ourIndex } });
      }
    } else if (hasTheirs) {
      const theirLine = theirs[theirIndex];
      if (!deepEqual(theirLine, baseLine)) {
        conflicts.push(mergeConflict([...path, entries.length], baseLine, undefined, theirLine, false, true));
        add({ identity: `base:${baseIndex}`, line: cloneValue(theirLine), baseIndex, theirIndex, source: { branch: 'theirs', index: theirIndex } });
      }
    }
  }

  const ourAddedIdentity = new Map(), theirAddedIdentity = new Map();
  for (let position = 0; position < ourAddedIndices.length; position++) {
    const ourIndex = ourAddedIndices[position], paired = addedByOur.get(position);
    if (paired !== undefined) {
      const theirIndex = theirAddedIndices[paired], identity = `added:${ourIndex}`;
      const ourLine = ours[ourIndex], theirLine = theirs[theirIndex];
      const merged = deepEqual(ourLine, theirLine)
        ? cloneValue(ourLine)
        : mergeValue(undefined, ourLine, theirLine, [...path, entries.length], conflicts);
      ourAddedIdentity.set(ourIndex, identity);
      theirAddedIdentity.set(theirIndex, identity);
      add({ identity, line: merged, ourIndex, theirIndex, source: chooseLineSource(merged, ourLine, theirLine, ourIndex, theirIndex) });
    } else {
      const identity = `ours:${ourIndex}`;
      ourAddedIdentity.set(ourIndex, identity);
      add({ identity, line: cloneValue(ours[ourIndex]), ourIndex, source: { branch: 'ours', index: ourIndex } });
    }
  }
  for (let position = 0; position < theirAddedIndices.length; position++) {
    if (pairedTheir.has(position)) continue;
    const theirIndex = theirAddedIndices[position], identity = `theirs:${theirIndex}`;
    theirAddedIdentity.set(theirIndex, identity);
    add({ identity, line: cloneValue(theirs[theirIndex]), theirIndex, source: { branch: 'theirs', index: theirIndex } });
  }

  const identityOf = (branch, index) => {
    if (branch === 'ours') {
      const baseIndex = ourMatch.matches.get(index);
      return baseIndex !== undefined ? `base:${baseIndex}` : ourAddedIdentity.get(index) ?? `ours:${index}`;
    }
    const baseIndex = theirMatch.matches.get(index);
    return baseIndex !== undefined ? `base:${baseIndex}` : theirAddedIdentity.get(index) ?? `theirs:${index}`;
  };
  const resultIndex = new Map(entries.map(entry => [entry.identity, entry.index]));
  for (const entry of entries) {
    if (!entry.line || typeof entry.line !== 'object' || Array.isArray(entry.line)) continue;
    let parentIndex = -1;
    const source = entry.source;
    const sourceLine = source?.branch === 'ours' ? ours[source.index] : theirs[source?.index];
    const father = Number(sourceLine?.father);
    if (father === -1) { entry.line.father = -1; continue; }
    if (Number.isInteger(father) && father >= 0) {
      const candidate = resultIndex.get(identityOf(source.branch, father));
      if (candidate !== undefined && candidate !== entry.index) parentIndex = candidate;
    }
    if (parentIndex === -1 && entry.baseIndex !== undefined) {
      const baseFather = Number(base[entry.baseIndex]?.father);
      if (Number.isInteger(baseFather) && baseFather >= 0) {
        const candidate = resultIndex.get(`base:${baseFather}`);
        if (candidate !== undefined && candidate !== entry.index) parentIndex = candidate;
      }
    }
    entry.line.father = parentIndex;
  }
  return entries.map(entry => entry.line);
}

function mergeKeyedArray(base, ours, theirs, keyOf, path, conflicts) {
  const before = groupKeyed(base, keyOf);
  const our = groupKeyed(ours, keyOf);
  const their = groupKeyed(theirs, keyOf);
  const result = [];
  const keys = [...before.keys(), ...[...our.keys()].filter(key => !before.has(key)), ...[...their.keys()].filter(key => !before.has(key) && !our.has(key))];
  for (const key of keys) {
    const inBase = before.has(key), inOurs = our.has(key), inTheirs = their.has(key);
    const itemPath = [...path, result.length];
    if (inOurs && inTheirs) result.push(mergeValue(before.get(key), our.get(key), their.get(key), itemPath, conflicts));
    else if (inOurs) {
      if (!inBase) result.push(cloneValue(our.get(key)));
      else if (!deepEqual(our.get(key), before.get(key))) {
        conflicts.push(mergeConflict(itemPath, before.get(key), our.get(key), undefined, true, false));
        result.push(cloneValue(our.get(key)));
      }
    } else if (inTheirs) {
      if (!inBase) result.push(cloneValue(their.get(key)));
      else if (!deepEqual(their.get(key), before.get(key))) {
        conflicts.push(mergeConflict(itemPath, before.get(key), undefined, their.get(key), false, true));
        result.push(cloneValue(their.get(key)));
      }
    }
  }
  return result;
}

function mergeArray(base, ours, theirs, path, conflicts) {
  if (path.at(-1) === 'judgeLineList') return mergeJudgeLines(base, ours, theirs, path, conflicts);
  const config = arrayConfig(path);
  if (config) return mergeKeyedArray(base, ours, theirs, config.keyOf, path, conflicts);
  if (base.length === ours.length && base.length === theirs.length) {
    return base.map((item, index) => mergeValue(item, ours[index], theirs[index], [...path, index], conflicts));
  }
  conflicts.push(mergeConflict(path, base, ours, theirs));
  return cloneValue(ours);
}

export function sortChartCollections(chart) {
  if (!chart || typeof chart !== 'object') return chart;
  if (Array.isArray(chart.BPMList)) chart.BPMList.sort((left, right) => timeValue(left) - timeValue(right));
  if (Array.isArray(chart.markers)) chart.markers.sort((left, right) => timeValue(left) - timeValue(right));
  if (Array.isArray(chart.globalEvents)) chart.globalEvents.sort((left, right) => timeValue(left) - timeValue(right));
  for (const line of chart.judgeLineList ?? []) {
    if (!line) continue;
    if (Array.isArray(line.notes)) line.notes.sort((left, right) => timeValue(left) - timeValue(right));
    for (const layer of line.eventLayers ?? []) {
      if (!layer) continue;
      for (const key of Object.keys(layer)) if (key.endsWith('Events') && Array.isArray(layer[key])) layer[key].sort((left, right) => timeValue(left) - timeValue(right));
    }
    if (line.extended) {
      for (const key of Object.keys(line.extended)) if (key.endsWith('Events') && Array.isArray(line.extended[key])) line.extended[key].sort((left, right) => timeValue(left) - timeValue(right));
    }
  }
  return chart;
}

function mergeValue(base, ours, theirs, path, conflicts) {
  if (deepEqual(ours, theirs)) return cloneValue(ours);
  if (deepEqual(base, ours)) return cloneValue(theirs);
  if (deepEqual(base, theirs)) return cloneValue(ours);
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  if (isObject(base) && isObject(ours) && isObject(theirs)) return mergeObject(base, ours, theirs, path, conflicts);
  if (Array.isArray(base) && Array.isArray(ours) && Array.isArray(theirs)) return mergeArray(base, ours, theirs, path, conflicts);
  conflicts.push(mergeConflict(path, base, ours, theirs));
  return cloneValue(ours);
}

export function mergeCharts(base, ours, theirs) {
  const conflicts = [];
  const chart = mergeValue(base ?? {}, ours ?? {}, theirs ?? {}, [], conflicts);
  if (!conflicts.length) sortChartCollections(chart);
  return { chart, conflicts };
}

export function mergeAssets(base = [], ours = [], theirs = []) {
  const before = new Map(base.map(entry => [entry.path, entry]));
  const our = new Map(ours.map(entry => [entry.path, entry]));
  const their = new Map(theirs.map(entry => [entry.path, entry]));
  const result = [];
  const conflicts = [];
  const paths = [...new Set([...before.keys(), ...our.keys(), ...their.keys()])].sort();
  for (const path of paths) {
    const inBase = before.has(path), inOurs = our.has(path), inTheirs = their.has(path);
    const conflictPath = ['assets', path];
    if (inOurs && inTheirs) {
      const oursEntry = our.get(path), theirsEntry = their.get(path), baseEntry = before.get(path);
      if (deepEqual(oursEntry, theirsEntry)) result.push(cloneValue(oursEntry));
      else if (deepEqual(baseEntry, oursEntry)) result.push(cloneValue(theirsEntry));
      else if (deepEqual(baseEntry, theirsEntry)) result.push(cloneValue(oursEntry));
      else {
        conflicts.push(mergeConflict(conflictPath, baseEntry, oursEntry, theirsEntry, true, true, 'asset'));
        result.push(cloneValue(oursEntry));
      }
    } else if (inOurs) {
      if (!inBase) result.push(cloneValue(our.get(path)));
      else if (!deepEqual(our.get(path), before.get(path))) {
        conflicts.push(mergeConflict(conflictPath, before.get(path), our.get(path), undefined, true, false, 'asset'));
        result.push(cloneValue(our.get(path)));
      }
    } else if (inTheirs) {
      if (!inBase) result.push(cloneValue(their.get(path)));
      else if (!deepEqual(their.get(path), before.get(path))) {
        conflicts.push(mergeConflict(conflictPath, before.get(path), undefined, their.get(path), false, true, 'asset'));
        result.push(cloneValue(their.get(path)));
      }
    }
  }
  return { assets: result, conflicts };
}

function setAtPath(root, path, value) {
  if (!path.length) return;
  let parent = root;
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index];
    const next = path[index + 1];
    if (parent[key] === undefined || parent[key] === null || typeof parent[key] !== 'object') {
      parent[key] = typeof next === 'number' ? [] : {};
    }
    parent = parent[key];
  }
  parent[path.at(-1)] = cloneValue(value);
}

function getAtPath(root, path) {
  let parent = root;
  for (const key of path) {
    if (parent === undefined || parent === null) return undefined;
    parent = parent[key];
  }
  return parent;
}

function removeAtPaths(root, paths) {
  const arrayGroups = new Map();
  for (const path of paths) {
    if (!path.length) continue;
    const parentPath = path.slice(0, -1);
    const last = path.at(-1);
    if (typeof last === 'number') {
      const key = canonicalJson(parentPath);
      if (!arrayGroups.has(key)) arrayGroups.set(key, { parentPath, indices: [] });
      arrayGroups.get(key).indices.push(last);
    } else {
      const parent = getAtPath(root, parentPath);
      if (parent && typeof parent === 'object') delete parent[last];
    }
  }
  for (const { parentPath, indices } of arrayGroups.values()) {
    const parent = getAtPath(root, parentPath);
    if (!Array.isArray(parent)) continue;
    for (const index of [...new Set(indices)].sort((left, right) => right - left)) parent.splice(index, 1);
  }
}

export function applyMergeResolutions(chart, conflicts, choices) {
  const result = cloneValue(chart);
  const removals = [];
  conflicts.forEach((conflict, index) => {
    const choice = choices[index] === 'theirs' ? 'theirs' : 'ours';
    const present = choice === 'theirs' ? conflict.theirsPresent !== false : conflict.oursPresent !== false;
    const value = choice === 'theirs' ? conflict.theirs : conflict.ours;
    if (present) setAtPath(result, conflict.pathArray, value);
    else removals.push(conflict.pathArray);
  });
  removeAtPaths(result, removals);
  return result;
}

export function applyAssetResolutions(assets, conflicts, choices) {
  const result = new Map((assets ?? []).map(entry => [entry.path, cloneValue(entry)]));
  conflicts.forEach((conflict, index) => {
    const path = conflict.pathArray[1];
    const choice = choices[index] === 'theirs' ? 'theirs' : 'ours';
    const present = choice === 'theirs' ? conflict.theirsPresent !== false : conflict.oursPresent !== false;
    if (present) result.set(path, cloneValue(choice === 'theirs' ? conflict.theirs : conflict.ours));
    else result.delete(path);
  });
  return [...result.values()].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function compareCommits(left, right) {
  return (right?.timestamp ?? 0) - (left?.timestamp ?? 0) || String(right?.id ?? '').localeCompare(String(left?.id ?? ''));
}

export function graphLayout(commits, refs = {}) {
  const byId = new Map();
  for (const commit of commits ?? []) if (commit?.id) byId.set(commit.id, commit);
  const candidates = [...byId.values()].sort(compareCommits);
  const indegree = new Map(candidates.map(commit => [commit.id, 1]));
  for (const commit of candidates) {
    for (const parent of commit.parents ?? []) {
      if (byId.has(parent)) indegree.set(parent, indegree.get(parent) + 1);
    }
  }
  const queue = candidates.filter(commit => indegree.get(commit.id) === 1);
  const ordered = [];
  while (queue.length) {
    const commit = queue.shift();
    ordered.push(commit);
    for (const parent of commit.parents ?? []) {
      if (!byId.has(parent)) continue;
      const count = indegree.get(parent);
      if (!count) continue;
      indegree.set(parent, count - 1);
      if (count - 1 === 1) queue.unshift(byId.get(parent));
    }
    indegree.set(commit.id, 0);
  }
  const orderedIds = new Set(ordered.map(commit => commit.id));
  for (const commit of candidates) if (!orderedIds.has(commit.id)) { ordered.push(commit); orderedIds.add(commit.id); }

  const branches = refs.branches ?? {};
  const tags = refs.tags ?? {};
  const refsByCommit = new Map();
  const addRef = (id, ref) => {
    if (!id) return;
    if (!refsByCommit.has(id)) refsByCommit.set(id, []);
    refsByCommit.get(id).push(ref);
  };
  for (const [name, id] of Object.entries(branches)) addRef(id, { type: 'branch', name, head: refs.head?.type === 'branch' && refs.head.name === name });
  for (const [name, tag] of Object.entries(tags)) addRef(typeof tag === 'string' ? tag : tag?.commit, { type: 'tag', name });
  if (refs.head?.type === 'detached') addRef(refs.head.commit, { type: 'head', name: 'HEAD', head: true });

  const branchColor = new Map(Object.keys(branches).sort().map((name, index) => [name, index % GRAPH_COLOR_COUNT]));
  const tagColor = new Map(Object.keys(tags).sort().map((name, index) => [name, (branchColor.size + index) % GRAPH_COLOR_COUNT]));
  const labelColor = id => {
    const itemRefs = refsByCommit.get(id) ?? [];
    const branch = itemRefs.find(ref => ref.type === 'branch');
    if (branch) return branchColor.get(branch.name);
    const tag = itemRefs.find(ref => ref.type === 'tag');
    if (tag) return tagColor.get(tag.name);
    if (itemRefs.some(ref => ref.type === 'head')) return 0;
    return undefined;
  };
  const refColor = ref => ref.type === 'branch' ? branchColor.get(ref.name) : ref.type === 'tag' ? tagColor.get(ref.name) : 0;
  const refOrder = ref => ref.type === 'branch' ? 0 : ref.type === 'head' ? 1 : 2;

  let colorIndex = -1;
  let previousOutput = [];
  const rows = [];
  for (const commit of ordered) {
    const inputSwimlanes = previousOutput.map(node => ({ ...node }));
    const outputSwimlanes = [];
    const parents = commit.parents ?? [];
    const inputIndex = inputSwimlanes.findIndex(node => node.id === commit.id);
    const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;
    let firstParentAdded = false;
    if (parents.length) {
      for (const node of inputSwimlanes) {
        if (node.id === commit.id) {
          if (!firstParentAdded) {
            outputSwimlanes.push({ id: parents[0], color: node.color });
            firstParentAdded = true;
          }
          continue;
        }
        outputSwimlanes.push({ ...node });
      }
    }
    for (let index = firstParentAdded ? 1 : 0; index < parents.length; index++) {
      let color = index === 0 ? labelColor(commit.id) : labelColor(parents[index]);
      if (color === undefined) {
        colorIndex = (colorIndex + 1) % GRAPH_COLOR_COUNT;
        color = colorIndex;
      }
      outputSwimlanes.push({ id: parents[index], color });
    }
    const circleColor = labelColor(commit.id) ?? outputSwimlanes[circleIndex]?.color ?? inputSwimlanes[circleIndex]?.color ?? 0;
    const incomingLanes = [];
    inputSwimlanes.forEach((node, index) => { if (node.id === commit.id && index !== circleIndex) incomingLanes.push(index); });
    const commitRefs = (refsByCommit.get(commit.id) ?? [])
      .map(ref => ({ ...ref, color: refColor(ref) }))
      .sort((left, right) => refOrder(left) - refOrder(right) || left.name.localeCompare(right.name));
    const row = {
      id: commit.id, commit, index: rows.length, lane: circleIndex,
      inputSwimlanes, outputSwimlanes, circleIndex, circleColor, incomingLanes, refs: commitRefs,
      color: circleColor,
      head: refs.head?.type === 'detached' ? refs.head.commit === commit.id : branches[refs.head?.name] === commit.id
    };
    rows.push(row);
    previousOutput = outputSwimlanes;
  }

  const rowById = new Map(rows.map(row => [row.id, row]));
  const edges = [];
  for (const row of rows) {
    for (const parent of row.commit.parents ?? []) {
      const target = rowById.get(parent);
      if (target) edges.push({ from: row, to: target, color: row.circleColor });
    }
    for (const incomingLane of row.incomingLanes) {
      edges.push({
        from: { ...row, lane: incomingLane }, to: row,
        color: row.inputSwimlanes[incomingLane]?.color ?? row.circleColor, incoming: true
      });
    }
  }
  const laneCount = Math.max(1, ...rows.map(row => Math.max(row.inputSwimlanes.length, row.outputSwimlanes.length, row.circleIndex + 1)));
  return { rows, edges, laneCount, rowCount: rows.length };
}
