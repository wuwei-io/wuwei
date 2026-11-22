// These preferences control model input, independently of execution permissions.
export interface InputControls {
  systemPromptEnabled?: boolean;
  memoryEnabled?: boolean;
  toolsEnabled?: boolean;
  disabledTools?: string[];
}

export function selectEnabledTools<T extends { name: string }>(tools: readonly T[], controls?: InputControls): T[] {
  if (controls?.toolsEnabled === false) return [];
  const disabled = new Set(controls?.disabledTools ?? []);
  return tools.filter(tool => !disabled.has(tool.name) && !(controls?.memoryEnabled === false && tool.name === 'remember'));
}

export function normalizeInputControls(patch: unknown): InputControls {
  const result: InputControls = {};
  if (!patch || typeof patch !== 'object') return result;
  for (const key of ['systemPromptEnabled', 'memoryEnabled', 'toolsEnabled'] as const) {
    if (typeof (patch as InputControls)[key] === 'boolean') result[key] = (patch as InputControls)[key];
  }
  const names = (patch as InputControls).disabledTools;
  if (Array.isArray(names)) result.disabledTools = [...new Set(names.filter((name): name is string => typeof name === 'string' && name.length > 0 && name.length <= 256))].slice(0, 10000);
  return result;
}

export function toolSchemaChars(tools: readonly {name: string; description?: string; inputSchema?: unknown}[]): number {
  return JSON.stringify(tools.map(tool => ({type:'function',function:{name:tool.name,description:tool.description,parameters:tool.inputSchema}}))).length;
}
