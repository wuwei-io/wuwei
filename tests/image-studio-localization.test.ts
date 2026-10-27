import test from 'node:test';
import assert from 'node:assert/strict';
import { STUDIO_MODELS } from '../src/imagegen/studio-models.js';
import { languagePacks } from '../src/localization/registry.generated.js';

test('every image model provider and feature has real copy in every shipped language', () => {
  const keys = new Set(STUDIO_MODELS.flatMap(model => ['studio.gallery.brand.' + model.brand, 'studio.gallery.trait.' + model.description]));
  for (const [language, pack] of Object.entries(languagePacks)) for (const key of keys) {
    const message = pack.messages[key];
    assert.equal(typeof message, 'string', language + ': missing ' + key);
    assert.ok(message.trim() && !message.includes('studio.gallery.'), language + ': internal key leaked into ' + key);
  }
});
