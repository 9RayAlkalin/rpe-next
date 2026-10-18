import { createApp, type App } from 'vue';
import type { RpenExportDialogPayload } from '../../bridge';
import ExportDialog from './ExportDialog.vue';

let current: App<Element> | null = null;

export function createExportDialog(payload: RpenExportDialogPayload): void {
  const { host, ...props } = payload;
  current?.unmount();
  current = createApp(ExportDialog, props);
  current.mount(host);
}
