import { SHELL_HOST_ID, mountShell } from './shell';
import { createDialogShell } from './islands/dialog/register';
import { createDiagnosePanel } from './islands/diagnose/register';
import { createExportDialog } from './islands/export/register';
import { createHistoryPanel } from './islands/history/register';
import { createMigrationDialog } from './islands/migration/register';
import { createSettingsPanel } from './islands/settings/register';
import { createStoragePanel } from './islands/storage/register';
import { createHomePanel } from './islands/home/register';
import { createModManagerDialog } from './islands/mods/register';

window.rpenIslands = { settings: { createSettingsPanel }, dialog: { createDialogShell }, export: { createExportDialog }, migration: { createMigrationDialog }, history: { createHistoryPanel }, diagnose: { createDiagnosePanel }, storage: { createStoragePanel }, home: { createHomePanel }, mods: { createModManagerDialog } };

const host = document.createElement('div');
host.id = SHELL_HOST_ID;
host.hidden = true;
document.body.append(host);
mountShell(host);
