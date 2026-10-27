export type FreeAllowance={dailyTokens:number;dailyCalls:number;resetTimezone:'Asia/Shanghai'};
let current:FreeAllowance|null=null;
const listeners=new Set<()=>void>();
export const freeAllowanceSnapshot=()=>current;
export const subscribeFreeAllowance=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)};};
export function setFreeAllowance(value:unknown):boolean{
 if(value===null){if(current!==null){current=null;listeners.forEach(fn=>fn());}return true;}
 if(!value||typeof value!=='object')return false;
 const v=value as Record<string,unknown>;
 if(typeof v.dailyTokens!=='number'||!Number.isFinite(v.dailyTokens)||v.dailyTokens<=0||typeof v.dailyCalls!=='number'||!Number.isFinite(v.dailyCalls)||v.dailyCalls<=0)return false;
 const next:FreeAllowance={dailyTokens:v.dailyTokens,dailyCalls:v.dailyCalls,resetTimezone:'Asia/Shanghai'};
 if(current?.dailyTokens!==next.dailyTokens||current?.dailyCalls!==next.dailyCalls){current=next;listeners.forEach(fn=>fn());}
 return true;
}
