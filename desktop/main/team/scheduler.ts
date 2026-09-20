// 一人公司 · 定时任务调度器
//
// 跑在客户端主进程里的轻量定时器：每 30s 巡检一次，到点(nextRunAt<=now)且开着的任务就触发——
// 唤醒负责人(员工)在他专属会话里按任务内容(引用的 SOP 全文 或 内嵌文档)执行一轮，结果落在该会话可回看。
//
// 关闭时不触发；下次启动 tick() 会把「关应用期间逾期」的任务各补跑一次(不堆积多次)，再把 nextRunAt 推到未来。
// 护栏：全局总开关(schedulesEnabled) + 单任务开关(enabled) + 间隔类最小 1 分钟(见 store.computeNextRun)。

import type { ScheduledTask } from "../../../src/team/types.js";
import { loadSchedules, saveSchedules, loadTeamConfig, computeNextRun, loadEmployees } from "./store.js";

export type SchedulerDeps = {
  /** 在负责人的专属会话里跑一轮（找不到会话则新建，不切走用户当前视图） */
  runForEmployee: (employeeId: string, text: string) => void;
  /** 读某个 SOP 的当前版全文；不存在返回空串 */
  readSopContent: (sopId: string) => string;
  log: (tag: string, ...args: unknown[]) => void;
};

let timer: ReturnType<typeof setInterval> | null = null;
let deps: SchedulerDeps | null = null;

function fire(task: ScheduledTask): void {
  if (!deps) return;
  const emp = loadEmployees().find((e) => e.id === task.employeeId);
  if (!emp) { deps.log("schedule", "负责人已不存在，跳过", task.name); return; } // 下次巡检仍会重算 nextRunAt
  let content = "";
  if (task.sopId) {
    content = deps.readSopContent(task.sopId) || `（原引用的 SOP 已不存在，请按任务名「${task.name}」自行判断如何完成）`;
  } else {
    content = task.doc || "";
  }
  const text = `【定时任务触发】${task.name}\n\n现在到点了，请按下面的要求/流程执行这次任务，做完把结果和关键要点回报一下：\n\n${content}`;
  deps.log("schedule", "触发", task.name, "→", emp.name);
  deps.runForEmployee(task.employeeId, text);
}

function tick(): void {
  if (!deps) return;
  if (loadTeamConfig().schedulesEnabled === false) return; // 全局暂停：一个都不触发
  const now = Date.now();
  const list = loadSchedules();
  let changed = false;
  for (const t of list) {
    if (!t.enabled) continue; // 单任务暂停
    if (typeof t.nextRunAt !== "number") { t.nextRunAt = computeNextRun(t.trigger, now); changed = true; continue; }
    if (t.nextRunAt <= now) {
      try { fire(t); } catch (e: any) { deps.log("schedule", "触发出错", t.name, String(e?.message || e).slice(0, 200)); }
      t.lastRunAt = now;
      t.nextRunAt = computeNextRun(t.trigger, now); // 只推到下一次，逾期不堆积多次
      changed = true;
    }
  }
  if (changed) saveSchedules(list);
}

/** 启动调度器：立刻巡检一次(含关应用期间逾期任务的补跑)，之后每 30s 巡检。重复调用会先清旧定时器。 */
export function startScheduler(d: SchedulerDeps): void {
  deps = d;
  if (timer) clearInterval(timer);
  tick();
  timer = setInterval(tick, 30000);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
