// Explicit production acceptance only. Uses a dedicated fixture account and cancels new orders.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {Agent} from '../src/agent/loop.js';
import {makeProvider} from '../src/agent/provider.js';
import {platformImageTool} from '../src/tools/platform-imagegen.js';
import {createPlatformImageSession} from '../src/imagegen/platform-image-session.js';
import type {Config} from '../src/config.js';

if(process.argv[2]!=='--production-fixture')throw Error('Explicit production fixture mode required');
const ssh=spawnSync('ssh',['-o','ServerAliveInterval=15','-o','ServerAliveCountMax=4','-i','C:/Users/Administrator/.ssh/wuwei_gw_deploy','root@47.85.61.227','cat /opt/pg-backup/image-live-20261006/test-account.json'],{encoding:'utf8',windowsHide:true});
if(ssh.status!==0)throw Error('Fixture unavailable');
const {owner}=JSON.parse(ssh.stdout);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'wuwei-live-image-client-'));
const evidence=path.resolve('docs/verification/image-team-20261006');fs.mkdirSync(evidence,{recursive:true});
const events:any[]=[];let confirmations=0;
process.env.WUWEI_LANG='en';
const cfg={provider:'openai',authMode:'api-key',model:'glm-4.7-flash',apiKey:owner.token,baseUrl:'https://gw.wuweiai.io/api/gateway/v1',maxTokens:2000,contextWindow:128000,compactThreshold:100000,keepRecentTurns:6} as Config;
const provider=makeProvider(cfg);
assert.equal(typeof provider.platformImage,'function');
provider.platformImage=createPlatformImageSession('https://wuweiai.io',owner.token,path.join(root,'recovery'));
const agent=new Agent(provider,'You are a helpful assistant. Reply briefly in English.',[platformImageTool],{cwd:root},new Map([[platformImageTool.name,platformImageTool]]),{compactThreshold:0});
await agent.send('Use platform_imagegen to generate one small blue ceramic cube on a white background. First look up the catalog, then use openai-gpt-image-1-low only. Let the tool show its cost confirmation. Do not use shell commands.',{
 requestPermission:async()=> 'allow',
 onText:delta=>process.stdout.write(delta),
 requestDecision:async decision=>{confirmations++;assert.equal(decision.title,'Image cost confirmation');assert.match(decision.question,/Estimated hold:/);assert.match(decision.question,/authorized coins/);events.push({type:'fee-confirmation',title:decision.title,question:decision.question});return {action:'reply',value:'cancel_image'};},
 onToolStart:(_id,name,input)=>{events.push({type:'tool',name,action:input.action,sku:input.sku_id});console.log('Model called '+name+': '+input.action);},
 onToolEnd:(_id,result,isError)=>{assert.equal(isError,false,result);events.push({type:'tool-result',cancelled:result.includes('cancelled')});},
},AbortSignal.timeout(150000));
assert.equal(confirmations,1);
assert.ok(events.some(e=>e.action==='catalog'));assert.ok(events.some(e=>e.action==='generate'));
assert.equal(fs.existsSync(path.join(root,'recovery')),false);
console.log('PASS real model → image catalog → quote → English confirmation → cancellation, no order created');
const order='a056d4ac-ac1d-46b7-8b8d-02d8b5862b30';
const original=await provider.platformImage!({action:'query',order_id:order},{cwd:root});
assert.equal(original.isError,undefined,original.content);assert.ok(original.displayImage);
const info=JSON.parse(original.content);assert.equal(info.displayed,true);assert.equal(info.charged_coins,8);
const require=(await import('node:module')).createRequire(import.meta.url);const sharp=require('sharp');
const image=await sharp(fs.readFileSync(info.path)).raw().toBuffer({resolveWithObject:true});assert.equal(image.info.width,1024);assert.equal(image.info.height,1024);
events.push({type:'existing-image-display',order,width:1024,height:1024,charged_coins:info.charged_coins});
fs.writeFileSync(path.join(evidence,'live-client.json'),JSON.stringify({model:cfg.model,events,new_orders:0,original_order_displayed:true},null,2));
console.log('PASS actual client downloads and fully decodes original paid image without another generation');
