import { createApp, type App, type ComponentPublicInstance } from 'vue';
import type { RpenHistoryHandles, RpenHistoryPanelData, RpenHistoryPanelPayload } from '../../bridge';
import HistoryPanel from './HistoryPanel.vue';

let mounted: { app: App<Element>; vm: ComponentPublicInstance } | null = null;

export function createHistoryPanel(payload: RpenHistoryPanelPayload): RpenHistoryHandles {
  const { host, ...props } = payload;
  mounted?.app.unmount();
  const app = createApp(HistoryPanel, props);
  const vm = app.mount(host);
  mounted = { app, vm };
  return { render: (data: RpenHistoryPanelData) => (vm as unknown as { render(data: RpenHistoryPanelData): void }).render(data) };
}
