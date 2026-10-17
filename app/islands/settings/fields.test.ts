import { describe, expect, it } from 'vitest';
import { DISPLAY_KEYS, SETTINGS_GROUPS } from './fields';

describe('设置岛屿字段表', () => {
  it('字段 id 唯一且类型合法', () => {
    const ids = SETTINGS_GROUPS.flatMap(group => group.fields.map(field => field[0]));
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of SETTINGS_GROUPS) {
      expect(group.heading.length).toBeGreaterThan(0);
      for (const field of group.fields) {
        expect(['range', 'checkbox', 'number', 'color']).toContain(field[2]);
        expect(field[1].length).toBeGreaterThan(0);
      }
    }
  });

  it('范围字段带 min 与 max，默认值在范围内', () => {
    for (const group of SETTINGS_GROUPS) {
      for (const field of group.fields) {
        if (field[2] !== 'range') continue;
        expect(typeof field[4]).toBe('number');
        expect(typeof field[5]).toBe('number');
        expect(field[3] as number).toBeGreaterThanOrEqual(field[4]!);
        expect(field[3] as number).toBeLessThanOrEqual(field[5]!);
      }
    }
  });

  it('DISPLAY_KEYS 只引用存在的字段且偏好键互不重复', () => {
    const ids = new Set(SETTINGS_GROUPS.flatMap(group => group.fields.map(field => field[0])));
    for (const id of Object.keys(DISPLAY_KEYS)) expect(ids.has(id)).toBe(true);
    const keys = Object.values(DISPLAY_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
