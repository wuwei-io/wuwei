/** A replacement belongs to the current model step, never an earlier turn. */
export function recoverAssistantStep<T extends {type:string}>(
  items:T[], text:string, createAssistant:(text:string)=>T,
):T[] {
  for(let index=items.length-1;index>=0;index--){
    const item=items[index];
    if(item.type==='user'||item.type==='tool') break;
    if(item.type!=='assistant') continue;
    const next=[...items];
    if(text.trim()) next[index]={...item,text};
    else next.splice(index,1);
    return next;
  }
  return text.trim()?[...items,createAssistant(text)]:items;
}
