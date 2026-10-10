import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync('tests').filter(f => f.endsWith('.test.mjs')).sort().map(f => `tests/${f}`);
files.push('tests/context-window.test.ts');
files.push('tests/default-team-localization.test.ts');
files.push('tests/default-departments.test.ts');
for (const name of ['announcement-content', 'announcement-locale', 'announcement-delivery', 'employee-session-title', 'employee-session-delete']) files.push(`tests/${name}.test.ts`);
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
