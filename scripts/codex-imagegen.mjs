#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { generateSubscriptionImage } from '../src/imagegen/subscription.mjs';

const controller = new AbortController();
process.on('SIGINT', () => controller.abort());
process.on('SIGTERM', () => controller.abort());
try {
  const options = { signal: controller.signal, references: [] };
  let doctor = false, authFile = join(homedir(), '.codex', 'auth.json');
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === '--help') {
      console.log('node scripts/codex-imagegen.mjs --doctor\nnode scripts/codex-imagegen.mjs --prompt "图片描述" --out "E:/output/image.png"\n选项: --prompt-file FILE, --ref FILE（最多5次）, --transparent, --timeout-ms 300000, --auth-file FILE\n凭证: CODEX_ACCESS_TOKEN + CODEX_ACCOUNT_ID，或无为订阅登录保存的auth.json。无需安装Codex/ChatGPT。');
      process.exit(0);
    }
    if (flag === '--doctor') { doctor = true; continue; }
    if (flag === '--transparent') { options.transparentBackground = true; continue; }
    const key = { '--prompt': 'prompt', '-p': 'prompt', '--out': 'out', '-o': 'out' }[flag];
    if (!key && !['--prompt-file', '--ref', '--timeout-ms', '--auth-file'].includes(flag)) throw new Error('未知选项，请使用--help。');
    const value = process.argv[++i]; if (!value) throw new Error('命令参数缺少值。');
    if (key) options[key] = value;
    else if (flag === '--prompt-file') options.prompt = await readFile(value, 'utf8');
    else if (flag === '--ref') options.references.push(value);
    else if (flag === '--auth-file') authFile = value;
    else options.timeoutMs = Number(value);
  }
  let saved = {};
  if (!process.env.CODEX_ACCESS_TOKEN || !process.env.CODEX_ACCOUNT_ID) {
    try { saved = JSON.parse(await readFile(authFile, 'utf8'))?.tokens || {}; } catch { /* missing login */ }
  }
  options.accessToken = process.env.CODEX_ACCESS_TOKEN || saved.access_token || '';
  options.accountId = process.env.CODEX_ACCOUNT_ID || saved.account_id || '';
  if (!options.accessToken || !options.accountId || /^sk-/i.test(options.accessToken)) throw new Error('请先登录无为的Codex订阅账号。');
  const result = doctor ? { ok: true, backend: 'codex-subscription-http', credentialsPresent: true, requiresCodex: false, networkVerified: false } : await generateSubscriptionImage(options);
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: error.code || 'INVALID_INPUT', message: error.code ? error.message : '输入或订阅凭证读取失败，请检查参数。', details: error.details }));
  process.exitCode = 1;
}
