import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	EdgeTtsEngine,
	edgePitch,
	edgeRate,
	type EdgeAudio,
	type EdgeSpeechClient,
} from '../src/edge-tts';

test('Edge CLI settings use Yunyang and Hz pitch/rate values', () => {
	assert.equal(edgePitch(-7), '-7Hz');
	assert.equal(edgePitch(0), '+0Hz');
	assert.equal(edgePitch(3), '+3Hz');
	assert.equal(edgeRate(1), '+0%');
	assert.equal(edgeRate(1.25), '+25%');
});

test('EdgeTtsEngine generates and plays one sentence at a time', async () => {
	const generated: string[] = [];
	const started: number[] = [];
	const audios: EdgeAudio[] = [];
	const client: EdgeSpeechClient = {
		synthesize: async (text) => {
			generated.push(text);
			return new Blob(['audio']);
		},
	};
	const engine = new EdgeTtsEngine(
		client,
		(blob) => {
			assert.ok(blob.size > 0);
			const audio: EdgeAudio = {
				play: async () => undefined,
				pause: () => undefined,
				release: () => undefined,
				onEnded: null,
				onError: null,
			};
			audios.push(audio);
			return audio;
		},
		{ voice: 'zh-CN-YunyangNeural', rate: 1, pitch: -7 },
		{ onSentenceStart: (index) => started.push(index) },
	);

	engine.start(['第一句', '第二句']);
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(generated, ['第一句']);
	assert.deepEqual(started, [0]);
	audios[0].onEnded?.();
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(generated, ['第一句', '第二句']);
	assert.deepEqual(started, [0, 1]);
});
