import fs from 'node:fs';
import assert from 'node:assert/strict';
const version = process.env.RELEASE_TAG?.replace(/^v/, '');
assert.match(version, /^\d+\.\d+\.\d+$/);
const base = 'https://wuwei-repo.oss-cn-hangzhou.aliyuncs.com/updates/';
fs.mkdirSync('release', { recursive: true });
for (const name of ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']) {
  const response = await fetch(base + name + '?verify=' + Date.now(), { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(text.match(/^version:\s*([^\s]+)\s*$/m)?.[1], version);
  const files = [...text.matchAll(/- url:\s*([^\r\n]+)\s+sha512:\s*([^\r\n]+)\s+size:\s*(\d+)/g)];
  assert.ok(files.length);
  for (const entry of files) {
    const file = entry[1].trim(); assert.match(file, /^[A-Za-z0-9._-]+$/); assert.ok(file.includes(version));
    const head = await fetch(base + file, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
    assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), Number(entry[3]));
  }
  fs.writeFileSync('release/' + name, text);
}
console.log(`All OSS manifests and referenced artifacts are ready for ${version}`);
