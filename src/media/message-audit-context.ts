import {AsyncLocalStorage} from 'node:async_hooks';
const context=new AsyncLocalStorage<string>();
export function withMessageAudit<T>(id:string|undefined,run:()=>T):T{return id?context.run(id,run):run()}
export function currentMessageAudit():string|undefined{return context.getStore()}
