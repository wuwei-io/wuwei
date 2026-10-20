import { tr } from "../localization/index.js";
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Tool } from '../types.js';

export const codexImageTool: Tool = {
  name: 'codex_imagegen',
  description: tr("tool.description.codex_imagegen"),
  requiresImageGeneration: true,
  readOnly: false,
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', minLength: 1, maxLength: 16000, description: tr("tool.parameter.codex_imagegen.prompt") },
      out: { type: 'string', description: tr("tool.parameter.codex_imagegen.out") },
      references: { type: 'array', maxItems: 5, items: { type: 'string' }, description: tr("tool.parameter.codex_imagegen.references") },
      transparent_background: { type: 'boolean', description: tr("tool.parameter.codex_imagegen.transparent_background") },
      timeout_ms: { type: 'integer', minimum: 1000, maximum: 600000, description: tr("tool.parameter.codex_imagegen.timeout_ms") },
    },
    required: ['prompt'], additionalProperties: false,
  },
  async run(input, ctx) {
    try {
      if (typeof input.prompt !== 'string' || (input.out !== undefined && typeof input.out !== 'string') ||
        (input.references !== undefined && (!Array.isArray(input.references) || input.references.some(p => typeof p !== 'string'))) ||
        (input.transparent_background !== undefined && typeof input.transparent_background !== 'boolean') ||
        (input.timeout_ms !== undefined && typeof input.timeout_ms !== 'number')) throw new Error(tr("ui.codex-imagegen.message.187b1c42ad"));
      if (!ctx.generateImage) return { content: tr("ui.codex-imagegen.message.4decc6f293"), isError: true };
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
