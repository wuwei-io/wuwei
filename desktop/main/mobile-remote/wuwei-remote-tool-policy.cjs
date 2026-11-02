'use strict';
const stateKey = Symbol.for('wuwei.remote-tool-policy.v1');
const legacyQuestions = new Set([
  '电脑即将执行一项可能修改本机内容的操作。你要继续吗？',
  '電腦即將執行一項可能修改本機內容的操作。你要繼續嗎？',
  'This operation may change content on your computer. Continue?',
]);
function isToolPermission(decision) {
  if (!decision || decision.allowCustom !== false || !Array.isArray(decision.options)) return false;
  if (!decision.options.some(o => o.value === 'allow') || !decision.options.some(o => o.value === 'deny')) return false;
  if (decision.kind === 'tool-permission') return true;
  // Recover only the exact legacy remote-tool envelope. A business question or
  // purchase dialog with allow/deny options is not a tool execution permission.
  return legacyQuestions.has(decision.question) && typeof decision.rawDetail === 'string'
    && /^[A-Za-z_][A-Za-z0-9_.:-]*\n/.test(decision.rawDetail);
}
function install(pool, options = {}) {
  if (pool[stateKey]) return pool[stateKey];
  const request = pool.request.bind(pool), decide = pool.decide.bind(pool), list = pool.list.bind(pool);
  let enabled = true;
  const autoAllow = () => options.getEnabled ? options.getEnabled() !== false : enabled;
  const labels = () => {
    const language = options.getLanguage?.() || 'zh';
    const defaults = language.startsWith('zh')
      ? { allowAll: '一律全部同意', allowOnce: /Hant|TW|HK/.test(language) ? '僅允許本次' : '仅允许本次', deny: /Hant|TW|HK/.test(language) ? '拒絕本次' : '拒绝本次' }
      : { allowAll: 'Allow all tools', allowOnce: 'Allow once', deny: 'Deny once' };
    return { ...defaults, ...options.labels?.() };
  };
  const flush = () => {
    const resolvedPermIds = [];
    if (autoAllow()) for (const item of list()) {
      if (isToolPermission(item.decision) && decide(item.permId, { action: 'allow' })) resolvedPermIds.push(item.permId);
    }
    return resolvedPermIds;
  };
  const controller = {
    autoAllow,
    apply: flush,
    setEnabled(value) {
      if (typeof value !== 'boolean') throw Error('Invalid tool permission policy');
      options.saveEnabled?.(value); enabled = value;
      return { ok: true, toolAutoAllow: autoAllow(), resolvedPermIds: flush() };
    },
  };
  pool.request = function(reqId, raw, source, smartTimer, signal, send) {
    if (signal.aborted || !isToolPermission(raw)) return request(reqId, raw, source, smartTimer, signal, send);
    if (autoAllow()) return Promise.resolve({ action: 'allow' });
    const text = labels();
    const decision = { ...raw, kind: 'tool-permission', options: [
      { label: text.allowAll, value: 'allow_all', recommended: true, tone: 'safe' },
      { label: text.allowOnce, value: 'allow', tone: 'neutral' },
      { label: text.deny, value: 'deny', tone: 'neutral' },
    ] };
    return request(reqId, decision, source, smartTimer, signal, send);
  };
  pool.decide = function(permId, response, reqId) {
    const item = list().find(p => p.permId === permId);
    if (!item || (reqId && item.reqId !== reqId)) return false;
    if (isToolPermission(item.decision) && response?.action === 'reply' && response.value === 'allow_all' && !response.text) {
      controller.setEnabled(true);
      return !list().some(p => p.permId === permId);
    }
    return decide(permId, response, reqId);
  };
  pool.list = function() { flush(); return list(); };
  Object.defineProperty(pool, stateKey, { value: controller });
  flush();
  return controller;
}
function executionGuidance(autoAllow = true) {
  return '\n\n当前用户通过手机远程操控。' + (autoAllow
    ? '用户已统一授权执行命令、文件读写及工具调用，直接执行，不要为这些执行权限再次询问或调用 ask_decision。仅当缺少完成任务必需的业务选择或用户信息时，使用 ask_decision 提供真实选项。'
    : '需要用户选择时使用 ask_decision，提供白话问题与 2~3 个选项；重要或不可逆操作设为 high 并等待回复。');
}
module.exports = { install, isToolPermission, executionGuidance };
