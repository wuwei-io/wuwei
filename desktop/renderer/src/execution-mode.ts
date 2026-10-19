export type ExecutionMode = 'manual' | 'auto' | 'cont';

// Ordinary tools run without repeated approval by default. Smart-continue
// remains an explicit choice; an explicitly selected manual mode is respected.
export const DEFAULT_MODE_KEY = 'wuwei-default-execution-mode';
export const SESSION_MODES_KEY = 'wuwei-execution-modes';

function isMode(value: unknown): value is ExecutionMode {
  return value === 'manual' || value === 'auto' || value === 'cont';
}

export function readDefaultExecutionMode(storage: Pick<Storage, 'getItem'>): ExecutionMode {
  const value = storage.getItem(DEFAULT_MODE_KEY);
  return value === null ? 'auto' : isMode(value) ? value : 'manual';
}

export function readSessionExecutionModes(storage: Pick<Storage, 'getItem'>): Record<string, ExecutionMode> {
  try {
    const value = JSON.parse(storage.getItem(SESSION_MODES_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, ExecutionMode] => isMode(entry[1])));
  } catch {
    return {};
  }
}

export function executionModeFor(
  sid: string,
  modes: Record<string, ExecutionMode>,
  defaultMode: ExecutionMode = 'auto',
): ExecutionMode {
  return Object.hasOwn(modes, sid) && isMode(modes[sid]) ? modes[sid] : defaultMode;
}

export function sessionModesAfterSettingsChange(
  currentId: string,
  mode: ExecutionMode,
  sessionIds: string[],
  modes: Record<string, ExecutionMode>,
  previousDefault: ExecutionMode,
): Record<string, ExecutionMode> {
  const next = { ...modes };
  // Updating the default for future chats must not start or stop other chats.
  for (const sid of sessionIds) next[sid] = executionModeFor(sid, modes, previousDefault);
  next[currentId] = mode;
  return next;
}
