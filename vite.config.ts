import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));
const pristine = ['src/core', 'src/application', 'src/platform', 'src/ui', 'assets', 'styles.css', 'LICENSE', 'NOTICE', 'protocols', 'schemas', 'start.cmd', 'README.md'];
const sourceFile = (source: string) => { try { return statSync(source).isDirectory() || !/\.(?:mts|ts|map)$/.test(source); } catch { return true; } };

const appScript = '<script type="module" src="./src/ui/app.mjs"></script>';

function injectShell(html: string, source: string): string {
  if (!html.includes(appScript)) throw new Error('index.html 缺少应用入口脚本锚点');
  return html.replace(appScript, `<script type="module" src="${source}"></script>\n  ${appScript}`);
}

function devShell(): Plugin {
  return {
    name: 'rpen-dev-shell',
    apply: 'serve',
    transformIndexHtml(html) {
      return injectShell(html, '/app/main.ts');
    },
  };
}

function pristineModules(): Plugin {
  return {
    name: 'rpen-pristine-modules',
    apply: 'build',
    async closeBundle() {
      const dist = join(root, 'dist');
      for (const name of pristine) await cp(join(root, name), join(dist, name), { recursive: true, filter: name.startsWith('src/') ? sourceFile : undefined });
      await mkdir(join(dist, 'tools'), { recursive: true });
      await cp(join(root, 'tools/serve.mjs'), join(dist, 'tools/serve.mjs'));
      const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      metadata.scripts = { start: 'node tools/serve.mjs --open', serve: 'node tools/serve.mjs' };
      await writeFile(join(dist, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
      await writeFile(join(dist, '.nojekyll'), '');
      const html = await readFile(join(root, 'index.html'), 'utf8');
      await writeFile(join(dist, 'index.html'), injectShell(html, './assets/shell.js'));
    },
  };
}

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      { find: '@rpen/api', replacement: fileURLToPath(new URL('src/ui/mod-api.mjs', import.meta.url)) },
      { find: /^@rpen\/(core|application|platform|ui)\/(.+\.mjs)$/, replacement: fileURLToPath(new URL('src/$1/$2', import.meta.url)) },
    ],
  },
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
