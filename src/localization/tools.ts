import { getCurrentLanguage, hasMessage, localizeStoredText, tr } from './index.js';

type ToolMetadata = { name: string; description: string; inputSchema: Record<string, unknown> };

/** Translate descriptions only. Schema names, enum values and tool behavior stay data. */
export function localizeToolMetadata<T extends ToolMetadata>(tool: T, language = getCurrentLanguage()): T {
  function schema(node: unknown, field?: string): unknown {
    if (Array.isArray(node)) return node.map(value => schema(value, field));
    if (!node || typeof node !== 'object') return node;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === 'description' && typeof value === 'string') {
        const messageKey = `tool.parameter.${tool.name}.${field || 'schema'}`;
        result[key] = hasMessage(messageKey, language) ? tr(messageKey, {}, language) : localizeStoredText(value, language);
      } else if (key === 'properties' && value && typeof value === 'object') {
        result[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, schema(child, name)]));
      } else result[key] = schema(value, field);
    }
    return result;
  }
  const messageKey = `tool.description.${tool.name}`;
  return { ...tool, description: hasMessage(messageKey, language) ? tr(messageKey, {}, language) : localizeStoredText(tool.description, language), inputSchema: schema(tool.inputSchema) as Record<string, unknown> };
}
