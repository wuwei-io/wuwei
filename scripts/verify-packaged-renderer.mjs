import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const {extractFile}=createRequire(import.meta.url)('@electron/asar');
const archive=path.resolve(process.argv[2]||'release/win-unpacked/resources/app.asar');
const renderer=path.resolve('out/renderer');
const expected=JSON.parse(fs.readFileSync('package.json','utf8')).version;
assert.equal(JSON.parse(extractFile(archive,'package.json').toString('utf8')).version,expected,'Packaged version mismatch');
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name)]);}
const hashes=[];
for(const file of files(renderer).sort()){
  const relative=path.relative(renderer,file).replaceAll('\\','/');
  const source=fs.readFileSync(file),packaged=extractFile(archive,path.join('out','renderer',relative));
  assert.ok(source.equals(packaged),'Packaged renderer differs from tested build: '+relative);
  hashes.push({file:relative,sha256:createHash('sha256').update(packaged).digest('hex')});
}
assert.ok(hashes.some(row=>row.file==='index.html'));
assert.ok(hashes.some(row=>row.file==='third-party/Inter-LICENSE.txt'));
assert.ok(hashes.some(row=>/InterVariable.*\.woff2$/.test(row.file)));
console.log(JSON.stringify({version:expected,archive,rendererFilesVerified:hashes.length,files:hashes},null,2));
