import assert from 'node:assert/strict';
import {
  MediaIntelligenceEngine,
  ProfileRegistry,
  compareVideoDNA,
  createUniversalProductionGraph,
  parseNaturalLanguageEdit,
} from '../packages/production/dist/index.js';

const graph = createUniversalProductionGraph(['SOURCED_NARRATIVE', 'GENERATIVE_IP_SERIES']);
assert.equal(graph.nodes[0].status, 'READY');
assert.equal(graph.nodes.at(-1).kind, 'Analytics');
assert.equal(graph.nodes[2].dependsOn[0], 'concept-2');

const registry = new ProfileRegistry('characterId');
const moss = { characterId: 'MOSS_TEST', name: 'Moss', scope: 'SERIES', speciesOrType: 'red panda', description: 'test fixture', canonicalImages: [] };
registry.upsert(moss);
assert.equal(registry.get('MOSS_TEST')?.name, 'Moss');
assert.equal(registry.list().length, 1);

const media = new MediaIntelligenceEngine();
media.registerEntity({ id: 'ENTITY_COROLLA', canonicalName: 'Toyota Corolla', type: 'VEHICLE', brand: 'Toyota', model: 'Corolla' });
media.registerSegment({ id: 'asset-corolla', segmentId: 'seg-corolla', kind: 'PUBLISHABLE_ASSET', uri: 'file:///corolla.mp4', provider: 'official', sourceUrl: 'https://example.com/corolla', title: 'Toyota Corolla official driving footage', rights: 'CLEARED', license: 'official-permission', entities: ['Toyota Corolla'], startSec: 0, endSec: 5, description: 'Toyota Corolla driving in Spain', locations: ['Spain'], qualityScore: 95, semanticTerms: ['Toyota', 'Corolla', 'driving', 'Spain'] });
media.registerSegment({ id: 'asset-road', segmentId: 'seg-road', kind: 'PUBLISHABLE_ASSET', uri: 'file:///road.mp4', provider: 'stock', sourceUrl: 'https://example.com/road', title: 'Generic road', rights: 'CLEARED', license: 'stock', entities: [], startSec: 0, endSec: 5, description: 'A car drives on a road', qualityScore: 80, semanticTerms: ['road', 'car', 'driving'] });
const beats = [{ beatId: 'beat-1', text: 'The Toyota Corolla is one of Spain\'s most visible cars.', startSec: 0, endSec: 5, entityIds: ['ENTITY_COROLLA'], requiredVisual: 'Toyota Corolla driving in Spain', critical: true }];
const availability = media.buildAvailability('radar-corolla', beats);
assert.ok(['GOOD', 'EXCELLENT'].includes(availability.overall));
const coverage = media.buildCoverage(beats);
assert.equal(coverage.exactVisualCoverageRatio, 1);
assert.equal(coverage.genericBrollRatio, 0);
assert.deepEqual(media.createResourcePack('pack-1', beats).rights[0].rights, 'CLEARED');

const patch = parseNaturalLanguageEdit('Replace the generic footage at 1:12 with actual Toyota Corolla footage.');
assert.equal(patch.operation, 'REPLACE_ASSET');
assert.equal(patch.targetStartSec, 72);

const comparison = compareVideoDNA([
  { sourceId: 'outlier', role: 'OUTLIER', dna: { schema: 'VIDEO_DNA_V1', sourceId: 'outlier', metadata: {}, hook: { firstValueSec: 1 }, narration: {}, editing: { visualChangeRate: 3 }, visualRhythm: { exactEntityCoverage: 0.9 }, provenance: { method: 'fixture', collectedAt: new Date().toISOString() } } },
  { sourceId: 'baseline', role: 'BASELINE', dna: { schema: 'VIDEO_DNA_V1', sourceId: 'baseline', metadata: {}, hook: { firstValueSec: 6 }, narration: {}, editing: { visualChangeRate: 1 }, visualRhythm: { exactEntityCoverage: 0.4 }, provenance: { method: 'fixture', collectedAt: new Date().toISOString() } } },
]);
assert.ok(comparison.differentiators.length >= 2);

console.log('✓ universal graph, generic registries, media coverage, edit patches and VideoDNA pass');
