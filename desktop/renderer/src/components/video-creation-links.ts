import type {VideoHistoryEntry,VideoOrder} from '../../../../src/videogen/contracts.js';

type LinkStorage=Pick<Storage,'getItem'|'setItem'>;
type Links=Record<string,string>;
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const key=(owner:string)=>'video-studio-creation-links/'+owner;
function read(owner:string,storage:LinkStorage):Links{
 try{const rows=JSON.parse(storage.getItem(key(owner))??'{}');return Object.fromEntries(Object.entries(rows).filter((entry):entry is [string,string]=>uuid.test(entry[0])&&typeof entry[1]==='string'&&uuid.test(entry[1])))}catch{return {}}
}
function rootOf(links:Links,id:string){const seen=new Set<string>();while(links[id]&&links[id]!==id&&!seen.has(id)){seen.add(id);id=links[id]}return id}

/** Retain creation identity when the renderer is paired with an older main process. */
export function rememberVideoCreation(owner:string,requestId:string,creationId?:string,storage:LinkStorage=localStorage){
 if(!uuid.test(requestId)||creationId!==undefined&&!uuid.test(creationId))throw Error('INVALID_ORDER');
 const links=read(owner,storage),root=rootOf(links,creationId??requestId);
 if(links[requestId]&&rootOf(links,requestId)!==root)throw Error('INVALID_ORDER');
 storage.setItem(key(owner),JSON.stringify({...links,[requestId]:root}));return root;
}
export function projectVideoOrders(owner:string,orders:VideoOrder[],storage:LinkStorage=localStorage):VideoOrder[]{
 const links=read(owner,storage);return orders.map(order=>({...order,creation_id:rootOf(links,order.creation_id??order.request_id)}));
}
export function projectVideoHistory(owner:string,entries:VideoHistoryEntry[],storage:LinkStorage=localStorage):VideoHistoryEntry[]{
 const links=read(owner,storage),groups=new Map<string,VideoHistoryEntry>();
 for(const entry of entries){
  const root=rootOf(links,entry.requestId),previous=groups.get(root);
  groups.set(root,previous?{...previous,title:entry.requestId===root?entry.title:previous.title,createdAt:Math.min(previous.createdAt,entry.createdAt),updatedAt:Math.max(previous.updatedAt,entry.updatedAt),count:previous.count+entry.count}:{...entry,requestId:root});
 }
 return [...groups.values()].sort((a,b)=>b.updatedAt-a.updatedAt);
}
export function videoCreationMembers(owner:string,creationId:string,storage:LinkStorage=localStorage):string[]{
 const links=read(owner,storage),root=rootOf(links,creationId);return [...new Set([root,...Object.keys(links).filter(id=>rootOf(links,id)===root)])];
}
