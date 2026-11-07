import catalog from '../src/locales/zh-CN.mjs';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Resolve static translations when comparing legacy and Vue markup. Dynamic
// translations remain covered by the locale and interaction tests.
export async function readLocalizedSource(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 't' && ts.isStringLiteral(node.arguments[0])) {
      const message = catalog.messages[node.arguments[0].text];
      if (message !== undefined) {
        const parameters = node.arguments[1];
        if (parameters && ts.isObjectLiteralExpression(parameters)) {
          const values = new Map(parameters.properties.filter(ts.isPropertyAssignment).map(property => [property.name.getText(ast), property.initializer.getText(ast)]));
          edits.push([node.getStart(ast), node.end, '`' + message.replace(/\{(\w+)\}/g, (_, key) => '${' + values.get(key) + '}').replaceAll('\n', '\\n') + '`']);
        } else edits.push([node.getStart(ast), node.end, `'${message.replaceAll("'", "\\'")}'`]);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let localized = source, boundary = source.length;
  for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0])) {
    if (end > boundary) continue;
    localized = localized.slice(0, start) + value + localized.slice(end); boundary = start;
  }
  return localized
    .replace(/<span data-i18n="([^"]+)"><\/span>/g, (match, key) => catalog.messages[key] ?? match);
}
