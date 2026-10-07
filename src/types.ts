// minicc 核心类型定义
// 这里刻意贴近 Anthropic Messages API 的消息模型（复刻 Claude Code 的底层语义）：
// 一条对话由 messages 组成；助手可能回文本，也可能回 tool_use；
// 我们本地执行工具后，把 tool_result 作为一条 user 消息塞回，继续循环。

export type Role = "user" | "assistant";

// 消息内容块：文本 / 模型要调工具 / 我们回给模型的工具结果
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; dataUrl: string } // 用户发送的图片（data:image/...;base64,xxx）
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface Message {
  role: Role;
  content: ContentBlock[];
  ts?: number; // 本地时间戳(仅持久化/展示"多久之前"，toAnthropic/toOpenAI 会剥掉不发给 API)
  // 用量快照(仅盖在助手消息上；不发给 API)。round=本轮自足值(UI 直接读,不靠跨轮做差)
  usage?: {
    totalInput: number;
    totalOutput: number;
    lastInput: number;
    totalCacheHit?: number;
    totalCacheMiss?: number;
    totalSteps?: number;
    round?: {
      input: number;
      output: number;
      cacheHit: number;
      cacheMiss: number;
      steps: number;
      lastInput: number;
    };
  };
}

// 一个工具 = 给模型看的 schema + 本地执行函数
export interface ToolSpec {
  name: string;
  description: string;
  requiresImageGeneration?: boolean; // 仅向提供订阅生图能力的会话后端暴露
  // JSON Schema（Anthropic tools 的 input_schema 格式）
  inputSchema: Record<string, unknown>;
  // 只读工具可并行；有状态工具（Write/Edit/Bash）需串行确认
  readOnly: boolean;
}

// ========== Decision（ask_decision 工具产出的结构化决策）==========
// 与手机端 wuwei-mobile 的 src/api/decision.ts 字段一字对齐（两端共用一份契约）。
// 语义见 docs/decision-design.md。
export interface DecisionOption {
  label: string;
  desc?: string;
  value: string; // 稳定机器 key，原样回传；'allow'/'deny' 保留语义，业务分支不得占用
  recommended?: boolean;
  tone?: "safe" | "danger" | "neutral";
}
export interface Decision {
  permId: string; // 全局唯一且每次都变
  risk: "high" | "low";
  title: string;
  question: string;
  context?: string;
  options: DecisionOption[]; // 2~3 项
  allowCustom: boolean;
  timeoutSec: number | null; // null=不计时一直等；数字=倒计时
  sourceSession?: string;
  rawDetail?: string;
  // Native paid-tool dialogs resolve these against the current UI language.
  i18n?: Record<'zh' | 'en', { title: string; question: string; optionLabels: Record<string, string> }>;
}
export interface DecisionResponse {
  action: "allow" | "deny" | "reply";
  value?: string;
  text?: string;
  reason?: string; // G1-4：本机兜底时标注解挂原因，如 'timeout'(超时自动兜底) / 'abort'(中断/断连)；正常回批不填
}

export interface TaskReportScope {
  turnId: string;
  origin: { kind: 'session' | 'room'; id: string };
  ownerId: string;
  ownerName: string;
  depth: number;
}

