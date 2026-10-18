import { SHELL_HOST_ID, mountShell } from './shell';
import { createDialogShell } from './islands/dialog/register';
import { createDiagnosePanel } from './islands/diagnose/register';
import { createExportDialog } from './islands/export/register';
import { createHistoryPanel } from './islands/history/register';
import { createMigrationDialog } from './islands/migration/register';
import { createSettingsPanel } from './islands/settings/register';
import { createStoragePanel } from './islands/storage/register';

window.rpenIslands = { settings: { createSettingsPanel }, dialog: { createDialogShell }, export: { createExportDialog }, migration: { createMigrationDialog }, history: { createHistoryPanel }, diagnose: { createDiagnosePanel }, storage: { createStoragePanel } };

const host = document.createElement('div');
host.id = SHELL_HOST_ID;
host.hidden = true;
document.body.append(host);
mountShell(host);
