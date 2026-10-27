// Local copies of provider artwork; asset provenance is recorded in assets/model-brands/sources.json.
import seedream from './assets/image-studio/seedream.ico';
import grok from './assets/image-studio/grok.ico';
import google from './assets/video/google.png';
import kling from './assets/video/kling.ico';
import wan from './assets/video/wan.ico';
import minimax from './assets/video/minimax.ico';
import flux from './assets/model-brands/flux.svg';
import recraft from './assets/model-brands/recraft.png';
import sourceful from './assets/model-brands/sourceful.ico';
import microsoft from './assets/model-brands/microsoft.ico';
import hunyuan from './assets/model-brands/hunyuan.svg';
import stepfun from './assets/model-brands/stepfun.svg';
import mistral from './assets/model-brands/mistral.svg';
import meta from './assets/model-brands/meta.svg';
import cohere from './assets/model-brands/cohere.png';
import runway from './assets/model-brands/runway.png';
import happyhorse from './assets/model-brands/happyhorse.png';
import openrouter from './assets/model-brands/openrouter.png';

export const BRAND_ICON_FILES:Record<string,string>={seedream,seedance:seedream,grok,xai:grok,google,kling,wan,minimax,flux,recraft,sourceful,microsoft,hunyuan,tencent:hunyuan,stepfun,mistral,meta,cohere,runway,happyhorse,openrouter};

// Match the model before its hosting provider: OpenRouter serves many unrelated brands.
export function modelBrandKey(model:string,provider=''):string|null {
  const match=(value:string):string|null=>{
    const text=value.toLowerCase();
    return /seedream|dola-seed|seedance/.test(text)?'seedream'
      :/kling|kwaivgi/.test(text)?'kling'
      :/happyhorse/.test(text)?'happyhorse'
      :/runway/.test(text)?'runway'
      :/black-forest-labs|flux/.test(text)?'flux'
      :/recraft/.test(text)?'recraft'
      :/sourceful|riverflow/.test(text)?'sourceful'
      :/microsoft|mai-image/.test(text)?'microsoft'
      :/tencent|hy-image|hunyuan/.test(text)?'hunyuan'
      :/mimo|xiaomi/.test(text)?'mimo'
      :/deepseek/.test(text)?'deepseek'
      :/qwen/.test(text)?'qwen'
      :/glm|zhipu/.test(text)?'glm'
      :/nemotron|nvidia/.test(text)?'nvidia'
      :/claude|anthropic/.test(text)?'claude'
      :/gpt|openai|codex/.test(text)?'openai'
      :/gemini|nano.banana|google|^veo$/.test(text)?'google'
      :/kimi|moonshot/.test(text)?'kimi'
      :/grok|x-ai|^xai$/.test(text)?'grok'
      :/hailuo|minimax/.test(text)?'minimax'
      :/doubao/.test(text)?'doubao'
      :/step/.test(text)?'stepfun'
      :/mistral|codestral|devstral|ministral|pixtral/.test(text)?'mistral'
      :/llama|^meta$/.test(text)?'meta'
      :/cohere|north.*code|command-[ar]/.test(text)?'cohere'
      :/wan(?:[- /.]|$)/.test(text)?'wan'
      :/openrouter/.test(text)?'openrouter':null;
  };
  return match(model)??match(provider);
}
