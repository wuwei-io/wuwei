type ExecutionMode = 'manual' | 'auto' | 'cont';

/** Only main-process local permission events carry this metadata. */
export function shouldAutoApproveToolPermission(
  event: { toolPermission?: { name: string; sid: string } },
  modes: Record<string, ExecutionMode>,
  alwaysAllow: ReadonlySet<string>,
): boolean {
  const permission = event.toolPermission;
  if (!permission?.name || !permission.sid) return false;
  return (modes[permission.sid] || 'auto') !== 'manual' || alwaysAllow.has(permission.name);
}
