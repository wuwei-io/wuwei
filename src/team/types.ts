// AI 员工团队 · 共用类型（内核与桌面端共用）
//
// 这是「可选模块」：总开关 app.teamEnabled 默认关闭，关闭时主进程不注册任何 team IPC、
// 不读写 ~/.wuwei/team/ 下任何文件。本文件只放类型，不含任何副作用与 IO。

/** 员工绑定的模型。缺省=跟随用户当前选中的平台/模型。 */
export type EmployeeModel = {
  providerId: string;
  model: string;
};

/**
 * AI 员工 = 人格 + 模型 + 工具白名单。
 * 私聊一名员工时，会话仍是普通会话，只是系统提示词换成 persona、工具集按 tools 裁剪。
 */
export interface Employee {
  id: string;
  name: string;
  /** 职位，如「文案」「代码」，用于列表副标题 */
  title?: string;
  /** 一句话介绍，应用中心卡片上展示 */
  blurb?: string;
  /** 内置图标名（渲染层映射到手写 SVG），缺省按 name 首字生成字符头像 */
  icon?: string;
  /** 自定义头像图片（用户上传+裁剪后的 data URL，正方形）。优先级高于 icon/首字。 */
  avatarData?: string;
  /** 身份与职责（对应 openclaw IDENTITY）：这个员工是谁、负责什么、不做什么。人格主体。 */
  persona: string;
  /** 性格与说话风格（对应 openclaw SOUL）：语气、脾气、表达习惯。 */
  soul?: string;
  /** 关于老板/服务对象（对应 openclaw USER）：他是谁、偏好什么、在做什么项目。 */
  aboutUser?: string;
  /** 长期记忆与背景（对应 openclaw MEMORY）：需要长期记住的项目背景、约定、结论。 */
  memory?: string;
  /** 缺省=跟随当前会话的平台/模型，让用户自己挑 */
  model?: EmployeeModel;
  /** 工具白名单；缺省=不裁剪（全量工具） */
  tools?: string[];
  /** 来源应用 id；内置默认团队为 undefined */
  fromApp?: string;
  /** 置顶时间戳；有值=置顶，按它降序排前 */
  pinnedAt?: number;
}

/**
 * 应用 = 一个可安装的包，目前形态是「员工模板包」。
 * 后续可扩展 mcp（依赖的 MCP server）与 gateway（外部智能体网关地址）。
 */
export interface TeamApp {
  id: string;
  name: string;
  desc: string;
  version: string;
  /** 该应用带来的员工 */
  employees: Employee[];
  /** 安装时间戳（毫秒）；目录清单里的未装应用没有此字段 */
  installedAt?: number;
  /** 停用：员工保留但不出现在选人列表里，与 MCP 的 disabled 同义 */
  disabled?: boolean;
}

/** 应用中心一张卡片的展示态，由主进程算好给渲染层，避免前端重复判断 */
export interface TeamAppCard extends TeamApp {
  installed: boolean;
}

// ───────────────────────── 房间（多员工协作）─────────────────────────

/**
 * 房间里的一条消息。
 * ⭐ 与普通会话最大的区别：带 speaker（谁说的）。普通会话的 Message 只有 role: user|assistant，
 *    装不下"三个人在同一个上下文里说话"，所以房间必须自己存一份原始多方流，
 *    发给某个员工前再投影成他视角的 user/assistant 交替历史（见 projection.ts）。
 */
/** AI 员工干一条回复时的一个工具调用步骤，随消息落库、永久可回看「具体干了啥」。 */
export interface MsgStep {
  name: string;
  input?: unknown;
  result?: string;
  isError?: boolean;
}
export interface RoomMessage {
  id: string;
  ts: number;
  speaker: {
    /** 人类固定用 "me"；员工用 employee.id */
    id: string;
    name: string;
    kind: "human" | "agent";
  };
  text: string;
  /** 本条 @ 了哪些员工（存 employee.id）。空=没点名 */
  mentions?: string[];
  /** 出错时留痕，界面上标红，不当正常发言参与后续投影 */
  error?: boolean;
  /**
   * 「收到」应答：员工被唤醒后先落的一条轻量确认消息（跑完才落正式回复）。
   * 界面弱化显示；不带 steps；投影时跳过（见 projection.ts），别把「收到」当正文喂回模型。
   */
  ack?: boolean;
  /** AI 员工干这轮调用的工具序列（含参数/结果），随消息永久落库，界面可展开回看。 */
  steps?: MsgStep[];
  /** 员工这轮的思考文本（可选，随消息留存）。 */
  thought?: string;
}

export interface Room {
  id: string;
  name: string;
  /**
   * 房间形态。缺省（老数据没有此字段）一律当 "room"（群），向后兼容。
   *   · "room" = 多员工群聊（可 @ 唤醒、可设协调者）
   *   · "dm"   = 两名员工/人的私聊，复用同一套 room 存储与投影，只是判别用
   */
  type?: "room" | "dm";
  /**
   * 私聊去重键：两名成员 id 排序后 join，`[a,b].sort().join("__")`。
   * 只有 type==="dm" 才有值；用于 findOrCreateDm 防止同两人重复建私聊。
   */
  dmKey?: string;
  /** 成员（employee.id）。顺序即界面显示顺序 */
  members: string[];
  /**
   * 常驻协调者（employee.id）：不用 @ 也会响应，负责拆活派活。
   * 对应 openclaw 那边「CEO requireMention=false」的角色。空=没有，谁都得被 @ 才说话。
   */
  coordinator?: string;
  createdAt: number;
  updatedAt: number;
  /** 预算闸：单条消息最多唤醒几名员工，防一句 @所有人 把全员长任务点着。默认 3 */
  maxWake?: number;
  /** 最后一条消息摘要，列表里展示 */
  lastText?: string;
  /** 置顶时间戳；有值=置顶 */
  pinnedAt?: number;
}

