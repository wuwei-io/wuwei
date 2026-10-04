import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Tool } from '../types.js';

export const codexImageTool: Tool = {
  name: 'codex_imagegen',
  description: 'Codex订阅会话生成或编辑图片的默认工具。直接调用订阅图片服务（gpt-image-2），消耗当前会话账号的Codex额度。无需安装Codex/ChatGPT或API key。需要生图时优先调用此工具，无需写脚本。支持参考图和透明背景，成功后自动在对话框展示PNG。返回displayed:true表示已展示，不要再调用send_image重复发送。失败不自动重试。',
  requiresImageGeneration: true,
  readOnly: false,
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', minLength: 1, maxLength: 16000, description: '图片内容、风格、构图；参考图按传入顺序编号。' },
      out: { type: 'string', description: '可选，输出 PNG 路径（相对工作目录或绝对路径）；不覆盖已有文件。' },
      references: { type: 'array', maxItems: 5, items: { type: 'string' }, description: '可选，本机参考图路径（PNG/JPEG/WebP）。' },
      transparent_background: { type: 'boolean', description: '是否需要透明背景。' },
      timeout_ms: { type: 'integer', minimum: 1000, maximum: 600000, description: '超时时间，默认300000毫秒。' },
    },
    required: ['prompt'], additionalProperties: false,
  },
  async run(input, ctx) {
    try {
      if (typeof input.prompt !== 'string' || (input.out !== undefined && typeof input.out !== 'string') ||
        (input.references !== undefined && (!Array.isArray(input.references) || input.references.some(p => typeof p !== 'string'))) ||
        (input.transparent_background !== undefined && typeof input.transparent_background !== 'boolean') ||
        (input.timeout_ms !== undefined && typeof input.timeout_ms !== 'number')) throw new Error('生图参数格式不正确。');
      if (!ctx.generateImage) return { content: '此会话未启用 Codex 订阅生图，请切换到 Codex 订阅并登录。', isError: true };
      const result = await ctx.generateImage({
        prompt: input.prompt, out: input.out ? resolve(ctx.cwd, input.out as string) : undefined,
        references: (input.references as string[] | undefined)?.map(path => resolve(ctx.cwd, path)),
        transparentBackground: input.transparent_background as boolean | undefined,
        timeoutMs: input.timeout_ms as number | undefined, signal: ctx.signal,
      });
      return { content: JSON.stringify({ ...result, displayed: true }), displayImage: `data:image/png;base64,${(await readFile(result.path)).toString('base64')}` };
    } catch (error: any) {
      return { content: JSON.stringify({ ok: false, code: error.code || 'INVALID_INPUT', message: error.message, details: error.details }), isError: true };
    }
  },
};
