// Codex ImagesClient protocol, ported from openai/codex (b8dceb0d).
// Uses only Node built-ins and the caller's subscription credentials. No Codex process.
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';

export const IMAGE_MODEL = 'gpt-image-2';
export class SubscriptionImageError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'SubscriptionImageError'; this.code = code; this.details = details;
  }
}
const fail = (code, message, details) => new SubscriptionImageError(code, message, details);
const MAX_IMAGE = 32 * 1024 * 1024;
const MAX_RESPONSE = 48 * 1024 * 1024;

export function imageEndpoint(responsesEndpoint = 'https://chatgpt.com/backend-api/codex/responses', edit = false) {
  let url;
  try { url = new URL(responsesEndpoint); } catch { throw fail('INVALID_ENDPOINT', 'Codex 订阅地址不正确。'); }
  // Never send subscription credentials to an API-key endpoint, a proxy, or a redirect.
  if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com' || url.port || url.username || url.password || url.search || url.hash ||
      !['/backend-api/codex/responses', '/backend-api/codex/responses/'].includes(url.pathname)) {
    throw fail('INVALID_ENDPOINT', '订阅生图仅支持 chatgpt.com 的 Codex 订阅地址。');
  }
  return `https://chatgpt.com/backend-api/codex/images/${edit ? 'edits' : 'generations'}`;
}

export function validateSubscriptionPng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 45 || buffer.length > MAX_IMAGE ||
      !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw fail('INVALID_IMAGE', '返回内容不是有效 PNG。');
  let width = 0, height = 0, ended = false; const data = [];
  for (let pos = 8; pos + 12 <= buffer.length;) {
    const len = buffer.readUInt32BE(pos), type = buffer.toString('ascii', pos + 4, pos + 8), end = pos + len + 12;
    if (end > buffer.length) throw fail('INVALID_IMAGE', 'PNG 数据不完整。');
    if (pos === 8 && (type !== 'IHDR' || len !== 13)) throw fail('INVALID_IMAGE', 'PNG 缺少图像头。');
    if (type === 'IHDR') { width = buffer.readUInt32BE(pos + 8); height = buffer.readUInt32BE(pos + 12); }
    if (type === 'IDAT') data.push(buffer.subarray(pos + 8, pos + 8 + len));
    if (type === 'IEND') { ended = len === 0 && end === buffer.length; break; }
    pos = end;
  }
  if (!width || !height || width > 16384 || height > 16384 || !ended || !data.length) throw fail('INVALID_IMAGE', 'PNG 结构或尺寸不正确。');
  try { if (!inflateSync(Buffer.concat(data), { maxOutputLength: 128 * 1024 * 1024 }).length) throw new Error(); }
  catch { throw fail('INVALID_IMAGE', 'PNG 像素数据损坏。'); }
  return { width, height };
}

async function referenceImage(path) {
  const stat = await fs.stat(path);
  if (!stat.isFile() || stat.size > MAX_IMAGE) throw fail('INVALID_REFERENCE', '参考图需为不超过32MB的图片文件。');
  const bytes = await fs.readFile(path);
  let mime;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { validateSubscriptionPng(bytes); mime = 'image/png'; }
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
  else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
  else throw fail('INVALID_REFERENCE', '参考图需为 PNG/JPEG/WebP。');
  return { image_url: `data:${mime};base64,${bytes.toString('base64')}` };
}

async function readResponse(response) {
  if (!response.body) throw fail('INVALID_RESPONSE', '图片服务返回空响应。');
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > MAX_RESPONSE) throw fail('RESPONSE_TOO_LARGE', '图片响应超过48MB。');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail('INVALID_RESPONSE', '图片服务返回无法解析的响应。'); }
}

function serviceError(response) {
  const requestId = response.headers.get('x-codex-imagegen-request-id');
  const safeRequestId = requestId && /^[\w-]{1,200}$/.test(requestId) ? requestId : undefined;
  const code = response.status === 401 ? 'AUTH_EXPIRED' : response.status === 403 ? 'ACCESS_DENIED' : response.status === 429 ? 'RATE_LIMITED' : 'IMAGE_SERVICE_ERROR';
  const message = response.status === 401 ? '订阅登录已失效，请在无为重新登录。' : response.status === 429 ? '订阅额度或速率受限，请稍后再试。' : `订阅图片服务拒绝请求（HTTP ${response.status}）。`;
  return fail(code, message, { status: response.status, requestId: safeRequestId });
}

