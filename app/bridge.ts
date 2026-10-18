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
  releaseContent(): void;
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

export interface RpenMigrationProject {
  path: string;
  directory?: string;
  name?: string;
  identifier?: string;
  id?: string;
  error?: string;
  extra?: unknown;
  [key: string]: unknown;
}

export interface RpenMigrationFailure {
  path: string;
  message?: string;
}

export interface RpenMigrationReport {
  appliedHotkeys: unknown[];
  appliedSettings: string[];
  retainedHotkeys: unknown[];
  retainedSettings: unknown[];
}

export interface RpenMigrationPlan {
  sourceName: string;
  projects: RpenMigrationProject[];
  failures: RpenMigrationFailure[];
  skipped?: unknown[];
  preferences: { report: RpenMigrationReport; [key: string]: unknown };
  entries: Array<{ path: string; getFile(): Promise<File> }>;
}

export interface RpenMigrationStoredProject {
  id: string;
  storageRevision?: unknown;
  source: string;
  bytes: number;
  [key: string]: unknown;
}

export interface RpenMigrationEntry {
  project: RpenMigrationProject;
  existing?: RpenMigrationStoredProject | null;
}

export interface RpenMigrationResult {
  source: string;
  imported: Array<{ source: string; bytes: number; overwritten: boolean; extra?: unknown }>;
  failed: RpenMigrationFailure[];
  skipped?: Array<{ source: string; reason: string }>;
  preferences: RpenMigrationReport;
}

export interface RpenMigrationHelpers {
  listProjects(): Promise<RpenMigrationStoredProject[]>;
  migrationConflicts(projects: RpenMigrationProject[], existing: RpenMigrationStoredProject[]): RpenMigrationEntry[];
  materializeProject(plan: RpenMigrationPlan, project: RpenMigrationProject): Promise<RpenMigrationStoredProject>;
  storeProject(project: RpenMigrationStoredProject): Promise<void>;
  storePreferences(preferences: unknown): Promise<void>;
  readProjectRevision(id: string): Promise<{ deleted?: boolean; revision?: unknown } | null | undefined>;
  storageFailure(error: unknown): string;
  download(blob: Blob, name: string): string;
}

export interface RpenMigrationDialogPayload {
  host: HTMLElement;
  plan: RpenMigrationPlan;
  applyPreferences(preferences: RpenMigrationPlan['preferences']): void;
  helpers: RpenMigrationHelpers;
}

export interface RpenMigrationIsland {
  createMigrationDialog(payload: RpenMigrationDialogPayload): void;
}

declare global {
  interface Window {
    rpenIslands?: {
      settings?: RpenSettingsIsland;
      dialog?: RpenDialogIsland;
      export?: RpenExportIsland;
      migration?: RpenMigrationIsland;
    };
    rpenSettingsBridge?: RpenSettingsBridge;
  }
}
