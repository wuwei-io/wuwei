import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const localization = spawnSync(process.execPath, ['scripts/i18n-generate.mjs'], { stdio: 'inherit' });
if (localization.status !== 0) process.exit(localization.status ?? 1);
const localizationCheck = spawnSync(process.execPath, ['scripts/i18n-check.mjs'], { stdio: 'inherit' });
if (localizationCheck.status !== 0) process.exit(localizationCheck.status ?? 1);
const files = readdirSync('tests').filter(f => /\.test\.(?:mjs|ts)$/.test(f)).sort().map(f => `tests/${f}`);
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
