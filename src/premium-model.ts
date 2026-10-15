import { recommendedNewUserModel, type ModelChoice } from './model-selection.js';

const priced = (choice: ModelChoice) => [choice.price?.input, choice.price?.output].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);

export function premiumSelectionNeedsConfirmation(choice: ModelChoice, approved?: ModelChoice): boolean {
  return choice.category === 'premium' && (!approved || approved.key !== choice.key || approved.category !== 'premium' ||
    approved.price?.input !== choice.price?.input || approved.price?.output !== choice.price?.output || approved.price?.cache !== choice.price?.cache);
}

export function recommendedValueModel(choices: ModelChoice[]): ModelChoice | undefined {
  const eligible = choices.filter(choice => choice.category === 'economy' && choice.recommended && !choice.free && priced(choice));
  return recommendedNewUserModel(eligible) ?? eligible[0];
}

/** Comparison example only: 10k uncached input + 2k output, repeated five times. */
export function premiumUsageExample(choice: ModelChoice): { perCall: number; fiveCalls: number } | undefined {
  if (!priced(choice)) return undefined;
  const perCall = choice.price!.input! * 0.01 + choice.price!.output! * 0.002;
  return { perCall, fiveCalls: perCall * 5 };
}
