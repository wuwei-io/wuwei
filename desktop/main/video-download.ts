import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {open,readFile,writeFile,stat,rename,unlink} from 'node:fs/promises';

type DownloadOptions={
 file:string;size:number;sha256:string;
 request:(offset:number)=>Promise<Response>;
 guard:()=>void;
 onProgress?:(received:number,total:number)=>void;
};

/** Keep interrupted transfers on disk. Only a complete, hash-verified MP4 is playable. */
export async function downloadVideo(options:DownloadOptions):Promise<void>{
 const {file,size,sha256,request,guard,onProgress}=options;
 if(!Number.isSafeInteger(size)||size<8||size>256*1024*1024||!/^[a-f0-9]{64}$/.test(sha256))throw Error('VIDEO_OUTPUT_UNVERIFIED');
 const partial=file+'.part',manifest=partial+'.json';
 const discard=async()=>{await unlink(partial).catch(()=>{});await unlink(manifest).catch(()=>{})};
 try{const saved=JSON.parse(await readFile(manifest,'utf8'));if(saved.size!==size||saved.sha256!==sha256)await discard()}catch{await discard()}
 await writeFile(manifest,JSON.stringify({size,sha256}));
 for(let attempt=0;attempt<3;attempt++){
  guard();let offset=await stat(partial).then(s=>s.size).catch(()=>0);
  if(offset>size){await discard();await writeFile(manifest,JSON.stringify({size,sha256}));offset=0}
  onProgress?.(offset,size);
  try{
   if(offset<size){
    // No wall-clock download timeout: a slow but progressing transfer stays alive.
    const response=await request(offset);guard();
    const range=response.headers.get('content-range');
    if(response.status===206){
     const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(range??'');
     if(!match||Number(match[1])!==offset||Number(match[2])!==size-1||Number(match[3])!==size){await response.body?.cancel();throw Error('VIDEO_OUTPUT_UNVERIFIED')}
    }else if(response.status===200){offset=0}else{await response.body?.cancel();throw Error('VIDEO_CONNECTION_PENDING')}
    const length=response.headers.get('content-length');
    if(length!==null&&Number(length)!==size-offset){await response.body?.cancel();throw Error('VIDEO_OUTPUT_UNVERIFIED')}
    if(!response.body)throw Error('VIDEO_CONNECTION_PENDING');
    const reader=response.body.getReader(),handle=await open(partial,offset?'a':'w');
    try{
     for(;;){
      guard();const chunk=await reader.read();if(chunk.done)break;guard();
      if(offset+chunk.value.length>size)throw Error('VIDEO_OUTPUT_UNVERIFIED');
      let written=0;while(written<chunk.value.length){const result=await handle.write(chunk.value,written,chunk.value.length-written);if(!result.bytesWritten)throw Error('VIDEO_CACHE_WRITE_FAILED');written+=result.bytesWritten}
      offset+=chunk.value.length;onProgress?.(offset,size);
     }
    }finally{await reader.cancel().catch(()=>{});await handle.close()}
    if(offset!==size)throw Error('VIDEO_CONNECTION_PENDING');
   }
   guard();const digest=createHash('sha256');for await(const chunk of createReadStream(partial))digest.update(chunk);
   const handle=await open(partial,'r');let signature:Buffer;try{signature=Buffer.alloc(8);await handle.read(signature,0,8,0)}finally{await handle.close()}
   if(digest.digest('hex')!==sha256||signature.subarray(4,8).toString()!=='ftyp')throw Error('VIDEO_OUTPUT_UNVERIFIED');
   guard();await rename(partial,file);await unlink(manifest).catch(()=>{});onProgress?.(size,size);return;
  }catch(error){
   guard();const code=error instanceof Error?error.message:'';
   if(code==='VIDEO_OUTPUT_UNVERIFIED'){await discard();throw error}
   if(['AUTH_REQUIRED','ACCOUNT_CHANGED','VIDEO_CACHE_WRITE_FAILED'].includes(code)||attempt===2)throw error;
  }
 }
}
