import { createApp, defineComponent } from 'vue';

export const SHELL_HOST_ID = 'rpen-vue-shell';

const Shell = defineComponent({
  name: 'RpenShell',
  render: () => null,
});

export function mountShell(host: HTMLElement): void {
  createApp(Shell).mount(host);
}
