// Hosted model image-input snapshot, checked 2026-10-15 against configured upstream routes.
// Source: https://openrouter.ai/api/v1/models (architecture.input_modalities).
// GLM-4.7-Flash also follows the existing text-only client adapter restriction.
// Explicit catalog modalities / capability badges take priority; unknown models stay unconfirmed.
const HOSTED_IMAGE_INPUT: Record<string, boolean | undefined> = {
  'claude-fable-5': true,
  'claude-fable-5-1': true,
  'claude-haiku-4-5': true,
  'claude-opus-4-7': true,
  'claude-opus-4-8': true,
  'claude-opus-5': true,
  'claude-opus-5-5': true,
  'claude-sonnet-4-6': true,
  'claude-sonnet-5': true,
  'deepseek-flash': true,
  'deepseek-v4-flash': true,
  'doubao-2-0-code': true,
  'doubao-2-0-lite': true,
  'doubao-2-0-mini': true,
  'doubao-2-1-turbo': true,
  'gemini-3-5-flash-lite': true,
  'gemini-3-6-flash': true,
  'gemini-3-7-flash': true,
  'gemini-3-8-flash': true,
  'glm-4.7-flash': false,
  'glm-5.2': false,
  'glm-5.3': false,
  'glm-5.3-flash': true,
  'gpt-5.5': true,
  'gpt-5.6': true,
  'gpt-5.6-luna': true,
  'gpt-5.6-terra': true,
  'gpt-6-1-sol': true,
  'gpt-6-astra': true,
  'gpt-6-luna': true,
  'gpt-6-sol': true,
  'grok-4-3': true,
  'grok-4.5': true,
  'grok-4.6': true,
  'grok-4.7': true,
  'kimi-k3': true,
  'kimi-k3-1-pro': true,
  'llama-4-maverick': true,
  'mimo-v2.6-flash': true,
  'minimax-m3': true,
  'mistral-large': true,
  'nemotron-3.5-lightning': false,
  'nemotron-lightning-free': false,
  'nemotron-nano-free': true,
  'nemotron-super-free': false,
  'north-mini-code-free': false,
  'openrouter-auto-free': true,
  'qwen3-8-flash': true,
  'step-5-preview': true,
};

export function hostedModelImageInput(modelId: string, badge?: string | null, inputModalities?: string[]): boolean | undefined {
  if (inputModalities?.length) return inputModalities.includes('image');
  const tags = (badge || '').split(' · ').flatMap(segment => segment.split('/')).map(tag => tag.trim().toLowerCase());
  if (tags.some(tag => ['图片', '识图', '支持图片', 'image', 'vision', 'image input'].includes(tag))) return true;
  if (tags.some(tag => ['文本', '仅文本', 'text', 'text only'].includes(tag))) return false;
  return HOSTED_IMAGE_INPUT[modelId];
}
