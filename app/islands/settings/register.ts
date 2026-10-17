import { createApp } from 'vue';
import SettingsContent from './SettingsContent.vue';

const MOVED = ['.preview-settings', '.display-settings', '.compatibility-details'];

export function createSettingsPanel(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.id = 'settings-modal';
  document.body.append(dialog);
  createApp(SettingsContent, { close: () => dialog.close() }).mount(dialog);
  const body = dialog.querySelector('.settings-body');
  for (const selector of MOVED) {
    const node = document.querySelector(selector);
    if (node && body) body.append(node);
  }
  return dialog;
}
