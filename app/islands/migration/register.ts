import { createApp } from 'vue';
import type { RpenMigrationDialogPayload } from '../../bridge';
import { mountContentIsland } from '../host';
import MigrationDialog from './MigrationDialog.vue';

export function createMigrationDialog(payload: RpenMigrationDialogPayload): void {
  const { host, ...props } = payload;
  mountContentIsland(createApp(MigrationDialog, props), host);
}
