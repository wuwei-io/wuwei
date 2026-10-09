import type { Employee } from './types.js';
import { DEFAULT_TEAM_ID, employeeLabel, type TeamLanguage } from './default-localization.js';

export interface EmployeeSessionTitle {
  title: string;
  employeeId?: string;
  titleSource?: 'employee-default' | 'custom' | 'generated';
}
/** Presentation only. Legacy metadata has no title provenance: exact canonical
 * default-name matches are supported, but a historical manual identical title
 * cannot be distinguished. Never persist this localized display value. */
export function employeeSessionTitle(session: EmployeeSessionTitle, employee: Employee | undefined, lang: TeamLanguage): string {
  if (!employee || session.employeeId !== employee.id || employee.fromApp !== DEFAULT_TEAM_ID ||
      (session.titleSource && session.titleSource !== 'employee-default')) return session.title;
  const zh = employeeLabel(employee, 'zh');
  const en = employeeLabel(employee, 'en');
  // Unchanged built-in employees alone have distinct localized names.
  if (zh === en) return session.title;
  if (session.title !== zh && !(session.titleSource === 'employee-default' && session.title === en)) return session.title;
  return lang === 'en' ? en : zh;
}
