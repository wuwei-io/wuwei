import React from 'react';
import {tr} from '../../../../src/localization/index.js';
import {imageModelLabel} from '../../../../src/imagegen/image-catalog.js';
type Entry={id:string;title:string;updatedAt:number;imageSku?:string};
export function ImageCreationHistory({entries,loading,lang,model,onOpen,onDelete}:{entries:Entry[];loading:boolean;lang:string;model:(sku:string)=>string;onOpen:(id:string)=>void;onDelete:(id:string)=>void}){
 return <section className="image-creation-history" aria-label={tr('studio.history')}><h2>{tr('studio.history')}</h2>
 {loading?<p role="status">{tr('ui.billingpanel.loading.64db553')}</p>:!entries.length?<p>{tr('ui.app.no.conversations.yet.b8bca7a')}</p>:entries.map(row=><article key={row.id}>
  <button className="image-history-open" onClick={()=>onOpen(row.id)}><strong>{row.title}</strong><small>{row.imageSku?imageModelLabel({model:model(row.imageSku)}):tr('studio.title')} · {new Date(row.updatedAt).toLocaleString(lang)}</small></button>
  <button className="image-history-delete" aria-label={tr('video.deleteHistory')} title={tr('video.deleteHistory')} onClick={()=>onDelete(row.id)}>×</button>
 </article>)}</section>;
}
