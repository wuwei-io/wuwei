import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { historyPolicy, windowHistory, type HistoryDigest } from '../../../src/team/history-window.js';
import type { Message } from '../../../src/types.js';
import { loadTeamConfig } from './store.js';

const dir = () => join(homedir(), process.env.WUWEI_DATA_DIR_NAME || '.wuwei', 'team', 'context-summaries');
const file = (key: string) => join(dir(), createHash('sha256').update(key).digest('hex') + '.json');
export function clearTeamHistoryDigest(key: string): void {
  try { rmSync(file(key), { force: true }); } catch { /* Derived cache; never block chat. */ }
}

/** Policy is read for every request so existing conversations immediately follow settings. */
export function teamRequestHistory(key: string): (messages: Message[]) => Message[] {
  return messages => {
    let cached: HistoryDigest | undefined;
    try { cached = JSON.parse(readFileSync(file(key), 'utf8')); } catch { /* Cold/missing/corrupt cache. */ }
    const result = windowHistory(messages, historyPolicy(loadTeamConfig()), cached, process.env.WUWEI_LANG === 'en');
    if (!result.digest) clearTeamHistoryDigest(key);
    else if (result.digest !== cached) {
      try {
        mkdirSync(dir(), { recursive: true });
        const tmp = file(key) + '.tmp';
        writeFileSync(tmp, JSON.stringify(result.digest), 'utf8');
        renameSync(tmp, file(key));
      } catch { /* Cache failure must never restore full request history. */ }
    }
    return result.messages;
  };
}
