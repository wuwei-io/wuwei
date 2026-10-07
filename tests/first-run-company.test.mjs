import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initializeFirstRunSettings,teamEnabled} from '../desktop/main/settings.ts';

test('new profile starts with free chat and company enabled; initialization runs only once',t=>{
 const root=mkdtempSync(join(tmpdir(),'wuwei-first-run-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const file=join(root,'config.json');assert.equal(initializeFirstRunSettings(file),true);
 const saved=readFileSync(file,'utf8'),settings=JSON.parse(saved);
 assert.equal(settings.providerId,'wuwei-free');assert.equal(settings.kind,'openai');
 assert.equal(teamEnabled(settings),true);assert.equal(initializeFirstRunSettings(file),false);
 assert.equal(readFileSync(file,'utf8'),saved);
});
test('existing on, off, legacy and unreadable settings remain byte-for-byte unchanged',t=>{
 const root=mkdtempSync(join(tmpdir(),'wuwei-first-run-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const file=join(root,'config.json');
 for(const original of ['{"app":{"teamEnabled":false},"model":"custom"}','{"app":{"teamEnabled":true}}','{"model":"legacy"}','{broken']) {
  writeFileSync(file,original);assert.equal(initializeFirstRunSettings(file),false);assert.equal(readFileSync(file,'utf8'),original);
 }
});
