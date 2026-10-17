import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));
const pristine = ['src/core', 'src/application', 'src/platform', 'src/ui', 'assets', 'styles.css', 'LICENSE', 'NOTICE', 'protocols', 'schemas', 'start.cmd', 'README.md'];

const shellTag = (source: string) => `  <script type="module" src="${source}"></script>\n</body>`;

function devShell(): Plugin {
  return {
    name: 'rpen-dev-shell',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace('</body>', shellTag('/app/main.ts'));
    },
  };
}

function pristineModules(): Plugin {
  return {
    name: 'rpen-pristine-modules',
    apply: 'build',
    async closeBundle() {
      const dist = join(root, 'dist');
      for (const name of pristine) await cp(join(root, name), join(dist, name), { recursive: true });
      await mkdir(join(dist, 'tools'), { recursive: true });
      await cp(join(root, 'tools/serve.mjs'), join(dist, 'tools/serve.mjs'));
      const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      metadata.scripts = { start: 'node tools/serve.mjs --open', serve: 'node tools/serve.mjs' };
      await writeFile(join(dist, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
      await writeFile(join(dist, '.nojekyll'), '');
      const html = await readFile(join(root, 'index.html'), 'utf8');
      await writeFile(join(dist, 'index.html'), html.replace('</body>', shellTag('./assets/shell.js')));
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      input: { shell: fileURLToPath(new URL('app/main.ts', import.meta.url)) },
      output: {
        entryFileNames: 'assets/shell.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: { vue: ['vue'] },
      },
    },
  },
  plugins: [vue(), devShell(), pristineModules()],
  test: { environment: 'node', include: ['app/**/*.test.ts'], passWithNoTests: true },
});
