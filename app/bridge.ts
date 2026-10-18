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

export interface RpenExportChart {
  blockAreaList?: unknown[];
  globalEvents?: { types?: Record<string, { columns: Record<string, { events: unknown[] }> }> };
}

export interface RpenExportHelpers {
  createChartExport(chart: unknown, assets: unknown, chartName: string, options: Record<string, unknown>): { blob: Blob; name: string };
  download(blob: Blob, name: string): string;
  chartExportStem(chart: unknown, chartName: string): string;
  suggestDownloadName(name: string): string;
  diagnoseNoiseAreas(list: unknown): Array<{ path: string; message: string }>;
  DEFAULT_TRAJECTORY_SPLIT: { simplify: boolean; tolerance: number };
}

export interface RpenExportDialogPayload {
  host: HTMLElement;
  chart: RpenExportChart;
  assets: Map<string, Uint8Array>;
  chartName: string;
  identifier?: string;
  onExport(name: string, container: string): void;
  helpers: RpenExportHelpers;
}

export interface RpenExportIsland {
  createExportDialog(payload: RpenExportDialogPayload): void;
}

declare global {
  interface Window {
    rpenIslands?: { settings?: RpenSettingsIsland; dialog?: RpenDialogIsland; export?: RpenExportIsland };
    rpenSettingsBridge?: RpenSettingsBridge;
  }
}
