import type { ModelChoice } from '../model-selection.js';

/** Display-only scenarios. They independently spend the same credits, never three allowances. */
export function usageEstimates(credits: number, models: ModelChoice[]) {
  const validCredits = Number.isFinite(credits) && credits > 0 ? credits : 0;
  const eligible = models.filter(m => !m.free && !m.hiddenInPicker && m.category === 'economy' &&
    Number.isFinite(m.price?.input) && Number.isFinite(m.price?.output) && m.price!.input! > 0 && m.price!.output! > 0);
  const chat = eligible.find(m => m.modelId === 'mimo-v2.6-flash') ?? eligible.find(m => m.recommended) ?? eligible[0];
  const image = models.filter(m => m.category === 'images' && !m.hiddenInPicker && Number.isFinite(m.imageCoins) && m.imageCoins! > 0)
    .sort((a,b) => a.imageCoins! - b.imageCoins!)[0];
  const inputTokens = 8000, outputTokens = 2000;
  const taskCost = chat ? (chat.price!.input! * inputTokens + chat.price!.output! * outputTokens) / 1_000_000 : null;
  // Leave room for the per-call microcredit rounding used by the gateway.
  const roundedTaskCost = taskCost == null ? null : Math.ceil(taskCost * 1_000_000 - 1e-8) / 1_000_000;
  const rawTasks = roundedTaskCost ? Math.floor(validCredits / roundedTaskCost) : null;
  const step = rawTasks != null && rawTasks >= 1000 ? 100 : 10;
  const tasks = rawTasks == null ? null : rawTasks >= 100 ? Math.floor(rawTasks / step) * step : rawTasks;
  return { credits: validCredits, chat, image, inputTokens, outputTokens, taskCost: roundedTaskCost,
    tasks, tokens: tasks == null ? null : tasks * (inputTokens + outputTokens),
    images: image ? Math.floor(validCredits / image.imageCoins!) : null };
}
