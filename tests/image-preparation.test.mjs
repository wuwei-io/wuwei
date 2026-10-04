import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareModelImage, MODEL_IMAGE_MAX_BYTES } from '../src/image-preparation.ts';
import { makeProvider, setImageCapper } from '../src/agent/provider.ts';

const data = (bytes, type = 'png') => `data:image/${type};base64,${Buffer.alloc(bytes).toString('base64')}`;
function codec(width, height, pngBytes, jpegBytes, seen = []) {
  return {
    getSize: () => ({ width, height }),
    resize: options => {
      seen.push(options);
      const scale = options.width * options.height / (width * height);
      return codec(options.width, options.height, Math.ceil(pngBytes * scale), quality => Math.ceil(jpegBytes(quality) * scale), seen);
    },
    toPNG: () => Buffer.alloc(pngBytes),
    toJPEG: quality => { seen.push(quality); return Buffer.alloc(jpegBytes(quality)); },
  };
}
const size = url => Buffer.from(url.split(',')[1], 'base64').length;

test('small images stay byte-for-byte identical without re-encoding', () => {
  const image = data(100);
  const decoded = codec(800, 600, 100, () => { throw Error('should not encode'); });
  decoded.toPNG = () => { throw Error('should not encode'); };
  assert.equal(prepareModelImage(image, 1568, () => decoded), image);
});

test('large PNG below the pixel limit still compresses by byte size', () => {
  const seen = [];
  const result = prepareModelImage(data(2_300_000), 1568, () => codec(1024, 1536, 2_300_000, () => 280_000, seen));
  assert.ok(result.startsWith('data:image/jpeg;base64,'));
  assert.ok(size(result) <= MODEL_IMAGE_MAX_BYTES);
  assert.deepEqual(seen, [85]); // Keep the highest quality that fits.
});

test('very tall screenshots preserve aspect ratio and PNG when it fits', () => {
  const seen = [];
  const result = prepareModelImage(data(100_000), 1568, () => codec(1, 10_000, 100_000, () => 50_000, seen));
  assert.ok(result.startsWith('data:image/png;base64,'));
  assert.deepEqual(seen, [{ width: 1, height: 1568, quality: 'good' }]);
});

test('detailed high resolution images lower quality then dimensions until the byte budget fits', () => {
  const seen = [];
  const result = prepareModelImage(data(4_000_000), 1568, () => codec(1568, 1568, 4_000_000, q => q * 24_000, seen));
  assert.ok(size(result) <= MODEL_IMAGE_MAX_BYTES);
  assert.deepEqual(seen.slice(0, 3), [85, 70, 55]);
  assert.ok(seen.some(x => typeof x === 'object' && x.width < 1568));
});

test('non-inline images and undecodable images retain existing handling', () => {
  assert.equal(prepareModelImage('https://example.com/image.jpg', 1568, () => { throw Error(); }), 'https://example.com/image.jpg');
  const image = data(1_000_000);
  assert.equal(prepareModelImage(image, 1568, () => codec(0, 0, 0, () => 0)), image);
});

for (const backend of ['openai', 'codex']) {
  test(`${backend} sends compressed uploads and historical tool screenshots without modifying originals`, async t => {
    const original = data(2_300_000);
    let decoded = 0;
    setImageCapper((url, edge) => prepareModelImage(url, edge, () => { decoded++; return codec(1024, 1536, 2_300_000, () => 280_000); }));
    t.after(() => setImageCapper(null));
    const captured = [];
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      captured.push(JSON.parse(init.body));
      const event = backend === 'codex'
        ? { type: 'response.completed', response: { usage: {} } }
        : { choices: [{ delta: { content: 'read' }, finish_reason: 'stop' }] };
      return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    const history = [
      { role: 'user', content: [{ type: 'image', dataUrl: original }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'shot', name: 'screenshot', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'shot', content: [{ type: 'image', dataUrl: original }] }] },
    ];
    const saved = structuredClone(history);
    const config = { provider: backend, model: backend === 'codex' ? 'gpt-6.1-sol' : 'deepseek-v4-flash', apiKey: 'test-only',
      codexToken: 'test-only', codexAccountId: 'test', baseUrl: 'https://gw.wuweiai.io/api/gateway/v1', compactThreshold: 0 };
    const provider = makeProvider(config);
    await provider.complete('', history, [], {});
    await provider.complete('', history, [], {});
    assert.ok(JSON.stringify(captured[0]).length < 1024 * 1024); // Two pictures plus base64 fit below 1 MiB.
    assert.ok(JSON.stringify(captured[0]).includes('data:image/jpeg;base64,'));
    assert.deepEqual(history, saved);
    assert.equal(decoded, 1); // History is not decoded repeatedly on every tool continuation.
  });
}
