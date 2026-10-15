// Codex 订阅版(ChatGPT 登录) 真机探针：判定 minicc 能否接通该通道。
// 读 ~/.codex/auth.json 的 access_token/account_id（本地使用，绝不打印 token 明文），
// 按 Responses API 格式打一发最小请求到 chatgpt.com/backend-api/codex/responses，观察真实返回。
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

// Diagnostics must also name the intended model before reading credentials or
// making a request. No subscription model is selected implicitly.
const model = process.argv[2]?.trim();
if (!model) {
  console.error('Usage: npx tsx src/codex-probe.ts <model-id>');
  process.exit(2);
}

const authPath = `${homedir()}/.codex/auth.json`;
const auth = JSON.parse(readFileSync(authPath, "utf8"));
const accessToken: string = auth.tokens.access_token;
const accountId: string = auth.tokens.account_id;
console.log(`凭证: auth_mode=${auth.auth_mode} account_id=${accountId.slice(0, 8)}… token_len=${accessToken.length}`);

const body = {
  model,
  instructions: "You are a coding agent. Reply concisely.",
  input: [
    { role: "user", content: [{ type: "input_text", text: "Reply with exactly: PROBE-OK" }] },
  ],
  tools: [],
  tool_choice: "auto",
  parallel_tool_calls: false,
  store: false,
  stream: true,
  reasoning: { effort: "low" },
};

const headers: Record<string, string> = {
  Authorization: `Bearer ${accessToken}`,
  "chatgpt-account-id": accountId,
  "OpenAI-Beta": "responses=experimental",
  originator: "codex_cli_rs",
  session_id: randomUUID(),
  "Content-Type": "application/json",
  Accept: "text/event-stream",
  "User-Agent": "codex_cli_rs/0.0.0",
};

console.log(`\n→ POST chatgpt.com/backend-api/codex/responses  model=${model}`);
const res = await fetch("https://chatgpt.com/backend-api/codex/responses", {
  method: "POST",
  headers,
  body: JSON.stringify(body),
});

console.log(`← HTTP ${res.status} ${res.statusText}`);
console.log("← 关键响应头:", {
  "content-type": res.headers.get("content-type"),
  "x-ratelimit-remaining": res.headers.get("x-codex-primary-used-percent") ?? res.headers.get("x-ratelimit-remaining"),
});

if (!res.ok || !res.body) {
  const txt = await res.text();
  console.log("← 响应体(前 800 字):\n" + txt.slice(0, 800));
  console.log(res.ok ? "\n无响应体" : `\n❌ 未通过 (HTTP ${res.status})`);
  process.exit(res.ok ? 0 : 1);
}

// 解析 SSE（Responses API 事件）
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "";
let text = "";
const eventTypes = new Set<string>();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const parts = buf.split("\n\n");
  buf = parts.pop() ?? "";
  for (const block of parts) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type) eventTypes.add(ev.type);
        if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
        if (ev.type === "response.completed") {
          // 有些实现把用量放这里
        }
        if (ev.type === "error" || ev.type === "response.failed") {
          console.log("← 错误事件:", JSON.stringify(ev).slice(0, 500));
        }
      } catch {
        /* 忽略非 JSON 行 */
      }
    }
  }
}

console.log("\n← 收到的事件类型:", [...eventTypes].join(", ") || "(无)");
console.log("← 模型文本输出:", JSON.stringify(text));
if (text.includes("PROBE-OK") || text.length > 0) {
  console.log("\n✅ 通了！Codex 订阅通道可接入，Responses SSE 已正确解析。");
} else {
  console.log("\n⚠️ 连接返回 200 但没解析到文本，需按上面的事件类型调整解析。");
}
