import profiles from './model-reasoning-profiles.json';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ReasoningSettings = {
  effort?: string;
  effortModel?: string;
  modelEffortDefaults?: Record<string, ReasoningEffort>;
};
export function reasoningModelId(model: string): string {
  return model.split('/').at(-1)!.toLowerCase()
    .replace(/^gpt-(\d+)-(\d+)-/, 'gpt-$1.$2-')
    .replace(/^claude-(opus|sonnet|fable|haiku)-(\d+)-(\d+)$/, 'claude-$1-$2.$3');
}
export function modelReasoning(model: string): { levels: ReasoningEffort[]; default: ReasoningEffort } | undefined {
  return (profiles as Record<string, { levels: ReasoningEffort[]; default: ReasoningEffort }>)[reasoningModelId(model)];
}
export function reasoningKey(providerId: string, model: string): string { return `${providerId}/${model}`; }
export function resolveModelEffort(providerId: string, model: string, settings: ReasoningSettings = {}, active = true): ReasoningEffort | undefined {
  const profile = modelReasoning(model);
  if (!profile?.levels.length) return undefined;
  const key = reasoningKey(providerId, model);
  const override = active && (settings.effortModel === key || !settings.effortModel) ? settings.effort : undefined;
  const candidate = override ?? settings.modelEffortDefaults?.[key];
  return profile.levels.includes(candidate as ReasoningEffort) ? candidate as ReasoningEffort : profile.default;
}
