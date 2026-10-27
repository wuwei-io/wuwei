import {downloadVideo} from './video-download.js';
import {ipcMain,protocol,dialog} from 'electron';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,copyFile,stat,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import type {VideoRequest,VideoInput,VideoOrder,VideoAsset} from '../../src/videogen/contracts.js';
import {tr} from '../../src/localization/index.js';
import {VideoHistoryStore} from '../../src/videogen/history-store.js';

const id=(value:string)=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw Error('INVALID_ORDER');return value};
export function registerVideoStudio(options:{root:string;token:()=>string|undefined;refresh?:(rejected:string)=>Promise<string|undefined>}){
 const history=new VideoHistoryStore(options.root);
 const progress=new Map<string,{received:number;total:number}>();
 const pending=new Map<string,Promise<string>>(),verified=new Map<string,{size:number;mtime:number}>();
 // Reuse trusted order metadata across list refreshes and asset reads.
 const knownOrders=new Map<string,VideoOrder>(),orderReads=new Map<string,Promise<VideoOrder[]>>();
 const remember=(owner:string,rows:VideoOrder[])=>{for(const row of rows){const key=owner+'/'+id(row.id);knownOrders.delete(key);knownOrders.set(key,row)}while(knownOrders.size>400)knownOrders.delete(knownOrders.keys().next().value!)};
 const scope=()=>{const token=options.token();if(!token)throw Error('AUTH_REQUIRED');let user:string;try{user=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub}catch{throw Error('AUTH_REQUIRED')}if(!/^[a-zA-Z0-9-]{1,80}$/.test(user))throw Error('AUTH_REQUIRED');return {token,owner:createHash('sha256').update(user).digest('hex').slice(0,32)}};
 const request=async(path:string,method='GET',body?:unknown,offset=0)=>{
  const original=scope();const send=(token:string)=>fetch('https://wuweiai.io/api/videos'+path,{method,redirect:'error',...(!path.endsWith('/content')?{signal:AbortSignal.timeout(25000)}:{}),headers:{Authorization:'Bearer '+token,...(offset?{Range:`bytes=${offset}-`}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});let response:Response;try{response=await send(original.token)}catch{throw Error('VIDEO_CONNECTION_PENDING')}
  if(response.status===401&&options.refresh){const token=await options.refresh(original.token);if(scope().owner!==original.owner)throw Error('ACCOUNT_CHANGED');if(token)try{response=await send(token)}catch{throw Error('VIDEO_CONNECTION_PENDING')}}
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(typeof data.code==='string'?data.code:'VIDEO_UNAVAILABLE')}return response;
 };
 async function asset(orderId:string,completed?:VideoOrder):Promise<string>{
  const {owner}=scope(),key=owner+'/'+id(orderId),existing=pending.get(key);if(existing)return existing;
  const promise=(async()=>{const folder=join(options.root,owner),file=join(folder,id(orderId)+'.mp4');
   const url=`wuwei-video://media/${owner}/${orderId}`;
   const checkCache=async(expected:{byte_length:number;sha256:string})=>{try{const info=await stat(file);if(info.size!==Number(expected.byte_length)||!/^[a-f0-9]{64}$/.test(expected.sha256))return false;const previous=verified.get(key);if(previous?.size===info.size&&previous.mtime===info.mtimeMs)return true;if(createHash('sha256').update(await readFile(file)).digest('hex')!==expected.sha256)return false;verified.set(key,{size:info.size,mtime:info.mtimeMs});return true}catch{return false}};
   try{const manifest=JSON.parse(await readFile(file+'.json','utf8'));if(await checkCache(manifest)){if(scope().owner!==owner)throw Error('ACCOUNT_CHANGED');return url}}catch{}
   const known=completed??knownOrders.get(key);
   const detail=known?.id===orderId&&known.status==='completed'&&known.byte_length&&/^[a-f0-9]{64}$/.test(known.sha256??'')?known:await(await request('/orders/'+orderId)).json() as VideoOrder;
   if(detail.status!=='completed'||!detail.byte_length)throw Error('VIDEO_NOT_READY');
   if(!await checkCache({byte_length:Number(detail.byte_length),sha256:detail.sha256??''})){
    await mkdir(folder,{recursive:true});
    await downloadVideo({file,size:Number(detail.byte_length),sha256:detail.sha256??'',request:offset=>request('/orders/'+orderId+'/content','GET',undefined,offset),guard:()=>{if(scope().owner!==owner)throw Error('ACCOUNT_CHANGED')},onProgress:(received,total)=>progress.set(key,{received,total})});
   }
   const manifestTemp=file+'.'+randomUUID()+'.json.tmp';try{await writeFile(manifestTemp,JSON.stringify({byte_length:detail.byte_length,sha256:detail.sha256}),{flag:'wx'});await rename(manifestTemp,file+'.json')}catch{await unlink(manifestTemp).catch(()=>{})}
   if(scope().owner!==owner)throw Error('ACCOUNT_CHANGED');return `wuwei-video://media/${owner}/${orderId}`;
  })();pending.set(key,promise);try{return await promise}finally{pending.delete(key);progress.delete(key)}
 }
 protocol.handle('wuwei-video',async request=>{
  try{
   const url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean),{owner}=scope();if(url.hostname!=='media'||parts.length!==2||parts[0]!==owner)return new Response(null,{status:403});
   if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
   const file=join(options.root,owner,id(parts[1])+'.mp4'),size=(await stat(file)).size,range=request.headers.get('range');let start=0,end=size-1,status=200;
   if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||!match[1]&&!match[2])return new Response(null,{status:416});start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));end=match[1]&&match[2]?Math.min(Number(match[2]),size-1):size-1;if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});status=206}
   return new Response(request.method==='HEAD'?null:Readable.toWeb(createReadStream(file,{start,end})) as ReadableStream,{status,headers:{'Content-Type':'video/mp4','Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'no-store',...(status===206?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})}});
  }catch{return new Response(null,{status:404})}
 });
 ipcMain.handle('account:video-studio',async(_event,input:VideoRequest)=>{
  try{
   if(!input||typeof input!=='object')throw Error('INVALID_INPUT');
   if(input.action==='catalog'){
    const token=options.token();if(token){let expiry=0;try{expiry=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).exp*1000}catch{}if(expiry<Date.now()+60000&&options.refresh)await options.refresh(token);return await(await request('/catalog')).json()}
    const response=await fetch('https://wuweiai.io/api/videos/catalog',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('VIDEO_UNAVAILABLE');return await response.json();
   }
   const {owner}=scope();
   if(input.action==='history')return await history.list(owner);
   if(input.action==='cached_orders'){const rows=await history.cachedOrders(owner);if(scope().owner!==owner)throw Error('ACCOUNT_CHANGED');remember(owner,rows);return rows;}
   if(input.action==='delete_history')return await history.remove(owner,id(input.request_id));
   if(input.action==='orders'){
    // Concurrent history/focus/poll requests share one read for this account.
    let read=orderReads.get(owner);
    if(!read){read=(async()=>{
     const rows=await(await request('/orders')).json() as VideoOrder[];if(scope().owner!==owner)throw Error('ACCOUNT_CHANGED');
     remember(owner,rows);const visible=await history.sync(owner,rows);
     // Warm recent visible outputs without blocking history or redownloading cached files.
     for(const row of visible.filter(row=>row.status==='completed'&&row.completed_at&&Date.now()-Date.parse(row.completed_at)<600000).slice(0,2))void asset(row.id,row).catch(()=>{});
     return visible;
    })();orderReads.set(owner,read);}
    try{return await read}finally{if(orderReads.get(owner)===read)orderReads.delete(owner)}
   }
   if(input.action==='order')return await(await request('/orders/'+id(input.id))).json();
   if(input.action==='quote')return await(await request('/quote','POST',{input:input.input})).json();
   if(input.action==='create'){await history.attach(owner,id(input.request_id),input.creation_id===undefined?undefined:id(input.creation_id));if(scope().owner!==owner)throw Error('ACCOUNT_CHANGED');const rows=await(await request('/orders','POST',{input:input.input,approval:input.approval,request_id:id(input.request_id)})).json() as VideoOrder[];if(scope().owner!==owner)throw Error('ACCOUNT_CHANGED');try{return await history.sync(owner,rows)}catch{return rows}}
   if(input.action==='reauthorize')return await(await request('/orders/'+id(input.id)+'/reauthorize','POST',{approved_coins:input.approved_coins})).json();
   if(input.action==='asset_progress')return progress.get(owner+'/'+id(input.id))??null;
   if(input.action==='asset')return {url:await asset(input.id)} satisfies VideoAsset;
   if(input.action==='download'){
    await asset(input.id);if(scope().owner!==owner)throw Error('ACCOUNT_CHANGED');
    const result=await dialog.showSaveDialog({title:tr('studio.gallery.download'),defaultPath:`wuwei-video-${id(input.id)}.mp4`,filters:[{name:'MP4',extensions:['mp4']}]});if(result.canceled||!result.filePath)return {saved:false};
    await copyFile(join(options.root,owner,input.id+'.mp4'),result.filePath);return {saved:true};
   }
   if(input.action==='draft'||input.action==='pending'){
    const folder=join(options.root,owner),file=join(folder,input.action+'.json'),data=input.action==='draft'?input.draft:input.value;
    if(data===undefined){try{return JSON.parse(await readFile(file,'utf8'))}catch{return null}}
    const value=JSON.stringify(data);if(value.length>16*1024*1024)throw Error('INVALID_REFERENCE');await mkdir(folder,{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,value);await rename(temporary,file);return true;
   }
   throw Error('INVALID_INPUT');
  }catch(error){return {error:error instanceof Error?error.message:'VIDEO_UNAVAILABLE'}}
 });
}
