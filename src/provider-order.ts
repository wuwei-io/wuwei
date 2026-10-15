export function arrangeProviderEntries<T extends { id: string }>(
  providers: T[], localOrder: string[] | undefined, hidden: string[] | undefined,
  includeHidden: boolean, fallbackOrder: string[], catalogOrder?: string[],
): T[] {
  const catalogRank = new Map((catalogOrder ?? []).map((id, i) => [id, i]));
  const localRank = new Map((localOrder ?? []).map((id, i) => [id, i]));
  const fallbackRank = new Map(fallbackOrder.map((id, i) => [id, i]));
  const rank = (id: string): [number, number] => {
    if (catalogRank.has(id)) return [0, catalogRank.get(id)!];
    if (localRank.has(id)) return [catalogRank.size ? 1 : 0, localRank.get(id)!];
    if (fallbackRank.has(id)) return [2, fallbackRank.get(id)!];
    return [3, 0];
  };
  const sorted = [...providers].sort((a, b) => {
    const left = rank(a.id), right = rank(b.id);
    return left[0] - right[0] || left[1] - right[1];
  });
  const excluded = new Set(hidden ?? []);
  return includeHidden ? sorted : sorted.filter(p => !excluded.has(p.id));
}
