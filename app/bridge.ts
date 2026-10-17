export interface RpenSettingsBridge {
  setDisplayField(key: string, control: HTMLInputElement): void;
  validateFpsLimit(raw: string, unlimited: boolean): { valid: boolean; value: number };
  commitFpsLimit(value: number): void;
}

export interface RpenSettingsIsland {
  createSettingsPanel(): HTMLDialogElement;
}

declare global {
  interface Window {
    rpenIslands?: { settings?: RpenSettingsIsland };
    rpenSettingsBridge?: RpenSettingsBridge;
  }
}
