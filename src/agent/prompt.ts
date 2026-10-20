import { tr as translate, getCurrentLanguage } from "../localization/index.js";
// 系统提示词：默认模板 + 渲染。用户可在「设置」里查看/修改/清空（覆盖默认）。
// 占位符：{model}=当前底层模型，{cwd}=当前工作目录。
// 注意：工具的 schema 仍通过 API 的 tools 参数单独传给模型，不依赖这里。
export const DEFAULT_SYSTEM_PROMPT = translate("agent.defaultPrompt", {}, "zh");

// 英文界面默认系统提示词（跟随 settings.app.lang，去掉「无为」括号只用 Wuwei）
export const DEFAULT_SYSTEM_PROMPT_EN = translate("agent.defaultPrompt", {}, "en");

// 用实际 cwd / model 渲染模板里的占位符
export function renderPrompt(template: string, cwd: string, model?: string): string {
  return template.replace(/\{model\}/g, model || "unknown").replace(/\{cwd\}/g, cwd);
}

// 默认系统提示词（未自定义时用）；lang="en" 用英文模板
export function systemPrompt(cwd: string, model?: string, lang?: string): string {
  return renderPrompt(translate("agent.defaultPrompt", {}, lang || getCurrentLanguage()), cwd, model);
}

// Added per model request, including custom prompts and restored conversations.
// Use only tools actually exposed this step, so provider switches cannot leave
// instructions advertising an unavailable or differently billed image service.
export function withImageToolInstructions(system: string, tools: readonly { name: string }[], lang?: string): string {
  const names = new Set(tools.map(tool => tool.name));
  const notes: string[] = [];
  const tr = (key: string) => translate(key, {}, lang || getCurrentLanguage());
  if (names.has('codex_imagegen')) {
    notes.push(tr("ui.prompt.for.image.generation.or.editing.call.1cbd44f"));
  }
  if (names.has('platform_imagegen')) {
    notes.push(tr("ui.prompt.for.image.generation.call.platform.imagegen.cc7af53"));
  }
  if (!notes.length) return system;
  if (names.has('platform_imagegen')) {
    notes.push(tr("ui.prompt.if.the.catalog.is.empty.or.a893108"));
  }
  notes.push(tr("ui.prompt.these.are.built.in.callable.tools.ac74d23"));
  return `${system}\n\n${tr("ui.prompt.image.tools.available.this.request.68e493a")}\n${notes.join('\n')}`;
}
