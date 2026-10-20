import { tr, getCurrentLanguage } from "../localization/index.js";
// Ink 主应用：驱动 Agent，把流式 hooks 映射成 React 状态并渲染。
import React, { useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { TextInput, Spinner } from "@inkjs/ui";
import { Agent, type SessionUsage } from "../agent/loop.js";
import type { Tool } from "../types.js";
import { MessageItem, StatusBar, PermissionPrompt, type Item } from "./views.js";

// 终端界面文案跟随语言（WUWEI_LANG 在 src/index.tsx 入口按系统语言定，桌面端由设置写入）


interface Pending {
  tool: Tool;
  input: Record<string, unknown>;
  resolve: (d: "allow" | "deny") => void;
}

export function App({
  agent,
  provider,
  model,
}: {
  agent: Agent;
  provider: string;
  model: string;
}) {
  const { exit } = useApp();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [usage, setUsage] = useState<SessionUsage>({
    totalInput: 0,
    totalOutput: 0,
    lastInput: 0,
    totalCacheHit: 0,
    totalCacheMiss: 0,
    totalSteps: 0,
  });
  const alwaysAllow = useRef<Set<string>>(new Set());
  const push = (it: Item) => setItems((prev) => [...prev, it]);

  // 权限确认：pending 存在时监听 y/N/a
  useInput(
    (input) => {
      if (!pending) return;
      const k = input.toLowerCase();
      if (k === "a") {
        alwaysAllow.current.add(pending.tool.name);
        pending.resolve("allow");
      } else if (k === "y") {
        pending.resolve("allow");
      } else {
        pending.resolve("deny");
      }
      setPending(null);
    },
    { isActive: !!pending },
  );

  const appendAssistant = (delta: string) =>
    setItems((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.type === "assistant") {
        const copy = [...prev];
        copy[copy.length - 1] = { ...last, text: last.text + delta };
        return copy;
      }
      return [...prev, { type: "assistant", text: delta }];
    });

  const updateLastTool = (patch: Partial<Extract<Item, { type: "tool" }>>) =>
    setItems((prev) => {
      const idx = [...prev].reverse().findIndex((i) => i.type === "tool" && i.status === "running");
      if (idx === -1) return prev;
      const real = prev.length - 1 - idx;
      const copy = [...prev];
      copy[real] = { ...(copy[real] as Extract<Item, { type: "tool" }>), ...patch };
      return copy;
    });

  async function run(text: string) {
    setBusy(true);
    try {
      await agent.send(text, {
        onText: appendAssistant,
        onToolStart: (_id, name, input) =>
          push({ type: "tool", name, input, status: "running" }),
        onToolEnd: (_id, result, isError) =>
          updateLastTool({ result, isError, status: "done" }),
        requestPermission: (tool, input) =>
          new Promise((resolve) => {
            if (alwaysAllow.current.has(tool.name)) return resolve("allow");
            setPending({ tool, input, resolve });
          }),
        onUsage: setUsage,
        onCompact: (b, a) =>
          push({
            type: "notice",
            text: tr("ui.app.context.compacted.messages.3f22c22", { p0: b, p1: a }),
          }),
      });
    } catch (e: any) {
      push({ type: "notice", text: tr("ui.app.error.e5d7520", { p0: e.message }) });
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(value: string) {
    const text = value.trim();
    if (!text) return;
    if (text === "/exit" || text === "/quit") return exit();
    if (text === "/reset") {
      agent.getMessages().length = 0;
      setItems([]);
      return;
    }
    if (text === "/help") {
      push({
        type: "notice",
        text: tr("ui.app.commands.reset.clears.the.chat.exit.78e9a6c"),
      });
      return;
    }
    push({ type: "user", text });
    void run(text);
  }

  return (
    <Box flexDirection="column">
      {items.map((it, i) => (
        <MessageItem key={i} item={it} />
      ))}

      {pending && <PermissionPrompt name={pending.tool.name} input={pending.input} />}

      {busy && !pending && (
        <Box marginTop={1}>
          <Spinner label={tr("ui.app.thinking.885e169")} />
        </Box>
      )}

      {!busy && !pending && (
        <Box marginTop={1}>
          <Text color="green">› </Text>
          <TextInput
            placeholder={tr("ui.app.type.what.you.need.enter.to.6b46a5e")}
            onSubmit={onSubmit}
          />
        </Box>
      )}

      <StatusBar provider={provider} model={model} usage={usage} busy={busy} />
    </Box>
  );
}
