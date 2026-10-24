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
  includeBackupCharts?: boolean;
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

export interface RpenHistoryEntry {
  label: string;
  index: number;
}

export interface RpenHistoryPanelData {
  current: number;
  entries: RpenHistoryEntry[];
}

export interface RpenHistoryHandles {
  render(data: RpenHistoryPanelData): void;
}

export interface RpenHistoryPanelPayload {
  host: HTMLElement;
  onTravel(index: number): void;
}

export interface RpenHistoryIsland {
  createHistoryPanel(payload: RpenHistoryPanelPayload): RpenHistoryHandles;
}

export interface RpenDiagnoseIssue {
  severity: string;
  path: string;
  message: string;
  beat?: number;
  line?: number;
  layer?: number;
  index?: number;
  extended?: boolean;
  noiseArea?: number;
  noiseTrack?: string;
  [key: string]: unknown;
}

export interface RpenDiagnosePanelData {
  issues: RpenDiagnoseIssue[];
  visible: boolean;
}

export interface RpenDiagnoseHandles {
  render(data: RpenDiagnosePanelData): void;
}

export interface RpenDiagnosePanelPayload {
  host: HTMLElement;
  onLocate(issue: RpenDiagnoseIssue): void;
  onDelete(issue: RpenDiagnoseIssue): void;
}

export interface RpenDiagnoseIsland {
  createDiagnosePanel(payload: RpenDiagnosePanelPayload): RpenDiagnoseHandles;
}

export interface RpenStorageStatus {
  native?: boolean;
  supported?: boolean | null;
  persistent?: boolean | null;
  root?: string;
  usage?: number | null;
  blobs?: number;
  free?: number;
  projects?: number;
  trash?: number;
  quota?: number | null;
  warnings?: string[];
  [key: string]: unknown;
}

export interface RpenStorageSnapshot extends RpenStorageStatus {
  lastBackup: number;
  firstLibrary: number;
  projectCount: number;
}

export interface RpenStorageActions {
  persist(): Promise<void>;
  refreshUsage(): Promise<void>;
  exportAll(): Promise<void>;
  manageRecovery(): Promise<void>;
  openRoot(): Promise<void>;
  moveRoot(): Promise<void>;
  backupFolder(): Promise<void>;
  manageTrash(): Promise<void>;
  useRoot(): Promise<void>;
  rebuild(): Promise<void>;
  collect(): Promise<void>;
}

export interface RpenStorageDraft {
  id: string;
  title?: string;
  name?: string;
  updated: number;
}

export interface RpenStorageTrashProject {
  id: string;
  name?: string;
  deletedAt: number;
  storageRevision?: unknown;
  [key: string]: unknown;
}

export interface RpenStorageHelpers {
  nativeStorage: boolean;
  nativeCall(method: string, ...args: unknown[]): Promise<unknown>;
  nativeList(store: string, trashed?: boolean): Promise<RpenStorageTrashProject[]>;
  storageStatus(): Promise<RpenStorageStatus>;
  requestPersistence(): Promise<unknown>;
  listProjects(): Promise<Array<{ id?: string }>>;
  listDrafts(): Promise<RpenStorageDraft[]>;
  deleteDraft(id: string): Promise<void>;
  exportLibrary(options: { progress: (index: number, count: number, name?: string) => void }): Promise<{ blob: Blob; count: number }>;
  download(blob: Blob, name: string): unknown;
  flushLocalPreferences(): Promise<void>;
  notify(message: string, kind?: string, duration?: number): void;
  showDialog(title: string, description: string): HTMLElement;
  noteExternalBackup(): void;
  readBackupTimestamps(): { last: number; first: number };
  fileOptions(): { includeBackupCharts?: boolean };
  reload(): void;
}

export interface RpenStoragePanelProps {
  native: boolean;
  reportError(error: unknown): void;
  snapshot(): Promise<RpenStorageSnapshot>;
  onReminder(update: { hidden: boolean; text: string }): void;
  actions: RpenStorageActions;
}

export interface RpenStorageCreatePayload {
  host: HTMLElement;
  native: boolean;
  reportError(error: unknown): void;
  canSwitchLibrary(): boolean;
  onReminder(update: { hidden: boolean; text: string }): void;
  helpers: RpenStorageHelpers;
}

export interface RpenStorageHandles {
  refresh(): Promise<void>;
  setStatus(text: string): void;
}

export interface RpenStorageIsland {
  createStoragePanel(payload: RpenStorageCreatePayload): RpenStorageHandles;
}

export interface RpenHomeSummary {
  version: number;
  id: string;
  storageRevision?: string | null;
  name: string;
  chartName?: string;
  identifier?: string;
  source?: string;
  imported?: number;
  bytes: number;
  updated?: number;
  group?: string | null;
  pinned?: boolean;
  archived?: boolean;
  level?: string;
  charter?: string;
  thumbnail?: Blob | null;
  composer?: string;
  lines?: number;
  notes?: number;
}

