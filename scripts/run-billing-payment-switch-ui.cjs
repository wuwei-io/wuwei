const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..'),out=path.resolve(process.env.BILLING_SWITCH_EVIDENCE||'docs/verification/payment-switch-20261025');fs.mkdirSync(out,{recursive:true});
const req=require('node:module').createRequire(repo+'/package.json');
const entry=`import React from 'react';import {createRoot}from'react-dom/client';import{BillingPanel}from'./desktop/renderer/src/components/billing/BillingPanel.tsx';import{setCurrentLanguage}from'./src/localization/index.ts';import'./desktop/renderer/src/theme.css';
setCurrentLanguage('en');
const products=${fs.readFileSync(repo+'/tests/fixtures/billing-products.json','utf8')};
const quote={catalogVersion:'mini-300-20261025',sku:'v2_plan_mini_day',name:'Mini',kind:'plan',period:'trial',currency:'USD',amountMinor:300,creditsPerGrant:300,grantCount:1,expiryMonths:0,expiryDays:1,durationDays:1,autoRenew:false,memberBonus:false};
window.fixture={calls:[],opens:[],orders:{},failNext:false,holdNext:false,release:null,paid:false};
window.wuwei={openExternal:async url=>{fixture.opens.push(url);},track:async()=>{},billingRequest:async b=>{
 fixture.calls.push(b);
 if(b.action==='catalog')return{version:quote.catalogVersion,products,member:false,checkoutReady:true,channels:{alipay:true,paddle:true,crypto:true},trial:{enabled:true,eligible:true,cryptoChains:['solana']}};
 if(b.action==='quote')return quote;
 if(b.action==='create-order'){
  if(fixture.holdNext){fixture.holdNext=false;await new Promise(resolve=>fixture.release=resolve);}
  if(fixture.failNext){fixture.failNext=false;return{error:'TRIAL_PENDING'};}
  if(fixture.paid)return{error:'TRIAL_USED'};
  return fixture.orders[b.channel]??= {id:'wb_'+(b.channel==='crypto'?'a':'b').repeat(32),sku:quote.sku,currency:'USD',amountMinor:300,channel:b.channel,status:'pending',expiresAt:new Date(Date.now()+1800000).toISOString(),...(b.channel==='crypto'?{crypto:{network:'Solana',currency:'USDT',address:'fixture-address-not-payable',amount:'3'}}:{checkoutUrl:'https://wuweiai.io/en/billing-checkout?order=fixture&token=fixture'})};
 }
 if(b.action==='order')return Object.values(fixture.orders).find(o=>o.id===b.orderId);
 throw Error('Unexpected fixture action '+b.action);
}};
createRoot(document.getElementById('root')).render(<BillingPanel lang="en" accountId="fixture" balance={0} models={[]} initialPeriod="trial" onClose={()=>{}} onNeedLogin={()=>{throw Error('Unexpected login')}} onSwitch={async()=>{}}/>);`;
req('esbuild').buildSync({stdin:{contents:entry,resolveDir:repo,loader:'tsx'},bundle:true,platform:'browser',format:'iife',outfile:out+'/app.js',jsx:'automatic',loader:{'.woff2':'dataurl','.png':'dataurl'}});
fs.writeFileSync(out+'/index.html','<!doctype html><html data-theme="light"><meta charset="utf-8"><link rel="stylesheet" href="app.css"><div id="root"></div><script src="app.js"></script></html>');
const runner=`const{app,BrowserWindow,session}=require('electron');const fs=require('node:fs'),assert=require('node:assert/strict');app.setPath('userData',${JSON.stringify(out+'/isolated-profile')});const checks=[];
app.whenReady().then(async()=>{session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith('file:')&&!d.url.startsWith('data:')}));const win=new BrowserWindow({show:false,width:1400,height:940,webPreferences:{contextIsolation:true,nodeIntegration:false}});await win.loadFile(${JSON.stringify(out+'/index.html')});const js=code=>win.webContents.executeJavaScript(code,true),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(code){for(let i=0;i<150;i++){if(await js(code))return;await delay(35);}throw Error('Timed out: '+code+' '+await js('document.body.innerText.slice(-1800)'));}
async function click(selector){await wait('!!document.querySelector('+JSON.stringify(selector)+')&&!document.querySelector('+JSON.stringify(selector)+').disabled');await js('document.querySelector('+JSON.stringify(selector)+').click()');}
async function method(name){await wait('!![...document.querySelectorAll(".billing-pay-methods button")].find(e=>e.textContent.includes('+JSON.stringify(name)+')&&!e.disabled)');await js('[...document.querySelectorAll(".billing-pay-methods button")].find(e=>e.textContent.includes('+JSON.stringify(name)+')).click()');}
async function check(name,expr){assert.ok(await js(expr),name);checks.push(name);console.log('PASS '+name);}
try{
await click('.billing-selector-pay');await wait('!!document.querySelector(".billing-payment-choices")');
await method('Cryptocurrency');await wait('!!document.querySelector(".billing-crypto-address")');
await check('crypto pending displays', 'fixture.calls.filter(x=>x.action==="create-order").length===1');
await method('Card / PayPal');await wait('!!document.querySelector(".billing-payment-brands")');
await check('crypto -> PayPal opens checkout', 'fixture.opens.length===1&&!document.querySelector(".billing-error")');
await method('Cryptocurrency');await wait('!!document.querySelector(".billing-crypto-address")');
await check('switch back revalidates and reuses server order','fixture.calls.filter(x=>x.action==="create-order").length===3&&Object.keys(fixture.orders).length===2');
await js('fixture.failNext=true');await method('Card / PayPal');await wait('!!document.querySelector(".billing-error")');
await method('Cryptocurrency');await wait('!!document.querySelector(".billing-crypto-address")');
await check('switch clears prior payment error','!document.querySelector(".billing-error")');
await js('fixture.failNext=true');await method('Card / PayPal');await wait('!!document.querySelector(".billing-error")');
const before=await js('fixture.calls.filter(x=>x.action==="catalog").length');await click('.billing-error button');await wait('!!document.querySelector(".billing-payment-brands")');
await check('banner retry prepares chosen method without resetting catalog','fixture.calls.filter(x=>x.action==="catalog").length==='+before+'&&!document.querySelector(".billing-error")');
await js('fixture.holdNext=true');await method('Cryptocurrency');await wait('typeof fixture.release==="function"');
await check('in-flight switches prevent duplicate requests','[...document.querySelectorAll(".billing-payment-tabs button")].every(e=>e.disabled)');
await js('fixture.release()');await wait('!!document.querySelector(".billing-crypto-address")');
await js('fixture.paid=true');await method('Card / PayPal');await wait('!!document.querySelector(".billing-error")');
await check('paid sibling rejects stale pending link','!document.querySelector(".billing-payment-brands")&&document.querySelector(".billing-error").textContent.length>0');
await js('fixture.paid=false');await method('Cryptocurrency');await wait('!!document.querySelector(".billing-crypto-address")');
await js('fixture.orders.crypto={...fixture.orders.crypto,status:"paid",creditsGranted:300,balance:300}');await click('.billing-live-order>.billing-secondary');await wait('!!document.querySelector(".billing-paid-symbol")');
await check('confirmed payment locks further method switching','[...document.querySelectorAll(".billing-payment-tabs button")].every(e=>e.disabled)');
fs.writeFileSync(${JSON.stringify(out+'/verification.json')},JSON.stringify({passed:true,checks,actualProviderRequests:0},null,2));app.exit(0);
}catch(e){fs.writeFileSync(${JSON.stringify(out+'/failure.txt')},e.stack);console.error(e);app.exit(1);}});`;
fs.writeFileSync(out+'/runner.cjs',runner);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const r=spawnSync(repo+'/node_modules/electron/dist/electron.exe',[out+'/runner.cjs'],{env,encoding:'utf8',timeout:75000,windowsHide:true});fs.writeFileSync(out+'/test.log',(r.stdout||'')+(r.stderr||''));console.log((r.stdout||'')+(r.stderr||''));process.exit(r.status??1);
