import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceUpdater, UPDATE_FEEDS, manifestChannel, manifestVersion} from '../desktop/main/update-sources.ts';
const [github, china] = UPDATE_FEEDS;
function fixture({versions = ['1.7.81', '1.7.81'], failCheck = '', failDownload = ''} = {}) {
  let selected; const downloads = [], checks = [];
  const sdk = {
    setFeedURL({url}) { selected = url; },
    async checkForUpdates() { checks.push(selected); if(selected === failCheck) throw Error('feed offline'); return {isUpdateAvailable:true,updateInfo:{version:versions[UPDATE_FEEDS.indexOf(selected)]}}; },
    async downloadUpdate() { downloads.push(selected); if(selected === failDownload) throw Error('download offline'); return ['verified-installer']; },
  };
  const wrapper = createSourceUpdater(sdk, {platform:'win32',timeoutMs:20, async fetchText(url, signal) {
    const index = UPDATE_FEEDS.findIndex(feed => url.startsWith(feed));
    if(!versions[index]) { await new Promise((_, reject) => signal.addEventListener('abort',()=>reject(Error('timeout')))); }
    if(index===0) await new Promise(r=>setTimeout(r,4));
    return `version: ${versions[index]}\nfiles: []\n`;
  }});
  return {wrapper, downloads, checks};
}
test('platform manifests and stable-only version parsing',()=>{
  assert.equal(manifestChannel('darwin'),'latest-mac.yml');assert.equal(manifestChannel('win32'),'latest.yml');assert.equal(manifestChannel('linux'),'latest-linux.yml');
  assert.deepEqual(manifestVersion("version: '1.7.81'\r\nfiles: []"),[1,7,81]);assert.throws(()=>manifestVersion('version: 1.7.81-beta'));
});
test('GitHub timeout falls back to domestic feed within probe deadline',async()=>{
  const f=fixture({versions:[null,'1.7.81']}); assert.equal((await f.wrapper.checkForUpdates()).updateInfo.version,'1.7.81');
  await f.wrapper.downloadUpdate();assert.deepEqual(f.downloads,[china]);
});
test('newer GitHub release wins over fast but stale mirror',async()=>{
  const f=fixture({versions:['1.7.82','1.7.81']});await f.wrapper.checkForUpdates();await f.wrapper.downloadUpdate();assert.deepEqual(f.downloads,[github]);
});
test('same version uses fastest available feed and falls back when download fails',async()=>{
  const f=fixture({failDownload:china});await f.wrapper.checkForUpdates();assert.deepEqual(await f.wrapper.downloadUpdate(),['verified-installer']);assert.deepEqual(f.downloads,[china,github]);
});
test('failed download never substitutes an older mirror version',async()=>{
  const f=fixture({versions:['1.7.82','1.7.81'],failDownload:github});await f.wrapper.checkForUpdates();await assert.rejects(f.wrapper.downloadUpdate(),/download offline/);assert.deepEqual(f.downloads,[github]);
});
test('failed selected manifest falls back to other reachable provider',async()=>{
  const f=fixture({failCheck:china});assert.equal((await f.wrapper.checkForUpdates()).updateInfo.version,'1.7.81');assert.deepEqual(f.checks,[china,github]);
});
test('all unavailable reports failure instead of latest-version success',async()=>{
  const f=fixture({versions:[null,null]});await assert.rejects(f.wrapper.checkForUpdates(),/unavailable/);assert.deepEqual(f.downloads,[]);
});
