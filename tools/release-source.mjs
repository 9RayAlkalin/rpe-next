import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { readZip } from '../src/platform/archive.mjs';

export function extractReleaseTar(archive, destination) {
  // Git writes UTF-8 paths. Windows tar otherwise decodes them using its locale.
  const encoding = process.platform === 'win32' ? ['--options=hdrcharset=UTF-8'] : [];
  execFileSync('tar', [...encoding, '-xf', archive, '-C', destination]);
}

async function verifySources(root, ref, paths, read) {
  const tree = execFileSync('git', ['ls-tree', '-rz', '--full-tree', ref, '--', ...paths], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 });
  let files = 0;
  for (const record of tree.split('\0').filter(Boolean)) {
    const entry = /^(\d{6}) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(record);
    if (!entry) throw Error('Unsupported release source entry: ' + record);
    const [, mode, expected, path] = entry;
    let bytes;
    try { bytes = await read(path, mode); }
    catch (cause) { throw Error('Missing release source file: ' + path, { cause }); }
    if (!bytes) throw Error('Missing release source file: ' + path);
    const actual = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    if (actual !== expected) throw Error('Release source content mismatch: ' + path);
    files++;
  }
  if (!files) throw Error('Release source selection is empty');
  return files;
}

export function verifyReleaseSourceDirectory(root, ref, paths, directory) {
  return verifySources(root, ref, paths, async (path, mode) => mode === '120000'
    ? Buffer.from(await readlink(join(directory, path))) : readFile(join(directory, path)));
}

export async function verifyReleaseSourceZip(root, ref, paths, archive, prefix) {
  const files = await readZip(await readFile(archive), { includeEntry: name => name.startsWith(prefix) });
  return verifySources(root, ref, paths, path => files.get(prefix + path));
}
