import assert from 'node:assert/strict';
import { selectSceneReferences } from '../packages/runtime-node/scene-reference-routing.mjs';

const context={
  referenceUris:['file:///owl.png','file:///luna.png','file:///style.png'],
  referenceCatalog:[
    {kind:'character',key:'old-owl',name:'Old Owl',role:'narrator',continuityKey:'owl-v1',uri:'file:///owl.png'},
    {kind:'character',key:'luna',name:'Luna',role:'companion',continuityKey:'luna-v1',uri:'file:///luna.png'},
    {kind:'style',key:'moonlit-style',name:'Moonlit Storybook',continuityKey:'style-v1',uri:'file:///style.png'},
  ],
};

const luna=selectSceneReferences(context,'Luna steps into the cave and lifts the silver key.',[],3);
assert.deepEqual(luna.uris,['file:///luna.png','file:///style.png']);
assert.deepEqual(luna.characterNames,['Luna']);
assert.ok(!luna.uris.includes('file:///owl.png'));

const ensemble=selectSceneReferences(context,'Old Owl and Luna open the moon door together.',[],3);
assert.deepEqual(ensemble.uris,['file:///owl.png','file:///luna.png','file:///style.png']);
assert.deepEqual(new Set(ensemble.characterNames),new Set(['Old Owl','Luna']));

const unnamed=selectSceneReferences(context,'A quiet establishing shot of the forest at midnight.',[],3);
assert.deepEqual(unnamed.uris,['file:///owl.png','file:///style.png']);
assert.equal(unnamed.characterNames[0],'Old Owl');

console.log('✓ scene reference routing selects only characters named in the visual prompt');
console.log('✓ ensemble scenes preserve two character anchors plus the canonical style anchor');
console.log('✓ unnamed recurring scenes fall back to the lead/narrator identity and style');
