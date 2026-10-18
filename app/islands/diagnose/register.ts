import { createApp, type App, type ComponentPublicInstance } from 'vue';
import type { RpenDiagnoseHandles, RpenDiagnosePanelData, RpenDiagnosePanelPayload } from '../../bridge';
import DiagnosePanel from './DiagnosePanel.vue';

let mounted: { app: App<Element>; vm: ComponentPublicInstance } | null = null;

export function createDiagnosePanel(payload: RpenDiagnosePanelPayload): RpenDiagnoseHandles {
  const { host, ...props } = payload;
  mounted?.app.unmount();
  const app = createApp(DiagnosePanel, props);
  const vm = app.mount(host);
  mounted = { app, vm };
  return { render: (data: RpenDiagnosePanelData) => (vm as unknown as { render(data: RpenDiagnosePanelData): void }).render(data) };
}
