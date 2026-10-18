import { createApp } from 'vue';
import type { RpenExportDialogPayload } from '../../bridge';
import { mountContentIsland } from '../host';
import ExportDialog from './ExportDialog.vue';

export function createExportDialog(payload: RpenExportDialogPayload): void {
  const { host, ...props } = payload;
  mountContentIsland(createApp(ExportDialog, props), host);
}
