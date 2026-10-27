import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {downloadVideo} from '../desktop/main/video-download.js';

const bytes=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypmp42'),Buffer.alloc(4096,42)]);
const sha256=createHash('sha256').update(bytes).digest('hex');
async function fixture(){const root=await mkdtemp(join(tmpdir(),'wuwei-video-resume-'));return {file:join(root,'original.mp4'),size:bytes.length,sha256,guard:()=>{}}}
function response(offset:number){return new Response(bytes.subarray(offset),{status:offset?206:200,headers:{'content-length':String(bytes.length-offset),...(offset?{'content-range':`bytes ${offset}-${bytes.length-1}/${bytes.length}`}:{})}})}
function interrupted(){return new Response(new ReadableStream({async start(controller){controller.enqueue(bytes.subarray(0,1000));await new Promise(r=>setTimeout(r,20));controller.error(Error('Network disconnected'))}}),{headers:{'content-length':String(bytes.length)}})}
test('interrupted video resumes from the last written byte and reports real progress',async()=>{
 const options=await fixture(),offsets:number[]=[],progress:number[]=[];
 await downloadVideo({...options,request:async offset=>{offsets.push(offset);return offsets.length===1?interrupted():response(offset)},onProgress:(received)=>progress.push(received)});
 assert.deepEqual(offsets,[0,1000]);assert(progress.includes(1000));assert.equal(progress.at(-1),bytes.length);assert.deepEqual(await readFile(options.file),bytes);
});
test('manual retry and process restart keep partial bytes after all transient attempts fail',async()=>{
 const options=await fixture();let calls=0;
 await assert.rejects(downloadVideo({...options,request:async()=>{if(++calls===1)return interrupted();throw Error('Network offline')}}));
 assert.equal((await stat(options.file+'.part')).size,1000);const offsets:number[]=[];
 await downloadVideo({...options,request:async offset=>{offsets.push(offset);return response(offset)}});assert.deepEqual(offsets,[1000]);assert.deepEqual(await readFile(options.file),bytes);
});
test('server ignoring Range restarts cleanly without appending duplicate bytes',async()=>{
 const options=await fixture();await writeFile(options.file+'.part',bytes.subarray(0,1000));await writeFile(options.file+'.part.json',JSON.stringify({size:bytes.length,sha256}));
 await downloadVideo({...options,request:async offset=>{assert.equal(offset,1000);return response(0)}});assert.deepEqual(await readFile(options.file),bytes);
});
test('invalid range and corrupted originals never become playable cached files',async()=>{
 const options=await fixture();await assert.rejects(downloadVideo({...options,request:async()=>new Response(bytes,{status:206,headers:{'content-range':`bytes 9-${bytes.length-1}/${bytes.length}`}})}),/VIDEO_OUTPUT_UNVERIFIED/);
 await assert.rejects(stat(options.file));
 await assert.rejects(downloadVideo({...options,request:async()=>new Response(Buffer.alloc(bytes.length,0))}),/VIDEO_OUTPUT_UNVERIFIED/);await assert.rejects(stat(options.file));await assert.rejects(stat(options.file+'.part'));
});
test('account change stops retries and preserves owner isolation',async()=>{
 const options=await fixture();let changed=false,calls=0;
 await assert.rejects(downloadVideo({...options,guard:()=>{if(changed)throw Error('ACCOUNT_CHANGED')},request:async()=>{calls++;changed=true;return response(0)}}),/ACCOUNT_CHANGED/);assert.equal(calls,1);await assert.rejects(stat(options.file));
});
