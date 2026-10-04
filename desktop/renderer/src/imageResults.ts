/** Show each generated/file image once per user turn, including older saved chats. */
export function dedupeDisplayedToolImages<T extends { type: string; name?: string; image?: string }>(items: T[]): T[] {
  const displayed = new Set<string>();
  return items.map((item) => {
    if (item.type === "user") displayed.clear();
    if (item.type !== "tool" || !item.image || !["codex_imagegen", "send_image"].includes(item.name || "")) return item;
    if (displayed.has(item.image)) return { ...item, image: undefined };
    displayed.add(item.image);
    return item;
  });
}
