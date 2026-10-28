const { createHash } = require('node:crypto');
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, 24);
const snapshots = new Map();
const thumbnails = new Map();
function detail(value) {
    if (Array.isArray(value))
        return value.filter(b => b.type === 'text').map(b => b.text).join('\n').slice(0, 12000);
    return (typeof value === 'string' ? value : JSON.stringify(value ?? '')).slice(0, 12000);
}
function project(all, running) {
    const results = new Map(all.flatMap(m => m.content || []).filter(b => b.type === 'tool_result').map(b => [b.tool_use_id, b]));
    return all.flatMap((m, i) => {
        if (m.__wuweiDeleted)
            return [];
        const blocks = m.content || [], toolResult = blocks.some(b => b.type === 'tool_result');
        const role = m.role === 'user' && !toolResult ? 'user' : 'assistant';
        const text = blocks.filter(b => b.type === 'text').map(b => b.text || '').join('').trim();
        const images = blocks.flatMap(b => b.type === 'image' ? [b.dataUrl] : b.type === 'tool_result' && Array.isArray(b.content) ? b.content.filter(p => p.type === 'image').map(p => p.dataUrl) : []).filter(Boolean);
        const sourceKey = digest(m);
        const rows = text || images.length ? [{ id: `${role}-${i}`, role, text: text || undefined, images, imageKeys: images.map(digest), sourceKey, order: i * 100 }] : [];
        let n = 1;
        for (const b of blocks)
            if (b.type === 'tool_use') {
                const result = results.get(b.id);
                rows.push({ id: `tool-${i}-${b.id}`, role: 'assistant', sourceKey, order: i * 100 + n++, tool: {
                        name: b.name, input: detail(b.input), output: result ? detail(result.content) : undefined,
                        status: result ? result.is_error ? 'error' : 'done' : running ? 'running' : 'error'
                    } });
            }
        return rows;
    });
}
function thumbnail(url, decode) {
    const key = digest(url);
    if (thumbnails.has(key))
        return thumbnails.get(key);
    let result;
    try {
        const image = decode(url);
        if (image.isEmpty())
            return undefined;
        const { width, height } = image.getSize();
        let edge = Math.min(640, Math.max(width, height));
        for (let i = 0; i < 5; i++, edge = Math.round(edge * .7)) {
            const resized = image.resize(width >= height ? { width: edge } : { height: edge });
            const bytes = resized.toJPEG(45);
            if (bytes.length <= 24 * 1024) {
                result = `data:image/jpeg;base64,${bytes.toString('base64')}`;
                break;
            }
        }
    }
    catch { /* malformed attachments must not break text history */ }
    if (result) {
        thumbnails.set(key, result);
        while (thumbnails.size > 64)
            thumbnails.delete(thumbnails.keys().next().value);
    }
    return result;
}
function historyPage(all, bounds, params, sessionId, running, decode) {
    const rows = project(all, running);
    const hashes = new Map(rows.map(row => [row.id, digest(row)]));
    const revision = digest([...hashes]);
    const prior = params.sinceRevision ? snapshots.get(`${sessionId}:${params.sinceRevision}`) : null;
    const reset = !prior || all.length < prior.total;
    const start = reset ? bounds.start : prior.start;
    const inWindow = row => row.order >= start * 100;
    const selected = params.sinceRevision && !reset
        ? rows.filter(row => inWindow(row) && prior.hashes.get(row.id) !== hashes.get(row.id))
        : rows.filter(row => row.order >= bounds.start * 100 && row.order < bounds.end * 100);
    const removedIds = prior && !reset ? [...prior.hashes.keys()].filter(id => !hashes.has(id)) : [];
    const messages = selected.map(row => {
        const pairs = row.images?.map((url, i) => ({ uri: thumbnail(url, decode), key: row.imageKeys[i] })).filter(p => p.uri);
        return { ...row, images: pairs?.map(p => p.uri), imageKeys: pairs?.map(p => p.key) };
    });
    // Cache only small hashes; image bytes never accumulate in revision snapshots.
    if (!params.offset) {
        snapshots.set(`${sessionId}:${revision}`, { hashes, total: all.length, start });
        while (snapshots.size > 32)
            snapshots.delete(snapshots.keys().next().value);
    }
    return { messages, running: !!running, revision, incremental: !!params.sinceRevision && !reset, unchanged: !!prior && prior.hashes.size === hashes.size && prior.total === all.length && messages.length === 0 && removedIds.length === 0,
        removedIds, total: all.length, hasMore: start > 0, nextOffset: all.length - start };
}
function fullImage(all, params, decode) {
  const row = project(all, false).find(item => item.id === params?.messageId && item.sourceKey === params?.sourceKey);
  const index = row?.imageKeys?.indexOf(params?.imageKey) ?? -1;
  if (index < 0) throw Error('图片记录已变化，请刷新原对话');
  const original = row.images[index];
  if (typeof original !== 'string' || !original.startsWith('data:image/')) throw Error('图片不可用');
  const image = decode(original);
  if (image.isEmpty()) throw Error('图片不可用');
  const size = image.getSize(), longest = Math.max(size.width, size.height), limit = 1_100_000;
  if (!Number.isFinite(longest) || longest <= 0) throw Error('图片尺寸不可用');
  if (longest <= 2560 && original.length <= 1_500_000) return { dataUrl: original, ...size, original: true };
  for (const cap of [2560, 2048, 1600]) {
    const edge = Math.min(cap, longest), resized = edge === longest ? image : image.resize(size.width >= size.height ? { width: edge } : { height: edge });
    for (const quality of [92, 82, 70]) {
      const bytes = resized.toJPEG(quality);
      if (bytes.length && bytes.length <= limit) return { dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`, ...resized.getSize(), original: false };
    }
  }
  throw Error('高清图片暂时无法读取');
}

function previewImage(all, decode) {
  const row = project(all, false).reverse().find(item => item.role === 'assistant' && item.images?.length);
  if (!row) return { images: [], count: 0 };
  const index = row.images.length - 1, image = thumbnail(row.images[index], decode);
  return { images: image ? [image] : [], count: row.images.length, messageId: row.id, sourceKey: row.sourceKey, imageKey: row.imageKeys[index] };
}

module.exports = { previewImage, historyPage, project, thumbnail, digest, fullImage };
