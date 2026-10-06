import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { uploadReleaseFiles } from '../scripts/lib/oss-release-upload.mjs';

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wuwei-oss-upload-'));
  fs.writeFileSync(path.join(directory, 'latest.yml'), 'version: 1.7.42');
  const artifact = path.join(directory, 'wuwei-1.7.42-setup.exe');
  const fd = fs.openSync(artifact, 'w'); fs.ftruncateSync(fd, 9 * 1024 * 1024); fs.closeSync(fd);
  return { directory, cleanup: () => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + 'wuwei-oss-upload-'));
    fs.rmSync(directory, { recursive: true, force: true });
  } };
}
const options = { log() {}, sleep: async () => {}, heartbeatMs: 30000 };

test('OSS retry resumes completed parts and publishes manifest only after verified artifact', async () => {
  const { directory, cleanup } = fixture(); const calls = []; let count = 0;
  const checkpoint = { uploadId: 'fixture', doneParts: [{ number: 1, etag: 'one' }] };
  try {
    await uploadReleaseFiles({
      async multipartUpload(key, local, settings) {
        calls.push('artifact');
        if (++count === 1) { await settings.progress(0.1, checkpoint); throw Object.assign(new Error('timeout'), { name: 'ConnectionTimeoutError' }); }
        assert.equal(settings.checkpoint, checkpoint); assert.equal(settings.checkpoint.doneParts.length, 1);
      },
      async put() { calls.push('manifest'); },
      async head(key) {
        calls.push('head'); return { res: { headers: { 'content-length': fs.statSync(path.join(directory, path.basename(key))).size } } };
      },
    }, directory, options);
    assert.deepEqual(calls, ['artifact', 'artifact', 'head', 'manifest', 'head']);
  } finally { cleanup(); }
});

test('OSS permission failure stops before publishing the new manifest', async () => {
  const { directory, cleanup } = fixture(); let manifest = false, attempts = 0;
  try {
    await assert.rejects(uploadReleaseFiles({
      async multipartUpload() { attempts++; throw Object.assign(new Error('denied'), { status: 403 }); },
      async put() { manifest = true; },
    }, directory, options), /denied/);
    assert.equal(attempts, 1); assert.equal(manifest, false);
  } finally { cleanup(); }
});

test('OSS size mismatch stops before publishing the new manifest', async () => {
  const { directory, cleanup } = fixture(); let manifest = false;
  try {
    await assert.rejects(uploadReleaseFiles({
      async multipartUpload() {}, async put() { manifest = true; },
      async head() { return { res: { headers: { 'content-length': 1 } } }; },
    }, directory, { ...options, attempts: 1 }), /size mismatch/);
    assert.equal(manifest, false);
  } finally { cleanup(); }
});
