import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdatePolicy, updateIntervalMs, jitterUpdateInterval } from '../desktop/main/update-policy.ts';
function fixture() {
 let now=0, checks=0, downloads=0, fail=false, available=true, exists=true;
 const updater={async checkForUpdates(){checks++; return {isUpdateAvailable:available,updateInfo:{version:'2.0.0'}};}, async downloadUpdate(){downloads++; if(fail) throw Error('network'); return ['setup.exe'];}};
 const policy=createUpdatePolicy(updater,{now:()=>now,readyExists:()=>exists});
 return {policy,updater,get counts(){return [checks,downloads];},time(n){now+=n;},fail(v){fail=v;},available(v){available=v;},exists(v){exists=v;}};
}
test('后台旧的分钟级配置被限制为两小时，支持较长配置和抖动',()=>{
 assert.equal(updateIntervalMs(60),7200000);assert.equal(updateIntervalMs(undefined),7200000);assert.equal(updateIntervalMs(14400),14400000);assert.equal(updateIntervalMs(999999),86400000);assert.equal(jitterUpdateInterval(100,()=>1),120);
});
test('并发检查/下载只执行一次',async()=>{const f=fixture();const a=f.policy.check();const b=f.policy.check(true);assert.equal(a,b);await a;assert.deepEqual(f.counts,[1,1]);});
test('最新版或较旧版不下载（以 SDK 判断为准）',async()=>{const f=fixture();f.available(false);assert.equal((await f.policy.check()).available,false);assert.deepEqual(f.counts,[1,0]);});
test('下载就绪后自动和手动均复用，不查询清单/重复下载',async()=>{const f=fixture();await f.policy.check();f.time(86400000);assert.equal((await f.policy.check()).downloaded,true);await f.policy.check(true);assert.deepEqual(f.counts,[1,1]);});
test('就绪文件被删除后重新验证缓存下载',async()=>{const f=fixture();await f.policy.check();f.exists(false);await f.policy.check(true);assert.deepEqual(f.counts,[2,2]);});
test('自动检查有统一两小时冷却，聚焦不额外请求',async()=>{const f=fixture();f.available(false);await f.policy.check();f.time(60000);await f.policy.check();assert.deepEqual(f.counts,[1,0]);f.time(7200000);await f.policy.check();assert.deepEqual(f.counts,[2,0]);});
test('失败自动下载同版本最多三次，手动也有冷却',async()=>{const f=fixture();f.fail(true);for(let i=0;i<5;i++){await f.policy.check();f.time(8*3600000);}assert.equal(f.counts[1],3);await f.policy.check(true);assert.equal(f.counts[1],4);await f.policy.check(true);assert.equal(f.counts[1],4);});
test('清单失败退避且并发合并',async()=>{const f=fixture();f.updater.checkForUpdates=async()=>{throw Error('offline');};assert.match((await f.policy.check()).error,/offline/);f.time(60000);assert.match((await f.policy.check()).error,/offline/);});
