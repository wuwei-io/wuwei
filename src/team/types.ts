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
  /** 注入系统提示词的人格描述 */
  persona: string;
  /** 缺省=跟随当前会话的平台/模型，让用户自己挑 */
  model?: EmployeeModel;
  /** 工具白名单；缺省=不裁剪（全量工具） */
  tools?: string[];
  /** 来源应用 id；内置默认团队为 undefined */
  fromApp?: string;
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
}

export interface Room {
  id: string;
  name: string;
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
}

