// 一人公司 · SOP 库 · 共用类型（内核与桌面端共用）
//
// SOP = 公司标准化流程的 md 文档库，树形组织（类别/子类别/SOP），可拖动、有版本可回滚。
// 这是「可选模块」，挂在 AI 员工团队总开关（app.teamEnabled）下：关闭时主进程不注册任何 sop IPC、
// 不读写 ~/.wuwei/sop/ 下任何文件。本文件只放类型，不含任何副作用与 IO。

/**
 * SOP 树上的一个节点。
 *   · kind==="category" 类别/子类别：只作组织，无正文；parentId 指向上级类别，顶层无 parentId。
 *   · kind==="sop"      具体 SOP：有正文（存 docs/<id>.md）、版本历史、taskKey（一事一 SOP 去重键）。
 */
export interface SopNode {
  id: string;
  kind: "category" | "sop";
  name: string;
  /** 上级类别 id；顶层节点无此字段 */
  parentId?: string;
  /** 同层排序序号（拖拽调整），升序 */
  order: number;
  /** 一事一 SOP 去重键（仅 kind==="sop"）：同 taskKey 视为同一件事，不重复建 */
  taskKey?: string;
  /** 当前版本号（仅 kind==="sop"），从 1 起，每次保存 +1 */
  currentVersion?: number;
  /** 一句话摘要（仅 kind==="sop"），列表/搜索用 */
  summary?: string;
  updatedAt?: number;
  createdAt?: number;
}

export interface SopTree {
  nodes: SopNode[];
}

/** 一个 SOP 的一条版本历史记录（存 versions/<id>/meta.json 数组里）。 */
export interface SopVersion {
  version: number;
  ts: number;
  note?: string;
  bytes: number;
}
