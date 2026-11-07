import { createApp } from 'vue';
import SettingsContent from './SettingsContent.vue';
import type { RpenSettingsGroupPayload } from '../../bridge';

export function createSettingsPanel({ host, fields }: RpenSettingsGroupPayload): void {
  const container = document.createElement('div');
  container.className = 'settings-fields';
  host.append(container);
  createApp(SettingsContent, { fields }).mount(container);
}
