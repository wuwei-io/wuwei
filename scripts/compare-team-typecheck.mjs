import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('../docs/verification/default-team-i18n/typecheck/', import.meta.url);
function normalize(s) { return s.replaceAll('\\','/').replace(/(?:[A-Z]:\/[^\n]*?\/)?(?=(?:desktop|src)\/)/g, '').replace(/\(\d+,\d+\)/g,'(LINE,COLUMN)').trim(); }
const base=readFileSync(new URL('base.txt',dir),'utf8');
const current=readFileSync(new URL('current.txt',dir),'utf8');
const a=normalize(base),b=normalize(current);
writeFileSync(new URL('base-normalized.txt',dir),a+'\n');
writeFileSync(new URL('current-normalized.txt',dir),b+'\n');
const summary=`BASE_ERRORS=${(base.match(/error TS/g)||[]).length}\nCURRENT_ERRORS=${(current.match(/error TS/g)||[]).length}\nNORMALIZED_DIFF=${a===b?'EMPTY':'DIFFERENT'}\n`;
writeFileSync(new URL('comparison.txt',dir),summary);
writeFileSync(new URL('normalized.diff',dir),a===b?'':`BASE\n${a}\nCURRENT\n${b}\n`);
console.log(summary);
if(a!==b) process.exit(1);
