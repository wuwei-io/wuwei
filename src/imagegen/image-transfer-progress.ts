import {createHash} from 'node:crypto';

export type ImageTransferProgress={orderId:string;toolId?:string;received:number;total:number|null};
const transfers=new Map<string,ImageTransferProgress>();
function scope(token:string,sid:string){
 let sub:string;try{sub=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub}catch{return null}
 return typeof sub==='string'&&sub&&sid?createHash('sha256').update(sub).digest('hex')+'/'+sid+'/':null;
}
export function readImageTransfers(token:string,sid:string):ImageTransferProgress[]{
 const prefix=scope(token,sid);return prefix?[...transfers].filter(([key])=>key.startsWith(prefix)).map(([,value])=>({...value})):[];
}
export function beginImageTransfer(token:string,sid:string|undefined,toolId:string|undefined,orderId:string){
 const prefix=sid?scope(token,sid):null,key=prefix?prefix+orderId:null;
 const update=(received:number,total:number|null)=>{if(key)transfers.set(key,{orderId,toolId,received,total})};
 update(0,null);return {update,finish:()=>{if(key)transfers.delete(key)}};
}
