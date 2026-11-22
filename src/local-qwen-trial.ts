export const LOCAL_QWEN_TRIAL_MODEL = 'qwen3-4b-local-trial';
export const LOCAL_QWEN_TRIAL_CONTEXT = 131072;
export function isLocalQwenTrial(choice: {providerId:string;modelId:string;free:boolean} | undefined): boolean {
  return choice?.providerId==='wuwei-free'&&choice.modelId===LOCAL_QWEN_TRIAL_MODEL&&choice.free===true;
}
