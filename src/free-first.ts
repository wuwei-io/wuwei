import {anonymousDefaultModel,rememberedModelChoice,type ModelChoice,type ModelPreferenceSettings} from './model-selection.js';

/** Explicit account choices survive sign-in. First-time defaults always stay free. */
export function signedInDefaultModel(choices:ModelChoice[],settings:ModelPreferenceSettings,userId:string):ModelChoice|undefined {
 return rememberedModelChoice(choices,settings,userId)??anonymousDefaultModel(choices)??choices.find(c=>c.free);
}
export const PAID_SWITCH_CONTEXT_WARNING_TOKENS=16000;
export function paidSwitchNeedsFreshChat(currentFree:boolean,target:Pick<ModelChoice,'free'|'category'>,contextTokens:number):boolean {
 return currentFree&&!target.free&&(target.category==='economy'||target.category==='premium')&&Number.isFinite(contextTokens)&&contextTokens>=PAID_SWITCH_CONTEXT_WARNING_TOKENS;
}
/** Fallback is only used until the server has supplied this chat's input usage. */
export function switchContextTokens(lastInput:number,items:readonly {type:string;text?:string;result?:string}[]):number {
 if(Number.isFinite(lastInput)&&lastInput>0)return lastInput;
 return Math.ceil(items.reduce((n,item)=>n+(item.type==='notice'?0:(item.text??item.result??'').length),0)/3);
}
