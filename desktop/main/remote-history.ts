/** Anchor an older-page read to the history observed by the phone, even if replies arrive meanwhile. */
export function remoteHistoryBounds(total: number, params: { offset?: unknown; limit?: unknown; anchorTotal?: unknown }) {
  const integer = (value: unknown, fallback: number) => typeof value === 'number' && Number.isSafeInteger(value) ? value : fallback;
  const limit = Math.min(50, Math.max(1, integer(params.limit, 10)));
  const offset = Math.max(0, integer(params.offset, 0));
  const anchor = Math.max(0, Math.min(total, integer(params.anchorTotal, total)));
  const end = Math.max(0, anchor - offset), start = Math.max(0, end - limit);
  return { start, end, total, hasMore: start > 0, nextOffset: total - start };
}
