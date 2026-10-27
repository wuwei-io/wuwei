import assert from 'node:assert/strict';
import {test} from 'node:test';
import {imageStudioRows,imageProvider,imageDimensions,imageResolutionPixels,chooseImageVariant,validImagePrompt,sameModelVariants,withImageSkuChoices,STUDIO_RATIOS} from '../desktop/renderer/src/components/image-studio-catalog.ts';
import {readFileSync} from 'node:fs';
import {rememberedModelChoice} from '../src/model-selection.ts';
const low={sku_id:'low',model:'gpt-image-1',quality:'low',size:'1024x1024',coins_per_image:8,max_prompt_bytes:1000};
const medium={...low,sku_id:'medium',quality:'medium',coins_per_image:29};
const google={...low,sku_id:'banana',model:'google/gemini-3.1-flash-image-preview',size:'native',quality:'default',coins_per_image:46};

test('pixel and K resolution labels sort by actual pixel size',()=>{
 assert.deepEqual(['4K','768','1.5K','auto','2K','1K','0.5K'].sort((a,b)=>imageResolutionPixels(a)-imageResolutionPixels(b)),['auto','0.5K','768','1K','1.5K','2K','4K']);
});
test('all actual provider ratios, including decimal portrait ratios, have a stable menu order',()=>{
 const rows=JSON.parse(readFileSync(new URL('../scripts/fixtures/image-media-specifications.json',import.meta.url),'utf8'));
 const ratios=[...new Set(rows.map(row=>row.aspect_ratio))];assert.equal(ratios.length,21);
 assert.equal(ratios.every(ratio=>STUDIO_RATIOS.includes(ratio)),true);
});
test('studio accepts only real, positive integer catalogue prices',()=>{
  assert.deepEqual(imageStudioRows([low,{...low,coins_per_image:NaN},{...low,coins_per_image:-1},{...low,coins_per_image:0},{...low,coins_per_image:1.5},null]),[low]);
});
test('unknown and native sizes remain automatic, never invented square or 1K specifications',()=>{
  assert.deepEqual(imageDimensions('native'),{ratio:'auto',resolution:'auto'});
  assert.deepEqual(imageDimensions(undefined),{ratio:'auto',resolution:'auto'});
  assert.deepEqual(imageDimensions('1024x1024'),{ratio:'1:1',resolution:'1K',width:1024,height:1024});
  assert.deepEqual(imageDimensions('1536x1024'),{ratio:'3:2',resolution:'1.5K',width:1536,height:1024});
});
test('quality and dimensions map to a real SKU from the same model only',()=>{
  const variants=sameModelVariants([low,medium,google],low);
  assert.equal(chooseImageVariant(variants,low,'quality','medium'),medium);
  assert.equal(chooseImageVariant(variants,low,'quality','high'),undefined);
  assert.equal(chooseImageVariant(variants,low,'size','4096x4096'),undefined);
  assert.equal(variants.some(row=>row===google),false);
  assert.equal(imageProvider(google.model),'Google');assert.equal(imageProvider(low.model),'OpenAI');
});
test('input limits use UTF-8 bytes and the smaller catalogue/server bound',()=>{
  assert.equal(validImagePrompt('a'.repeat(1000),low),true);
  assert.equal(validImagePrompt('a'.repeat(1001),low),false);
  assert.equal(validImagePrompt('茶'.repeat(333),low),true);
  assert.equal(validImagePrompt('茶'.repeat(334),low),false);
  assert.equal(validImagePrompt('   ',low),false);
  assert.equal(validImagePrompt('茶茶',{...low,max_prompt_bytes:5}),false);
  assert.equal(validImagePrompt('a'.repeat(1001),{...low,max_prompt_bytes:5000}),false);
});
test('remembered quality resolves to the exact real SKU while the visible picker stays grouped',()=>{
  const choices=[{key:'wuwei-image/low',modelId:'low',providerId:'wuwei-image',imageModel:'gpt-image-1',category:'images'}];
  const settings={modelPreferences:{user:{providerId:'wuwei-image',modelId:'medium'}}};
  assert.equal(rememberedModelChoice(withImageSkuChoices(choices,[low,medium]),settings,'user').modelId,'medium');
  assert.equal(rememberedModelChoice(withImageSkuChoices(choices,[low]),settings,'user'),undefined);
  assert.equal(choices.length,1);
});