/** One billable image request. Authentication comes from Wuwei's active session. */
export async function generateSubscriptionImage(options, transport = fetch) {
  if (!options || typeof options.prompt !== 'string' || !options.prompt.trim() || options.prompt.length > 16000) throw fail('INVALID_INPUT', 'prompt 需为1–16000字符。');
  if (typeof options.accessToken !== 'string' || !options.accessToken || typeof options.accountId !== 'string' || !options.accountId || /^sk-/i.test(options.accessToken)) throw fail('SUBSCRIPTION_REQUIRED', '请先在无为登录 Codex 订阅账号。');
  const timeoutMs = options.timeoutMs ?? 300000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) throw fail('INVALID_INPUT', 'timeoutMs 需为1000–600000毫秒。');
  if (options.transparentBackground !== undefined && typeof options.transparentBackground !== 'boolean') throw fail('INVALID_INPUT', '透明背景需为布尔值。');
  const refs = options.references ?? [];
  if (!Array.isArray(refs) || refs.length > 5 || refs.some(p => typeof p !== 'string' || !p)) throw fail('INVALID_INPUT', 'references 需为最多5个图片路径。');
  const endpoint = imageEndpoint(options.responsesEndpoint, refs.length > 0);
  if (options.out !== undefined && (typeof options.out !== 'string' || !options.out)) throw fail('INVALID_INPUT', '输出路径不正确。');
  const output = options.out ? resolve(options.out) : join(homedir(), process.env.WUWEI_DATA_DIR_NAME || '.wuwei', 'output', `codex-${randomUUID()}.png`);
  if (!/\.png$/i.test(output)) throw fail('INVALID_INPUT', '输出路径需以.png结尾。');
  try { await fs.access(output); throw fail('OUTPUT_EXISTS', '输出文件已存在，请换一个文件名。'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Prepare the destination before billing so ordinary filesystem failures are caught early.
  await fs.mkdir(dirname(output), { recursive: true });
  const body = { model: IMAGE_MODEL, prompt: options.prompt, background: options.transparentBackground ? 'transparent' : 'opaque', quality: 'auto', size: 'auto' };
  if (refs.length) body.images = await Promise.all(refs.map(referenceImage));
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  if (signal.aborted) throw fail('ABORTED', '生图已取消。');
  const turnId = randomUUID(), start = Date.now();
  let response, data;
  try {
    response = await transport(endpoint, {
      method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${options.accessToken}`, 'ChatGPT-Account-ID': options.accountId,
        originator: 'codex_cli_rs', 'x-codex-image-turn-id': turnId, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw serviceError(response);
    }
    data = await readResponse(response);
  } catch (error) {
    if (options.signal?.aborted) throw fail('ABORTED', '生图已取消；服务端可能已经计入额度。');
    if (timeout.aborted) throw fail('TIMEOUT', '生图超时；服务端可能已经计入额度，请勿自动重试。');
    if (error instanceof SubscriptionImageError) throw error;
    throw fail('NETWORK_ERROR', '无法连接订阅图片服务；未自动重试。');
  }
  // Raw service bodies can echo prompts/auth; never include them in tool results or logs.
  const requestId = response.headers.get('x-codex-imagegen-request-id');
  const safeRequestId = requestId && /^[\w-]{1,200}$/.test(requestId) ? requestId : undefined;
  const encoded = data?.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > Math.ceil(MAX_IMAGE / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4) throw fail('INVALID_IMAGE', '服务未返回有效的图片数据。');
  const image = Buffer.from(encoded, 'base64'), dimensions = validateSubscriptionPng(image);
  if (signal.aborted) throw fail('ABORTED', '生图结果接收后已取消；本次请求可能已计入额度。');
  try { await fs.writeFile(output, image, { flag: 'wx', mode: 0o600 }); }
  catch (error) { throw fail(error.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'SAVE_FAILED', '图片已返回，但保存失败；本次请求可能已计入额度。'); }
  return { ok: true, backend: 'codex-subscription-http', model: IMAGE_MODEL, path: output,
    bytes: image.length, ...dimensions, requestId: safeRequestId, elapsedMs: Date.now() - start };
}
