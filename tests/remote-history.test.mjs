import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remoteHistoryBounds } from '../desktop/main/remote-history.ts';

test('older history reads do not skip or repeat records when new replies arrive between pages', () => {
  const first = remoteHistoryBounds(120, { offset: 0, limit: 50 });
  assert.deepEqual([first.start, first.end], [70, 120]);
  const second = remoteHistoryBounds(124, { offset: first.nextOffset, limit: 50, anchorTotal: first.total });
  assert.deepEqual([second.start, second.end], [20, 70]);
  const third = remoteHistoryBounds(127, { offset: second.nextOffset, limit: 50, anchorTotal: second.total });
  assert.deepEqual([third.start, third.end, third.hasMore], [0, 20, false]);
  const ids = [...Array(120).keys()];
  assert.deepEqual([...ids.slice(third.start, third.end), ...ids.slice(second.start, second.end), ...ids.slice(first.start, first.end)], ids);
});

test('invalid paging inputs are bounded and empty history is explicit', () => {
  assert.deepEqual(remoteHistoryBounds(0, {}), { start: 0, end: 0, total: 0, hasMore: false, nextOffset: 0 });
  assert.deepEqual(remoteHistoryBounds(100, { offset: -9, limit: Infinity, anchorTotal: 900 }).end, 100);
  const page = remoteHistoryBounds(100, { offset: NaN, limit: 900 });
  assert.equal(page.end - page.start, 50);
  assert.equal(remoteHistoryBounds(100, { offset: 10000 }).hasMore, false);
});
