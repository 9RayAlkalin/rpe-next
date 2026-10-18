import type { App } from 'vue';

let mounted: App<Element> | null = null;

export function releaseContentIsland(): void {
  const app = mounted;
  mounted = null;
  app?.unmount();
}

export function mountContentIsland(app: App<Element>, host: HTMLElement): void {
  releaseContentIsland();
  mounted = app;
  app.mount(host);
}
