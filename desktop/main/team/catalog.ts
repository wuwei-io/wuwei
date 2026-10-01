// AI 员工团队 · 内置应用目录
//
// 第一期先只有内置目录（不联网）。后续要接线上员工市场时，这里再加一个 fetch 源，
// 与 MCP 那边「本地目录 + 在线注册表」的两段式结构保持一致。
//
// 人格提示词写作原则：说清职责边界与产出形态，不写"你是一个乐于助人的助手"这类空话；
// 让每个员工有明确的不做什么，避免四个人给出四份雷同的万金油回答。
//
// ⭐默认组织架构（无为一人公司）：CEO 小笨 + 文案小文 / 代码小码 / 数据小数 / 设计小美 / 移动端小移。
// 完整定义（职位、一句话介绍、人格/边界/系统提示词、工具白名单、头像、展示顺序）落在同目录的
// catalog-company.json，由本文件装进一个可安装应用。装上即得整套带头像、带角色规则的团队。
// 其中「小笨」职位含 CEO → 会被 ask_user 的 CEO 把关自动识别为上级把关人（见 index.ts resolveCeoId）。

import type { Employee, TeamApp } from "../../../src/team/types.js";
import companyEmployees from "./catalog-company.json";

export const BUILTIN_APPS: TeamApp[] = [
  {
    id: "wuwei-team-basic",
    name: "无为一人公司",
    desc: "一套开箱即用的 AI 团队：CEO 小笨统管全局，文案小文 / 代码小码 / 数据小数 / 设计小美 / 移动端小移各司其职。装上即可分别私聊，员工请示先由 CEO 把关。每人自带头像、职责边界与系统提示词。",
    version: "2.0.0",
    employees: companyEmployees as unknown as Employee[],
  },
];

/** 按 id 取内置应用（安装时用），找不到返回 null */
export function findBuiltinApp(id: string): TeamApp | null {
  return BUILTIN_APPS.find((a) => a.id === id) ?? null;
}
