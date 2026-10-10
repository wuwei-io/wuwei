type Session = { id: string; employeeId?: string; updatedAt: number };

/** Stay within the deleted chat's owner, never silently switch employees. */
export function sessionAfterDelete<T extends Session>(deleted: Session | undefined, remaining: T[]): T | undefined {
  return remaining
    .filter(s => s.id !== deleted?.id && s.employeeId === deleted?.employeeId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}
