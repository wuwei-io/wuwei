import systemData from "../localization/content/system-data.json";
import defaultTeam from "../localization/content/default-team.json";
import { tr, getCurrentLanguage, getLanguages } from "../localization/index.js";
import type { Employee, TeamApp } from "./types.js";
export const DEFAULT_TEAM_ID = "wuwei-team-basic";
const templates = defaultTeam;
export type TeamLanguage = string;
function template(e: Employee) {
  // Installed records require provenance; catalog callers explicitly add it.
  return e.fromApp === DEFAULT_TEAM_ID ? templates[e.id as keyof typeof templates] : undefined;
}
/** Pure presentation: never writes user data or translates custom fields. */
export function localizeEmployee(e: Employee, language: TeamLanguage): Employee {
  const t = template(e);
  if (!t || language === "zh") return e;
  const result = { ...e };
  for (const field of ["name", "title", "blurb", "persona"] as const) {
    if (e[field] === t.baseline[field]) result[field] = tr(`team.default.${e.id}.${field}`, {}, language);
  }
  return result;
}
export function employeeLabel(e: Employee | undefined, language: TeamLanguage, fallback = ""): string {
  return e ? localizeEmployee(e, language).name : fallback;
}
export function localizeTeamApp<T extends TeamApp>(app: T, language: TeamLanguage): T {
  if (app.id !== DEFAULT_TEAM_ID) return app;
  return { ...app,
    name: language !== "zh" && app.name === systemData.teamName ? tr("team.default.name", {}, language) : app.name,
    desc: language !== "zh" && app.desc === DEFAULT_TEAM_DESCRIPTION ? tr("team.default.description", {}, language) : app.desc,
    employees: app.employees.map(e => localizeEmployee({ ...e, fromApp: DEFAULT_TEAM_ID }, language)) };
}
export const DEFAULT_TEAM_DESCRIPTION = systemData.DEFAULT_TEAM_DESCRIPTION;
export const EN_TEAM_DESCRIPTION = systemData.EN_TEAM_DESCRIPTION;
/** Canonical name, stable ID, or unmodified default English alias. Ambiguity always fails closed. */
export function resolveEmployee(list: Employee[], input: string): Employee | undefined {
  const key = input.trim();
  const matches = list.filter(e => {
    const t = template(e);
    return e.id === key || e.name === key || !!(t && e.name === t.baseline.name && getLanguages().some(locale => employeeLabel(e, locale.code).toLowerCase() === key.toLowerCase()));
  });
  return matches.length === 1 ? matches[0] : undefined;
}
export function employeeRoster(list: Employee[], language: TeamLanguage): string {
  return list.map(e => `${employeeLabel(e, language)} [id=${e.id}${language === "zh" ? `; canonical=${e.name}` : ""}]`).join(", ");
}

/** Include aliases only if globally unambiguous, so mentions cannot silently choose one employee. */
export function employeeMentionTargets(list: Employee[]): { id: string; name: string }[] {
  const targets: { id: string; name: string }[] = [];
  for (const e of list) {
    for (const name of new Set([e.name, ...getLanguages().map(locale => employeeLabel(e, locale.code)), e.id])) {
      if (resolveEmployee(list, name)?.id === e.id) targets.push({ id: e.id, name });
    }
  }
  return targets;
}

export const TEAM_TOOL_EN: Record<string, string> = systemData.teamToolEnglish;

export type LocalizedEmployeeField = "name" | "title" | "blurb" | "persona";
/** Display draft never becomes storage implicitly. An unchanged localized value restores
 * the original field; only a genuinely different input becomes custom content. */
export function editLocalizedEmployeeField(original: Employee, draft: Employee,
  field: LocalizedEmployeeField, value: string, language: TeamLanguage): Employee {
  const displayedOriginal = localizeEmployee(original, language)[field] || "";
  return { ...draft, [field]: value === displayedOriginal ? original[field] : value };
}
