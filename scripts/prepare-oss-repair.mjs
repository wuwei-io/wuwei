// Authenticated CI artifact contains short-lived PUT URLs; never print them.
import OSS from 'ali-oss';
import yaml from 'js-yaml';
import {writeFileSync} from 'node:fs';
const client=new OSS({endpoint:'https://oss-cn-hangzhou.aliyuncs.com',bucket:'wuwei-repo',secure:true,accessKeyId:process.env.OSS_KEY_ID,accessKeySecret:process.env.OSS_KEY_SECRET});
const base='https://download.wuweiai.io/';const files=new Map();
for(const name of ['latest.yml','latest-mac.yml','latest-linux.yml']){const r=await fetch(base+name);if(!r.ok)throw Error('Manifest unavailable');const text=await r.text();const doc=yaml.load(text);if(doc.version!=='1.7.40')throw Error('Unexpected version');files.set(name,{name,manifest:true,text});for(const f of doc.files){files.set(f.url,{name:f.url,size:f.size,sha512:f.sha512});if(/\.(exe|zip|dmg)$/.test(f.url))files.set(f.url+'.blockmap',{name:f.url+'.blockmap'});}}
const entries=[...files.values()].sort((a,b)=>Number(!!a.manifest)-Number(!!b.manifest)).map(f=>({...f,source:base+f.name,put:client.signatureUrl('updates/'+f.name,{method:'PUT',expires:7200,'Content-Type':'application/octet-stream'})}));
writeFileSync('repair-private.json',JSON.stringify({expiresAt:new Date(Date.now()+7200000).toISOString(),entries}));console.log('Created scoped two-hour PUT authorization for',entries.length,'release objects; URLs not logged');
