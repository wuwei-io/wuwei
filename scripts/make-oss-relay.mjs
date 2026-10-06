import OSS from 'ali-oss';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
if (process.env.RELEASE_TAG !== `v${version}`) throw new Error('Release tag/version mismatch');
const client = new OSS({ endpoint: 'https://oss-cn-hangzhou.aliyuncs.com', secure: true,
  bucket: 'wuwei-repo', accessKeyId: process.env.OSS_KEY_ID, accessKeySecret: process.env.OSS_KEY_SECRET });
const files = [];
for (const name of fs.readdirSync('release')) {
  if (!fs.statSync(path.join('release', name)).isFile()) continue;
  if (!/\.(exe|dmg|AppImage|deb|zip|blockmap|yml)$/i.test(name)) continue;
  if (!/^latest(?:-mac|-linux)?\.yml$/.test(name) && !name.includes(version)) throw new Error('Unexpected artifact version');
  const md5 = createHash('md5'), sha512 = createHash('sha512');
  for await (const chunk of fs.createReadStream(path.join('release', name))) { md5.update(chunk); sha512.update(chunk); }
  const contentType = name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream';
  files.push({ name, size: fs.statSync(path.join('release', name)).size, md5: md5.digest('hex'), sha512: sha512.digest('base64'),
    contentType, putUrl: client.signatureUrl(`updates/${name}`, { method: 'PUT', expires: 7200, 'Content-Type': contentType }) });
}
if (!files.some(f => !f.name.endsWith('.yml')) || !files.some(f => f.name.endsWith('.yml'))) throw new Error('Incomplete release artifacts');
const report = { version, releaseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7200000).toISOString(), files };
fs.writeFileSync(`release/oss-relay-${process.env.RUNNER_OS}.json`, JSON.stringify(report), { mode: 0o600 });
console.log(`Prepared ${files.length} scoped relay uploads for ${version}; private draft assets only`);
