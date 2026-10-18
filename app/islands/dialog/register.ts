import { createApp } from 'vue';
import type { RpenDialogHandles } from '../../bridge';
import DialogShell from './DialogShell.vue';

let handles: RpenDialogHandles | null = null;

function required<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`弹窗壳缺少元素：${selector}`);
  return node;
}

export function createDialogShell(): RpenDialogHandles {
  if (handles) return handles;
  let modal = document.querySelector<HTMLDialogElement>('#modal');
  if (!modal) {
    modal = document.createElement('dialog');
    modal.id = 'modal';
    document.body.append(modal);
  }
  modal.replaceChildren();
  createApp(DialogShell).mount(modal);
  handles = {
    modal,
    content: required(modal, '#modal-content'),
    apply: required(modal, '#modal-apply'),
    remove: required(modal, '#modal-delete'),
    error: required(modal, '#modal-error'),
  };
  return handles;
}
