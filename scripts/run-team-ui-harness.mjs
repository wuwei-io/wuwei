import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = mkdtempSync(resolve(tmpdir(), 'wuwei-team-ui-'));
const evidence = resolve(repo, 'docs/verification/default-team-i18n/ui');
mkdirSync(evidence, { recursive: true });
const html = resolve(root, 'index.html');
writeFileSync(html, `<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module" src="${resolve(repo, 'tests/team-ui-harness.tsx').replaceAll('\\', '/')}"></script></body></html>`);
await build({ configFile: false, root, base: './', plugins: [{ name: 'js-to-ts', resolveId(s, importer) { if (importer && s.startsWith('.') && s.endsWith('.js')) { const p = resolve(dirname(importer), s); for (const ext of ['.ts','.tsx']) { const c=p.slice(0,-3)+ext; if(existsSync(c)) return c; } } } }], esbuild: { jsx: 'automatic' }, build: { outDir: resolve(root,'built'), emptyOutDir: true, rollupOptions: { input: html } } });
const env = { ...process.env, TEAM_UI_TEMP_ROOT: root, TEAM_UI_EVIDENCE: evidence, TEAM_UI_HTML: resolve(root,'built/index.html') };
for (const key of ['HOME','USERPROFILE','APPDATA','LOCALAPPDATA']) { env[key]=resolve(root,key.toLowerCase()); mkdirSync(env[key],{recursive:true}); }
delete env.ELECTRON_RUN_AS_NODE;
// Remove known credential/path overrides without reading their values or passing them onward.
for (const key of Object.keys(env)) if (/API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|CODEX_HOME|CLAUDE_CONFIG|WUWEI_DATA_DIR|EXPO_TOKEN/i.test(key)) delete env[key];
const r=spawnSync(resolve(repo,'node_modules/electron/dist/electron.exe'), [resolve(repo,'scripts/team-ui-electron.cjs')], {env, cwd: root, encoding:'utf8', timeout:120000});
const log = `TEMP_ROOT=${root}\n${r.stdout||''}${r.stderr||''}\nEXIT=${r.status}\n${r.error ? r.error.message : ''}`;
writeFileSync(resolve(evidence,'interaction.txt'),log); console.log(log);
if(r.status!==0) process.exit(1);