export interface RpenHomeProject {
  id: string;
  chart: { META: { name: string; [key: string]: unknown }; [key: string]: unknown };
  chartName?: string;
  assets?: Map<string, Uint8Array>;
  info?: unknown;
  bytes?: number;
  updated?: number;
  viewState?: unknown;
  source?: string;
  imported?: number;
  identifier?: string;
  storageRevision?: string | null;
  pinned?: boolean;
  archived?: boolean;
  deleted?: boolean;
}

export interface RpenHomeHelpers {
  nativeStorage: boolean;
  listProjects(): Promise<RpenHomeSummary[]>;
  readProject(id: string): Promise<RpenHomeProject | null | undefined>;
  storeProject(project: RpenHomeProject): Promise<unknown>;
  projectSummary(project: RpenHomeProject, thumbnail: Blob | null): RpenHomeSummary;
  updateSummary(summary: RpenHomeSummary): Promise<unknown>;
  deleteProject(id: string, expectedRevision?: string | null): Promise<unknown>;
  deleteProjectDrafts(id: string): Promise<unknown>;
  projectThumbnail(project: RpenHomeProject): Promise<Blob | null>;
  showDialog(title: string, description: string): HTMLElement;
}

export interface RpenHomeActions {
  open(id: string): Promise<void>;
  edit(project: RpenHomeSummary): Promise<void>;
  modify(id: string, transform: (source: RpenHomeProject) => RpenHomeProject): Promise<void>;
  remove(project: RpenHomeSummary): Promise<void>;
}

export interface RpenHomePanelProps {
  openProject(id: string): Promise<void>;
  reportError(error: unknown): void;
  changed(project: RpenHomeProject | RpenHomeSummary): void;
  helpers: RpenHomeHelpers;
  actions: RpenHomeActions;
}

export interface RpenHomeCreatePayload extends RpenHomePanelProps {
  host: HTMLElement;
}

export interface RpenHomeHandles {
  refresh(): Promise<void>;
}

export interface RpenHomeIsland {
  createHomePanel(payload: RpenHomeCreatePayload): RpenHomeHandles;
}

export interface RpenModManagerHelpers {
  formatShortcut(value: unknown): string;
  shortcutFromEvent(event: KeyboardEvent): string | null;
}

export interface RpenModManagerCard {
  id: string;
  name: string;
  active: boolean;
  selected: boolean;
  span: string;
  status: string;
}

export interface RpenModManagerSetting {
  key: string;
  type: string;
  label: string;
  description: string;
  value: unknown;
  options: Array<{ value: string; label: string }>;
  min: number | null;
  max: number | null;
  step: number | string | null;
  shortcut: boolean;
}

export interface RpenModManagerCommand {
  id: string;
  title: string;
}

export interface RpenModManagerDetail {
  id: string;
  name: string;
  description: string;
  label: string;
  builtin: boolean;
  active: boolean;
  busy: boolean;
  error: string;
  dependencies: string;
  conflicts: string;
  settings: RpenModManagerSetting[];
  commands: RpenModManagerCommand[];
  running: string;
  source: string;
}

export interface RpenModManagerState {
  cards: RpenModManagerCard[];
  detail: RpenModManagerDetail | null;
}

export interface RpenModManagerActions {
  select(id: string): void;
  toggle(id: string): Promise<void>;
  export(id: string): void;
  remove(id: string): Promise<void>;
  close(): void;
  saveSetting(id: string, key: string, value: unknown): Promise<string | null>;
  resetSettings(id: string): Promise<void>;
  runCommand(id: string, key: string): void;
  disableAll(): Promise<void>;
  pickPackage(): void;
  pickDirectory(): void;
  downloadDoc(path: string): Promise<void>;
}

export interface RpenModManagerPayload {
  helpers: RpenModManagerHelpers;
  actions: RpenModManagerActions;
}

export interface RpenModManagerHandles {
  dialog: HTMLDialogElement;
  render(state: RpenModManagerState): void;
  setBanner(text: string): void;
  setMessage(text: string): void;
}

export interface RpenModManagerIsland {
  createModManagerDialog(payload: RpenModManagerPayload): RpenModManagerHandles;
}

declare global {
  interface Window {
    rpenIslands?: {
      settings?: RpenSettingsIsland;
      dialog?: RpenDialogIsland;
      export?: RpenExportIsland;
      migration?: RpenMigrationIsland;
      history?: RpenHistoryIsland;
      diagnose?: RpenDiagnoseIsland;
      storage?: RpenStorageIsland;
      home?: RpenHomeIsland;
      mods?: RpenModManagerIsland;
    };
    rpenSettingsBridge?: RpenSettingsBridge;
  }
}
