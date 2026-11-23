// Shared by the model-input policy and the settings list.
export const BASIC_TOOL_NAMES = [
  'read_file', 'write_file', 'edit_file', 'bash', 'powershell', 'glob', 'grep',
  'web_search', 'web_fetch', 'remember', 'ask_user',
] as const;

const basicNames: ReadonlySet<string> = new Set(BASIC_TOOL_NAMES);
export function isBasicTool(name: string): boolean { return basicNames.has(name); }

export const TOOL_CATEGORIES = [
  'basic', 'imagegen', 'vision', 'brain', 'chrome', 'browser', 'computer', 'sop', 'company', 'schedule',
] as const;
export type ToolCategory = typeof TOOL_CATEGORIES[number];

const companyNames = new Set([
  'dm_teammate', 'assign_task', 'create_employee', 'update_employee', 'delete_employee',
  'manage_department', 'manage_group',
]);

export function toolCategory(name: string): ToolCategory {
  if (name === 'platform_imagegen' || name === 'codex_imagegen') return 'imagegen';
  if (name === 'send_image' || name === 'view_image' || name === 'read_image') return 'vision';
  if (name.startsWith('brain_')) return 'brain';
  if (name.startsWith('chrome_')) return 'chrome';
  if (name.startsWith('browser_')) return 'browser';
  if (name.startsWith('computer_')) return 'computer';
  if (['search_sop', 'read_sop', 'list_sops', 'write_sop'].includes(name)) return 'sop';
  if (['create_schedule', 'list_schedules', 'delete_schedule'].includes(name)) return 'schedule';
  if (companyNames.has(name)) return 'company';
  return 'basic';
}

export function groupBuiltinTools<T extends {name: string}>(tools: readonly T[]) {
  const order = new Map<string, number>(BASIC_TOOL_NAMES.map((name, index) => [name, index]));
  return TOOL_CATEGORIES.map(id => ({
    id,
    tools: tools.filter(tool => toolCategory(tool.name) === id).sort((a, b) =>
      (order.get(a.name) ?? BASIC_TOOL_NAMES.length) - (order.get(b.name) ?? BASIC_TOOL_NAMES.length)),
  })).filter(group => group.tools.length > 0);
}
