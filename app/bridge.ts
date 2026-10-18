export interface RpenSettingsBridge {
  setDisplayField(key: string, control: HTMLInputElement): void;
  validateFpsLimit(raw: string, unlimited: boolean): { valid: boolean; value: number };
  commitFpsLimit(value: number): void;
}

export interface RpenSettingsIsland {
  createSettingsPanel(): HTMLDialogElement;
}

export interface RpenDialogHandles {
  modal: HTMLDialogElement;
  content: HTMLElement;
  apply: HTMLButtonElement;
  remove: HTMLButtonElement;
  error: HTMLElement;
}

export interface RpenDialogIsland {
  createDialogShell(): RpenDialogHandles;
}

declare global {
  interface Window {
    rpenIslands?: { settings?: RpenSettingsIsland; dialog?: RpenDialogIsland };
    rpenSettingsBridge?: RpenSettingsBridge;
  }
}
