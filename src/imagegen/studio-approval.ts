import {randomUUID} from 'node:crypto';
import type {ImageQuote} from './platform-billing-client.js';

export interface StudioImageQuote extends ImageQuote { approval_id:string; expires_at:number; count:number }
export interface StudioImageAuthorization { prompt:string; quote:ImageQuote; count?:number; isCurrent:()=>boolean }

// Only quotes issued by the desktop main process can authorize a direct click.
// A language-model tool input is never an authorization source.
export class StudioImageApprovals {
  private entries=new Map<string,{quote:ImageQuote;prompt:string;sid:string;owner:string;expires:number;count:number}>();
  constructor(private now=Date.now) {}
  issue(quote:ImageQuote,prompt:string,sid:string,owner:string,count=1):StudioImageQuote {
    if(!Number.isInteger(count)||count<1||count>4)throw new Error('INVALID_IMAGE_COUNT');
    for(const [key,row] of this.entries)if(row.expires<=this.now())this.entries.delete(key);
    while(this.entries.size>=128)this.entries.delete(this.entries.keys().next().value!);
    const approval_id=randomUUID(),expires_at=this.now()+120000;
    this.entries.set(approval_id,{quote:Object.freeze({...quote}),prompt,sid,owner,expires:expires_at,count});
    return {...quote,estimated_coins:quote.estimated_coins*count,authorization_ceiling:quote.authorization_ceiling*count,count,approval_id,expires_at};
  }
  consume(id:string,prompt:string,sid:string,owner:string):{prompt:string;quote:ImageQuote;count:number}|undefined {
    const row=this.entries.get(id);this.entries.delete(id);
    if(!row||row.expires<=this.now()||row.prompt!==prompt||row.sid!==sid||row.owner!==owner)return;
    return {prompt:row.prompt,quote:row.quote,count:row.count};
  }
  clear(){this.entries.clear();}
}
export function imageAccountScope(token:string):string {
  // The quote endpoint has already authenticated this token. Keep the subject
  // stable across normal token refresh; opaque fixture/legacy tokens use equality.
  try {const sub=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub;if(typeof sub==='string'&&sub)return sub;}catch{}
  return token;
}
