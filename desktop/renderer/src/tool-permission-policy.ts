import type { ExecutionMode } from './execution-mode.js';

/** Only main-process local permission events carry this metadata. */
export function shouldAutoApproveToolPermission(
  event: { toolPermission?: { name: string; sid: string } },
  modes: Record<string, ExecutionMode>,
  alwaysAllow: ReadonlySet<string>,
  defaultMode: ExecutionMode = 'auto',
): boolean {
  const permission = event.toolPermission;
  if (!permission?.name || !permission.sid) return false;
  const mode = Object.hasOwn(modes, permission.sid) ? modes[permission.sid] : defaultMode;
  return mode === 'auto' || mode === 'cont' || alwaysAllow.has(permission.name);
}
