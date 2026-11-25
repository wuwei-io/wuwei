import { modelReasoning, reasoningKey, type ReasoningEffort, type ReasoningSettings } from './model-reasoning.js';
export type EffortChange = { providerId:string; model:string; effort:ReasoningEffort; asDefault?:boolean };
export function updateModelEffort<T extends ReasoningSettings & {providerId?:string; model?:string}>(settings:T, input:EffortChange):T {
  if (!input || typeof input.providerId !== 'string' || typeof input.model !== 'string' || input.providerId.length>160 || input.model.length>200 || !modelReasoning(input.model)?.levels.includes(input.effort)) throw Error('invalid_reasoning_effort');
  const key = reasoningKey(input.providerId,input.model);
  const selected = settings.providerId === input.providerId && settings.model === input.model;
  if (!input.asDefault && !selected) throw Error('model_changed');
  return { ...settings,
    ...(input.asDefault ? {modelEffortDefaults:{...settings.modelEffortDefaults,[key]:input.effort}} : {}),
    ...(selected ? {effort:input.effort,effortModel:key} : {}),
  };
}
