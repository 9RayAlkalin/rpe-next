import { createApp, type ComponentPublicInstance } from 'vue';
import ModManagerPanel from './ModManagerPanel.vue';
import type { RpenModManagerHandles, RpenModManagerPayload, RpenModManagerState } from '../../bridge';

type ModManagerVm = ComponentPublicInstance & {
  render(state: RpenModManagerState): void;
  setBanner(text: string): void;
  setMessage(text: string): void;
};

export function createModManagerDialog(payload: RpenModManagerPayload): RpenModManagerHandles {
  const dialog = document.createElement('dialog');
  dialog.id = 'mod-manager';
  dialog.className = 'mod-manager';
  dialog.dataset.modInteractive = 'true';
  document.body.append(dialog);
  const app = createApp(ModManagerPanel, { payload });
  const vm = app.mount(dialog) as unknown as ModManagerVm | null;
  return {
    dialog,
    render: state => vm?.render(state),
    setBanner: text => vm?.setBanner(text),
    setMessage: text => vm?.setMessage(text),
  };
}
