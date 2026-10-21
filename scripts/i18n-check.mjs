import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'src/localization/locales');
const packs = Object.fromEntries(fs.readdirSync(directory).filter(name => name.endsWith('.json')).map(name => [name.slice(0, -5), JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))]));
const errors = [];
const english = packs.en.messages;
const chinese = packs.zh.messages;
const invariant = JSON.parse(fs.readFileSync(path.join(root, 'src/localization/invariant-messages.json'), 'utf8'));
const cjk = /[\u3400-\u9fff]/;
for (const key of new Set([...Object.keys(english), ...Object.keys(chinese)])) {
  if (!(key in english) || !(key in chinese)) errors.push(`Missing source translation: ${key}`);
  if (cjk.test(english[key] || '')) errors.push(`Chinese text in English message: ${key}`);
  if (english[key] === chinese[key] && /[A-Za-z]{2}/.test((english[key] || '').replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, '')) && !invariant[key]) errors.push(`Untranslated Chinese source message: ${key}`);
}
for (const [code, pack] of Object.entries(packs)) {
  if (!packs[pack.meta.fallback]) errors.push(`Unknown fallback in ${code}: ${pack.meta.fallback}`);
  for (const key of Object.keys(pack.messages)) if (!(key in english)) errors.push(`Unknown message in ${code}: ${key}`);
  // Extensions may declare partial packs. Every shipped complete pack must cover all source keys.
  if (pack.meta.complete) for (const key of Object.keys(english)) {
    if (!(key in pack.messages)) errors.push(`Missing complete translation in ${code}: ${key}`);
    else if (english[key]?.trim() && !pack.messages[key]?.trim()) errors.push(`Empty complete translation in ${code}: ${key}`);
  }
  for (const [key, message] of Object.entries(pack.messages)) {
    if (typeof message !== 'string') errors.push(`Non-string message in ${code}: ${key}`);
    const names = [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1]);
    const allowed = new Set([...`${english[key] || ''}${chinese[key] || ''}`.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1]));
    for (const name of names) if (!allowed.has(name)) errors.push(`Unknown interpolation ${name} in ${code}: ${key}`);
    if (pack.meta.complete && !['en','zh'].includes(code)) {
      const sourceNames = [...(english[key] || '').matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1]);
      if (JSON.stringify(names.sort()) !== JSON.stringify(sourceNames.sort())) errors.push(`Changed interpolation in ${code}: ${key}`);
      if (/ZXQPH\d|[\uE100\uE101]|\uFFFD/.test(message)) errors.push(`Damaged translation in ${code}: ${key}`);
      for (const token of (english[key] || '').match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|`[^`]+`|https?:\/\/[^\s<>]+/g) || []) {
        if (!message.includes(token)) errors.push(`Changed technical identifier in ${code}: ${key}: ${token}`);
      }
    }
  }
}
let checked = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'localization') walk(file); continue; }
    if (!/\.tsx?$/.test(file) || file.endsWith('.d.ts') || /(?:-test|selftest|smoke|codex-probe|codex-dump)\.tsx?$/.test(file)) continue;
    const relative = path.relative(root, file).replaceAll('\\', '/');
    // This development-only entry contains sample knowledge, equivalent to user content.
    if (relative === 'desktop/renderer/src/baby/preview.tsx') continue;
    const source = fs.readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    checked++;
    const location = node => `${relative}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}`;
    function visit(node) {
      if (ts.isCallExpression(node) && /^(?:t|tr|translate)$/.test(node.expression.getText(ast)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && !(node.arguments[0].text in english)) errors.push(`Unknown message key at ${location(node)}: ${node.arguments[0].text}`);
      if (relative.startsWith('desktop/renderer/') && (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) && cjk.test(node.text)) errors.push(`Hardcoded Chinese UI text at ${location(node)}: ${node.text.slice(0, 80)}`);
      if ((relative.startsWith('src/tools/') || relative === 'desktop/main/index.ts') && ts.isStringLiteralLike(node) && cjk.test(node.text)) {
        let owner = node.parent;
        while (owner && !ts.isPropertyAssignment(owner) && !ts.isStatement(owner)) owner = owner.parent;
        if (owner && ts.isPropertyAssignment(owner) && owner.name.getText(ast) === 'description') errors.push(`Hardcoded tool description at ${location(node)}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'desktop'));
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Localization checks passed: ${Object.keys(packs).length} language packs, ${Object.keys(english).length} messages, ${checked} source files`);
