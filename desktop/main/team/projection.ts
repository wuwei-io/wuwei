// AI 员工团队 · 消息投影层
//
// ⭐ 整套群聊设计的技术核心。
//
// 群里存的是真实发生的多方对话（大成说一句、小文说一句、小码接一句），但每个员工背后
// 是一个普通 Agent，只认 user / assistant 交替的历史。直接把多方流喂进去有两个死结：
//   1. 连续多个 assistant 会被 isValidHistory 判成"损坏历史"并被 repairHistory 塞占位符修掉
//   2. 就算不被修，模型也分不清哪句是谁说的，会把别人的话当成自己说过的
//
// 解法：群存原始流，发给某个员工之前投影成「他视角」的历史——
//   · 他自己的发言           → assistant
//   · 其他所有人（含别的员工）→ user，并在正文前加署名
//
// 为什么是投影而不是"放宽 isValidHistory"：连续多条 user 消息本来就合法，投影结果天然
// 满足现有校验，一行核心代码都不用改。而改校验会波及所有普通会话，风险大得多。

import type { Message } from "../../../src/types.js";
import type { RoomMessage } from "../../../src/team/types.js";

/** 把纯文本包成内核 Message 的 content 结构 */
function textMsg(role: "user" | "assistant", text: string, ts: number): Message {
  return { role, content: [{ type: "text", text }], ts } as Message;
}

/**
 * 投影：把群的多方消息流，转成「某名员工视角」的标准会话历史。
 *
 * @param selfId 当前要发给谁（employee.id）
 * @param msgs   群原始消息流（按时间升序）
 */
export function projectFor(selfId: string, msgs: RoomMessage[]): Message[] {
  const out: Message[] = [];
  for (const m of msgs) {
    if (m.error) continue; // 出错留痕不参与上下文，否则模型会学着一起报错
    if (m.ack) continue; // 「收到」应答只是 UI 确认，不是正文，别喂回模型
    const text = (m.text || "").trim();
    if (!text) continue;
    if (m.speaker.id === selfId) {
      out.push(textMsg("assistant", text, m.ts));
    } else {
      // 署名用「」包起来：比 "小文: xxx" 更不容易被模型当成正文的一部分
      out.push(textMsg("user", `「${m.speaker.name}」${text}`, m.ts));
    }
  }
  // 收尾必须是 user：Agent 一轮的输入要求最后一条是用户消息。
  // 如果群里最后说话的恰好是这名员工自己（比如他被连续点名两次），补一条推进指令，
  // 而不是把他自己的话改成 user——那会让他误以为是别人在复述他。
  if (out.length && out[out.length - 1].role === "assistant") {
    out.push(textMsg("user", "（请接着上面的进展继续。）", Date.now()));
  }
  return out;
}

/**
 * 解析一条消息里 @ 了谁。
 * 匹配 @名字，名字取成员表里的真实姓名（不做模糊匹配，避免 @小文 命中 @小文文）。
 * 另外支持 @所有人 / @all → 返回全部成员。
 */
export function parseMentions(
  text: string,
  members: { id: string; name: string }[],
): { ids: string[]; all: boolean } {
  const t = text || "";
  // 负向断言而不是 \b：\b 是零宽断言不能带量词(TS1507)，而且对中文边界判定也不可靠。
  // 这样 @all 命中、@allen 不命中；@所有人 命中、@所有人员 不命中。
  if (/@(所有人|全体|all)(?![A-Za-z0-9一-龥])/i.test(t)) return { ids: members.map((m) => m.id), all: true };
  const ids: string[] = [];
  for (const m of members) {
    if (!m.name) continue;
    // 名字后面不能紧跟别的中文/字母，避免「@小文」误命中「@小文文」
    const re = new RegExp(`@${escapeRe(m.name)}(?![\\u4e00-\\u9fa5A-Za-z0-9])`);
    if (re.test(t)) ids.push(m.id);
  }
  return { ids, all: false };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 编排：这条消息该唤醒谁。
 * 规则（与设计方案第四节一致）：
 *   1. @ 了谁就只唤醒谁
 *   2. 没 @ 任何人 → 只唤醒常驻协调者（没设协调者就没人说话，消息只进上下文）
 *   3. 无论哪条路径，都受 maxWake 预算闸限制
 */
export function pickResponders(
  text: string,
  members: { id: string; name: string }[],
  coordinator: string | undefined,
  maxWake: number,
): string[] {
  const { ids } = parseMentions(text, members);
  const picked = ids.length ? ids : coordinator ? [coordinator] : [];
  return picked.slice(0, Math.max(1, maxWake));
}
