import { mkdtemp, mkdir, copyFile, rm, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') throw Error('图标生成需要 macOS 的 sips 与 iconutil。');
const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'assets/rpe/icons/rpelogo.png');
const output = join(root, 'desktop/icons');
const dimensions = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', source], { encoding: 'utf8' })
  .split('\n').filter(line => line.includes(': ')).map(line => Number(line.trim().split(': ')[1]));
if (dimensions.length !== 2 || dimensions[0] !== dimensions[1]) throw Error('源图标必须是正方形 PNG：' + source);
const iconSet = join(await mkdtemp(join(tmpdir(), 'rpen-iconset-')), 'app.iconset');
await mkdir(iconSet, { recursive: true });
const resize = (size, name) => {
  const target = join(iconSet, name);
  execFileSync('sips', ['-z', String(size), String(size), source, '--out', target], { stdio: 'ignore' });
  return target;
};
const icnsEntries = [[16, 'icon_16x16.png'], [32, 'icon_16x16@2x.png'], [32, 'icon_32x32.png'], [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'], [256, 'icon_128x128@2x.png'], [256, 'icon_256x256.png'], [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'], [1024, 'icon_512x512@2x.png']];
for (const [size, name] of icnsEntries) resize(size, name);
await mkdir(output, { recursive: true });
execFileSync('iconutil', ['-c', 'icns', iconSet, '-o', join(output, 'app.icns')]);
const icoEntries = [];
for (const size of [16, 32, 48, 64, 128, 256]) icoEntries.push({ size, bytes: await readFile(resize(size, `ico-${size}.png`)) });
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(icoEntries.length, 4);
const directory = Buffer.alloc(16 * icoEntries.length);
let offset = 6 + directory.length;
icoEntries.forEach(({ size, bytes }, index) => {
  const at = index * 16;
  directory.writeUInt8(size === 256 ? 0 : size, at); directory.writeUInt8(size === 256 ? 0 : size, at + 1);
  directory.writeUInt8(0, at + 2); directory.writeUInt8(0, at + 3); directory.writeUInt16LE(1, at + 4); directory.writeUInt16LE(32, at + 6);
  directory.writeUInt32LE(bytes.length, at + 8); directory.writeUInt32LE(offset, at + 12);
  offset += bytes.length;
});
await writeFile(join(output, 'app.ico'), Buffer.concat([header, directory, ...icoEntries.map(entry => entry.bytes)]));
await copyFile(source, join(output, 'app.png'));
await rm(iconSet, { recursive: true, force: true });
console.log('已生成 desktop/icons/app.icns、app.ico 与 app.png');
