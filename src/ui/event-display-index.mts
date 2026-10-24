import { beatValue } from '../core/beat.mjs';
import { eventChains } from '../core/editor-display.mjs';
import { IntervalIndex } from '../core/interval-index.mjs';

// Chart edits replace event lists. Keep geometry-independent work until that chart changes.
export function eventDisplayIndex(owner, events, chart) {
  if (owner.eventDisplayChart !== chart) {
    owner.eventDisplayChart = chart;
    owner.eventDisplayCache = new WeakMap<any, any>();
  }
  owner.eventDisplayCache ??= new WeakMap<any, any>();
  let display = owner.eventDisplayCache.get(events);
  if (!display || display.length !== events.length) {
    const groups = eventChains(events); const ranges = new Map<any, any>(); const unmergeable = new Set<any>();
    for (const group of groups) for (const { event, index } of group.entries) {
      ranges.set(index, group);
      if (Number(event.linkgroup ?? 0) > 0 || event.inst === true || Number(event.inst) === 1) unmergeable.add(group);
    }
    display = { length: events.length, groups, ranges, unmergeable,
      index: new IntervalIndex(events, event => beatValue(event.startTime), event => beatValue(event.endTime)) };
    owner.eventDisplayCache.set(events, display);
  }
  return display;
}

export function selectedEventGroups(selection, type, ranges) {
  const groups = new Set<any>(); const prefix = type + ':';
  for (const key of selection) if (key.startsWith(prefix)) {
    const group = ranges.get(Number(key.slice(prefix.length)));
    if (group) groups.add(group);
  }
  return groups;
}
