# Decision 生成设计方案（G1 决策审批 · 电脑端 agent 侧）

> 状态：**设计方案，待董事长拍板**。本文描述的 `requestDecision`/`ask_decision` 机制为**新增架构**，现有代码中不存在，从 0 建。文中明确区分「现状」与「新增」，不把设计当现状。
>
> 关联：perm-resp 三态已落地（电脑端 commit `4984a53`、前端 commit `f85aec9`），本方案复用其回批通道。

---

## 背景

手机端决策审批（方案 C）要求：电脑端 AI（agent）在遇到**需用户拍板的岔路口**时，生成**白话问句 + 2~3 个结构化选项**下发给手机，而不是让前端去翻译 shell 命令。

读一手代码后的真实现状：
- 现有 `onPermission(toolName, input)` 是**工具执行前的危险拦截**，粒度是「某工具 + 入参要不要放行」，只回 `allow/deny`。
- 它**不产出** question/options 这类结构化决策。推给手机的 `perm-req` 只有 `{permId, tool, input}`。
- 即：**"agent 主动生成 Decision"在现有代码里完全不存在，要从 0 新建。**

---

## 一、判定点：在哪触发决策

**推荐：新增独立判定点 `requestDecision`，与现有 `onPermission` 并存，不复用。**

理由：
- `onPermission` 的语义是「这个危险命令要不要放行」——二元、被动、工具级。
- Decision 的语义是「有多条合理路径，需要人来选方向」——多选项、主动、任务级（例："要不要先备份再改表""三种实现选哪种""检测到冲突，覆盖/跳过/中止"）。
- 两者触发时机、语义、回批形态都不同。强行复用会把"危险拦截"和"方向决策"搅在一起，代码和体验都会拧巴。

**落地形态**：agent 循环中暴露一个 `requestDecision(decision): Promise<PermDecision>`，agent 在遇到岔路时主动调用，阻塞等待手机端回批（复用 perm-resp 三态通道回来）。

---

## 二、question / options 谁生成

三种路线对比：

| 路线 | 优点 | 缺点 |
|---|---|---|
| A. 纯模型生成 | 灵活、覆盖任意开放式岔路、问句自然 | 多一次模型调用；选项可能不互斥(非 MECE)；`value` 不稳定、可能漂移 |
| B. 纯预设映射表（危险操作类型→固定问句/选项） | 稳定、零额外调用、value 固定 | 只能覆盖预枚举场景；遇到开放式岔路抓瞎；维护成本随场景增长 |
| C. **混合：ask_decision 工具 + schema 约束**（推荐） | 模型写人话问句/选项，但走工具 schema 强约束字段，value 稳定、选项数量受控；兼顾灵活与稳定 | 需定义工具 schema；仍有一次模型产出（但在既有 tool-call 流程内，无额外往返） |

**推荐 C（混合）**：

把"产出 Decision"做成一个 agent **内建工具 `ask_decision`**，让模型通过调用这个工具、以**结构化入参**的方式产出 question/options——

```
ask_decision({
  question: string,          // 白话问句
  options: [                 // 2~3 个，schema 限制 min 2 / max 3
    { label, desc?, value, recommended?, tone? }
  ],
  risk: 'high' | 'low',
  allowCustom: boolean,
  timeoutSec: number | null  // high 风险强制 null（schema/校验层兜底）
})
```

- 由**工具 schema 约束**：options 数量 2~3、每项必须有稳定 `value`、`risk=high` 时 `timeoutSec` 强制 null。
- 模型负责写"人话"（question/label/desc）——这是模型擅长的；字段结构由 schema 兜死——这是模型不擅长的。
- agent 调用 `ask_decision` 时，框架把它转成 Decision 结构，经 relay 透传手机端，阻塞等回批。

---

## 三、两套还是一套

**判定点两套、回批一套。**

- **判定点分开**：
  - `onPermission`（现有）：危险工具拦截，`allow/deny`。
  - `requestDecision`（新增）：方向决策，多选项 + reply。
- **回批统一走 perm-resp 三态**（本轮已建好的 `{action:'allow'|'deny'|'reply', value?, text?}`）：
  - `allow/deny` → 服务于危险拦截；
  - `reply + value`（选了某选项的稳定 key）/ `reply + text`（用户自定义打字）→ 服务于 Decision。
- 前端 `DecisionSheet` 的两种形态正好对应：简单确认形态 ↔ allow/deny；多选项形态 ↔ reply。

**一句话：一套回批通道、两个产生入口。** 这样既不混淆语义，又复用了已落地的三态回批，改动最小。

---

## 四、成本 / 风险 / 工作量

### 工作量估算（电脑端 agent 侧，不含前端）
| 项 | 内容 | 估算 |
|---|---|---|
| `ask_decision` 工具定义 + schema | 字段约束、校验（options 数量、high→timeoutSec=null） | 1 人天 |
| `requestDecision` 通道 | agent 循环暴露接口、阻塞等待回批、超时处理 | 1.5 人天 |
| Decision → relay 透传 | 组装 Decision 结构、经 relay-client 下发（relay 透明管道不改） | 0.5 人天 |
| 回批解析接入 | 复用 perm-resp 三态，reply 的 value/text 注入 agent 继续跑 | 1 人天 |
| 联调 + 边界（超时/中断/并发决策） | 真机 + dev 环境 | 1.5 人天 |
| **合计（电脑端）** | | **约 5.5 人天** |

前端（小全）DecisionSheet 消费真实 Decision 字段、两形态渲染，另算，需二次对齐字段。

### 最大风险 + 对策
1. **模型生成的 options 质量不稳**（选项不互斥 / value 漂移）——
   对策：工具 schema 强约束（数量、必填 value）+ `recommended` 项兜底（超时/默认选它）+ `rawDetail` 留存原始上下文供追溯。
2. **决策阻塞**：agent 等人回批期间循环挂起——
   对策：`timeoutSec` 低风险可逆决策给倒计时、超时按 recommended/deny 兜底并上报 timeout 原因；高风险一律 null 永等用户。
3. **并发决策**：多个会话/设备同时弹决策——
   对策：permId 关联、每个决策独立 pending，回批按 permId 精确匹配（现有 PendingPerm 机制已支持，扩展即可）。

---

## 推荐结论

- 判定点：**新增 `requestDecision`，与 onPermission 并存**。
- 生成方式：**混合方案 C（`ask_decision` 工具 + schema 约束）**。
- 架构：**判定两套、回批一套（复用 perm-resp 三态）**。
- 工作量：电脑端约 **5.5 人天**，前端另算。

拍板后进入 G1 实现阶段，第一步与小全对齐 DecisionSheet 消费的真实字段。
