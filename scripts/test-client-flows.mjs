import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || path.join(repo, '.qa-client-flows'));
const profile = path.join(output, '.profile-' + randomUUID());
const owner = randomUUID();
mkdirSync(profile, { recursive: true });
writeFileSync(path.join(profile, 'qa-owner.json'), JSON.stringify({ owner }));
const server = await createServer({ configFile: path.join(repo, 'tests/client-flows/vite.config.ts'), cacheDir: path.join(profile, 'vite-cache') });
await server.listen();
const env = { ...process.env, WUWEI_QA_OUTPUT: output, WUWEI_QA_PROFILE: profile, WUWEI_QA_RENDERER_URL: 'http://127.0.0.1:5191/' };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.join(repo, 'tests/client-flows/runner.cjs')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const chunks = [];
child.stdout.on('data', data => { chunks.push(data); process.stdout.write(data); });
child.stderr.on('data', data => { chunks.push(data); process.stderr.write(data); });
const timeout = setTimeout(() => child.kill(), 180_000);
let code;
try {
  code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', value => resolve(value ?? 1)); });
} finally {
  clearTimeout(timeout);
  await server.close();
  writeFileSync(path.join(output, 'runner.log'), Buffer.concat(chunks));
  const resolved = path.resolve(profile);
  if (resolved.startsWith(output + path.sep) && JSON.parse(readFileSync(path.join(profile, 'qa-owner.json'))).owner === owner) rmSync(resolved, { recursive: true, force: true });
}
process.exitCode = code;
