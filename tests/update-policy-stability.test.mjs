import test from 'node:test';
import assert from 'node:assert/strict';
import {createUpdatePolicy} from '../desktop/main/update-policy.ts';
test('下载过程中1000个手动/自动触发合并成一个任务',async()=>{
 let checks=0,downloads=0,release;
 const gate=new Promise(r=>release=r);
 const p=createUpdatePolicy({async checkForUpdates(){checks++;return {isUpdateAvailable:true,updateInfo:{version:'2.0.0'}}},async downloadUpdate(){downloads++;await gate;return ['setup.exe']}});
 const jobs=Array.from({length:1000},(_,i)=>p.check(i%2===0));release();await Promise.all(jobs);assert.equal(checks,1);assert.equal(downloads,1);
});
test('24小时每分钟聚焦只检查12次，没有更新不下载',async()=>{
 let now=0,checks=0,downloads=0;
 const p=createUpdatePolicy({async checkForUpdates(){checks++;return {isUpdateAvailable:false,updateInfo:{version:'1.0.0'}}},async downloadUpdate(){downloads++;return []}},{now:()=>now});
 for(let i=0;i<1440;i++){await p.check();now+=60000;}assert.equal(checks,12);assert.equal(downloads,0);
});
test('空下载结果不标记就绪，并被重试上限约束',async()=>{
 let now=0,downloads=0;
 const p=createUpdatePolicy({async checkForUpdates(){return {isUpdateAvailable:true,updateInfo:{version:'2.0.0'}}},async downloadUpdate(){downloads++;return []}},{now:()=>now});
 for(let i=0;i<10;i++){const r=await p.check();assert.notEqual(r.downloaded,true);now+=8*3600000;}assert.equal(downloads,3);
});
test('旧版下载失败额度不阻止新版下载',async()=>{
 let now=0,version='2.0.0',fail=true,downloads=0;
 const p=createUpdatePolicy({async checkForUpdates(){return {isUpdateAvailable:true,updateInfo:{version}}},async downloadUpdate(){downloads++;if(fail)throw Error('offline');return ['setup.exe']}},{now:()=>now});
 for(let i=0;i<4;i++){await p.check();now+=8*3600000;}assert.equal(downloads,3);version='2.0.1';fail=false;assert.equal((await p.check()).downloaded,true);assert.equal(downloads,4);
});
test('检查错误退避指数增长，不每分钟重试',async()=>{
 let now=0,checks=0;
 const p=createUpdatePolicy({async checkForUpdates(){checks++;throw Error('offline')},async downloadUpdate(){throw Error('should not download')}},{now:()=>now});
 for(let i=0;i<1440;i++){await p.check();now+=60000;}assert.equal(checks,4);
});
