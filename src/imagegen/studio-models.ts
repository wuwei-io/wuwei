import {STAGED_STUDIO_MODELS} from './studio-model-expansion.js';
// Descriptive capabilities, not a selectable price catalogue. A model is
// actionable only when the authenticated server supplies a verified billing SKU.
export interface StudioModelProfile {model:string;label:string;brand:string;description:string;maxResolution:string;premium?:boolean}
export const STUDIO_MODELS:StudioModelProfile[]=[
  {model:'dola-seedream-5-0-flash-260915',label:'Seedream 5.0 Flash',brand:'Seedream',description:'fast',maxResolution:'2K'},
  {model:'dola-seedream-5-0-pro-260628',label:'Seedream 5.0 Pro',brand:'Seedream',description:'product',maxResolution:'2K',premium:true},
  {model:'seedream-5-0-lite-260128',label:'Seedream 5.0 Lite',brand:'Seedream',description:'cinematic',maxResolution:'4K'},
  {model:'seedream-4-5-251128',label:'Seedream 4.5',brand:'Seedream',description:'detail',maxResolution:'4K'},
  {model:'seedream-4-0-250828',label:'Seedream 4.0',brand:'Seedream',description:'value',maxResolution:'4K'},
  {model:'gpt-image-2.5-flare',label:'GPT Image 2.5 Flare',brand:'OpenAI',description:'natural',maxResolution:'4K'},
  {model:'gpt-image-2.5-sunburst',label:'GPT Image 2.5 Sunburst',brand:'OpenAI',description:'precision',maxResolution:'4K',premium:true},
  {model:'gpt-image-2',label:'GPT Image 2',brand:'OpenAI',description:'typography',maxResolution:'4K'},
  {model:'google/gemini-nano-banana-2.1',label:'Nano Banana 2.1',brand:'Google',description:'reference',maxResolution:'4K'},
  {model:'google/gemini-3.1-flash-lite-image',label:'Nano Banana 2 Lite',brand:'Google',description:'fast',maxResolution:'1K'},
  {model:'google/gemini-3.1-flash-image-preview',label:'Nano Banana 2',brand:'Google',description:'creative',maxResolution:'4K'},
  {model:'google/gemini-3-pro-image',label:'Nano Banana Pro',brand:'Google',description:'editing',maxResolution:'4K',premium:true},
  {model:'google/gemini-2.5-flash-image',label:'Nano Banana',brand:'Google',description:'light',maxResolution:'1K'},
  {model:'grok-imagine-image-2.0',label:'Grok Imagine 2',brand:'xAI',description:'style',maxResolution:'2K'},
  ...STAGED_STUDIO_MODELS,
];
export function studioModelProfile(model:string):StudioModelProfile|undefined{return STUDIO_MODELS.find(row=>row.model===model);}
