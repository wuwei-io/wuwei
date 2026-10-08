import type { Settings, ProviderKind } from './settings.js';

export interface RemoteChannel {
  id: string; label: string; kind: 'subscription' | 'api-key';
  providerId: string; providerKind: ProviderKind; models: string[]; defaultModel: string;
  quota?: unknown;
}

export function providerKindForId(pid: string, settings: Settings): ProviderKind {
  if (pid === settings.providerId) return settings.kind;
  return pid === 'codex' ? 'codex' : pid === 'claude-oauth' ? 'anthropic-oauth' : pid === 'anthropic' ? 'anthropic-apikey' : 'openai';
}

/** Advertise configured models only. Credentials never leave the computer. */
export function configuredRemoteChannels(s: Settings | null, share: boolean): RemoteChannel[] {
  if (!s) return [];
  const out: RemoteChannel[] = [];
  const add = (id: string, label: string, pid: string, kind: ProviderKind, subscription: boolean) => {
    const slot = s.creds?.[pid] || {};
    const current = s.providerId === pid || !s.providerId && kind === s.kind;
    const model = (current ? s.model : slot.model) || slot.model || '';
    const models = [...new Set([model, ...(slot.customModels || [])].filter(Boolean))];
    if (!model || !models.length) return;
    out.push({ id, label, kind: subscription ? 'subscription' : 'api-key', providerId: pid,
      providerKind: kind, defaultModel: model, models });
  };
  if (share && (s.kind === 'anthropic-oauth' || s.creds?.['claude-oauth']?.oauthToken))
    add('claude-code-subscription', 'Claude Code 订阅', 'claude-oauth', 'anthropic-oauth', true);
  if (share && (s.kind === 'codex' || s.creds?.codex?.model))
    add('codex-subscription', 'Codex 订阅', 'codex', 'codex', true);
  if (s.kind === 'anthropic-apikey' || s.kind === 'openai')
    add('api-key', '本机 API Key', s.providerId || (s.kind === 'openai' ? 'openai' : 'anthropic'), s.kind, false);
  for (const [pid, slot] of Object.entries(s.creds || {})) {
    if (!slot.model || !slot.apiKey || out.some(ch => ch.providerId === pid) || ['codex', 'claude-oauth'].includes(pid)) continue;
    add(`api-key:${pid}`, slot.nickname || pid, pid, providerKindForId(pid, s), false);
  }
  return out;
}

export function resolveRemoteSelection(channels: RemoteChannel[], channelId?: string | null, model?: string | null) {
  // Older phones used the model field for a channel ID. Preserve only this explicit legacy mapping.
  const legacy = !channelId && channels.some(ch => ch.id === model);
  const id = channelId || (legacy ? model : null);
  if (!id) {
    if (model) throw new Error('请选择模型所属的电脑渠道');
    return null; // continue the original session's persisted binding
  }
  const channel = channels.find(ch => ch.id === id);
  if (!channel) throw new Error('该渠道不属于这台电脑当前共享的渠道');
  const selected = legacy || !model ? channel.defaultModel : model;
  if (!channel.models.includes(selected)) throw new Error('所选模型未在电脑渠道中配置，请刷新模型列表');
  return { channel, model: selected };
}
