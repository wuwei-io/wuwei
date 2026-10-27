/** Show each generated/file image once per user turn, including older saved chats. */
export function dedupeDisplayedToolImages<T extends { type: string; name?: string; image?: string; result?:string }>(items: T[]): T[] {
  const displayed = new Set<string>();
  const orders=new Set<string>();
  return items.map((item) => {
    if (item.type === "user") {displayed.clear();orders.clear();}
    if (item.type !== "tool" || !item.image || !["platform_imagegen", "codex_imagegen", "send_image"].includes(item.name || "")) return item;
    // Separate paid orders remain separate results even if a provider returns
    // identical bytes. A later send_image copy of either is still deduplicated.
    if(item.name==='platform_imagegen'&&item.result) {
      try {
        const id=JSON.parse(item.result).order_id;
        if(typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id)) {
          if(orders.has(id))return {...item,image:undefined};
          orders.add(id);displayed.add(item.image);return item;
        }
      }catch{/* Legacy plain-text result. */}
    }
    if (displayed.has(item.image)) return { ...item, image: undefined };
    displayed.add(item.image);
    return item;
  });
}
