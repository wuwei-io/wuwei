import type {ModelChoice} from './model-selection.js';
import {canUseTextModel,textModelMembership} from './text-model-membership.js';

type Choice=Pick<ModelChoice,'key'|'category'|'free'|'membershipRequired'|'membershipEligible'>;
type Account=Parameters<typeof canUseTextModel>[1];
export function modelMembership(choice:Choice) {
 if(choice.category==='images'||choice.category==='videos')return choice.membershipRequired??null;
 return textModelMembership(choice);
}
/** Preserve the media service's own membership threshold, including its Mini/Pro distinction. */
export function canUseModel(choice:Choice,account:Account,now=Date.now()):boolean {
 if(choice.category==='images'||choice.category==='videos') {
  return !modelMembership(choice)||(!!account&&choice.membershipEligible===true);
 }
 return canUseTextModel(choice,account,now);
}