export interface ToolContext {
  remoteExecution?: {
    signal?: AbortSignal; // stopping the remote parent also stops active/queued descendants
    shareSubscription: boolean;
    requestDecision?: ToolContext['requestDecision'];
    requestPermission?: (name: string, input: unknown) => Promise<'allow' | 'deny'>;
  };
  cwd: string;
  turnId?: string;
  reportOrigin?: TaskReportScope['origin'];
  taskReportScope?: TaskReportScope; // 子任务沿用根批次，结果统一回到最初的派活会话
  platformImage?: (input: Record<string,unknown>,ctx: ToolContext) => Promise<ToolResult>;
  generateImage?: Provider['generateImage']; // 绑定本轮实际 provider；不读全局账号设置
  // ask_decision 下发决策并阻塞等三态回批；上层(桌面端)注入，未注入=不可用(CLI 无交互)
  requestDecision?: (decision: Decision) => Promise<DecisionResponse>;
  signal?: AbortSignal; // 中断信号：用户停止时传入，长命令(bash/grep)据此杀子进程
  env?: Record<string, string>; // 本地密钥注入(仅本机子进程可见，模型看不到)：bash 工具据此合并环境变量
  sessionId?: string; // 执行该工具的会话 id：ask_user 据此把选择框/通知绑到正确的会话(多会话并发时不串)
  memoryFile?: string; // remember 工具写到哪个记忆文件：员工私聊会话指向该员工专属记忆，缺省=全局 memory.md
  employeeId?: string; // 执行该工具的员工 id：dm_teammate 据此确定「发起方」，缺省=非员工（普通人类会话）
  dmDepth?: number; // 私信转派深度：dm_teammate 据此限制转派链长(防无限套娃)。0=最外层员工，每转派一层+1，缺省=0
}

export interface ToolResult {
  content: string;
  isError?: boolean;
  // 可选：工具返回一张图给模型"看"（dataURL）。用于截图类工具（chrome_screenshot / computer_screenshot）。
  // loop 会把它和 content 拼成 tool_result 的多模态数组，provider 转成各家的 image 块。
  image?: string;
  // 可选：只发到对话框给"人"看、不进模型上下文的图（dataURL）。用于 send_image 生图展示——
  // 存进历史(可显示+持久)，但 provider 构造请求时跳过(displayOnly)，避免大图每轮塞进上下文(费钱/易触发模型报错)。
  displayImage?: string;
}

export interface Tool extends ToolSpec {
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

// Provider 抽象：一次"请求模型 → 拿到助手回复（文本增量 + 可能的 tool_use）"
export interface ProviderStreamHandlers {
  onRateLimits?: (limits: RateLimits) => void;
  onText?: (delta: string) => void; // 文本流式增量
  onRecover?: (cleanedText: string) => void; // 兜底清理后回传完整正文供前端替换显示(如死循环重复串被清掉)
  signal?: AbortSignal; // 中断信号：用户点停止时 abort，provider 传给 fetch/stream
}

export interface TokenUsage {
  inputTokens: number; // 本次请求的输入 token（≈当前上下文总大小）
  outputTokens: number;
  cacheHitTokens?: number; // 缓存命中的输入 token（便宜很多；DeepSeek 等返回）
  cacheMissTokens?: number; // 缓存未命中的输入 token
}

// 订阅额度快照（Codex 在 /responses 响应头返回；primary=5小时窗口，secondary=周窗口）
export interface RateLimits {
  planType?: string;
  primaryUsedPercent?: number;
  primaryWindowMinutes?: number;
  primaryResetAfterSeconds?: number;
  secondaryUsedPercent?: number;
  secondaryWindowMinutes?: number;
  secondaryResetAfterSeconds?: number;
  creditsBalance?: string;
  creditsUnlimited?: boolean;
}

export interface ProviderResult {
  // 助手这一轮产出的完整内容块（文本 + tool_use）
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "other";
  usage?: TokenUsage;
  rateLimits?: RateLimits;
}

export interface Provider {
  name: string;
  platformImage?: (input: Record<string,unknown>,ctx: ToolContext) => Promise<ToolResult>;
  generateImage?: (options: Omit<import('./imagegen/subscription.mjs').SubscriptionImageOptions,
    'accessToken' | 'accountId' | 'responsesEndpoint'>) => Promise<import('./imagegen/subscription.mjs').SubscriptionImageResult>;
  contextWindow?: number;
  compactThreshold?: number;
  complete(
    system: string,
    messages: Message[],
    tools: ToolSpec[],
    handlers: ProviderStreamHandlers,
  ): Promise<ProviderResult>;
}
