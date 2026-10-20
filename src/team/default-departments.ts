import systemData from "../localization/content/system-data.json";
import { tr } from "../localization/index.js";
import type { Employee } from "./types.js";
import { DEFAULT_TEAM_ID, type TeamLanguage } from "./default-localization.js";

export interface TeamDepartment {
  id: string;
  name: string;
  headId?: string;
  memberIds: string[];
  order?: number;
}

const defaults = systemData.departments;

/** Only seed a complete default pack. Custom people and existing departments are never remapped. */
export function defaultDepartments(employees: Employee[]): TeamDepartment[] | undefined {
  const installed = new Set(employees.filter(e => e.fromApp === DEFAULT_TEAM_ID).map(e => e.id));
  if (defaults.some(d => d.memberIds.some(id => !installed.has(id)))) return undefined;
  return defaults.map((d, order) => ({ id: d.id, name: d.name, headId: d.headId, memberIds: [...d.memberIds], order }));
}

/** Display only: canonical department names and stable member references stay on disk. */
export function departmentLabel(department: Pick<TeamDepartment, "name">, language: TeamLanguage): string {
  return language !== "zh" ? (defaults.find(d => d.name === department.name) ? tr("team.department."+defaults.find(d => d.name === department.name)!.id, {}, language) : department.name) : department.name;
}

export function departmentNameFromInput(original: Pick<TeamDepartment, "name">, input: string, language: TeamLanguage): string {
  return input === departmentLabel(original, language) ? original.name : input;
}
