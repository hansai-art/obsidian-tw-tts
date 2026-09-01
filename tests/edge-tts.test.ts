import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	EdgeTtsEngine,
	edgeCliArgs,
	edgePitch,
	edgeRate,
	type EdgeAudio,
	type EdgeSpeechClient,
} from '../src/edge-tts';

// Obsidian 提供 Window timers；Node 單元測試用同一個 timer API 形狀補齊環境。
if (typeof window === 'undefined') {
	Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
}

test('Edge CLI settings use Yunyang and Hz pitch/rate values', () => {
	assert.equal(edgePitch(-7), '-7Hz');
	assert.equal(edgePitch(0), '+0Hz');
	assert.equal(edgePitch(3), '+3Hz');
	assert.equal(edgeRate(1), '+0%');
	assert.equal(edgeRate(1.25), '+25%');
});

test('Edge CLI binds negative pitch to its option so argparse does not treat it as a flag', () => {
	const args = edgeCliArgs('測試', { voice: 'zh-CN-YunyangNeural', rate: 1, pitch: -7 }, '/tmp/out.mp3');
	assert.ok(args.includes('--pitch=-7Hz'));
	assert.ok(args.includes('--rate=+0%'));
	assert.equal(args.includes('-7Hz'), false);
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

test('EdgeTtsEngine honours a planned pause before synthesis of the next sentence', async () => {
	const generated: string[] = [];
	const audios: EdgeAudio[] = [];
	const engine = new EdgeTtsEngine(
		{ synthesize: async (text) => { generated.push(text); return new Blob(['audio']); } },
		() => {
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
	);

	engine.start([
		{ text: '標題', pauseAfterMs: 20 },
		{ text: '正文', pauseAfterMs: 0 },
	]);
	await Promise.resolve();
	await Promise.resolve();
	audios[0].onEnded?.();
	assert.deepEqual(generated, ['標題']);
	await new Promise((resolve) => setTimeout(resolve, 35));
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(generated, ['標題', '正文']);
});

test('EdgeTtsEngine never sends empty Callout markers to the CLI', async () => {
	const generated: string[] = [];
	const engine = new EdgeTtsEngine(
		{ synthesize: async (text) => { generated.push(text); return new Blob(['audio']); } },
		() => ({
			play: async () => undefined,
			pause: () => undefined,
			release: () => undefined,
			onEnded: null,
			onError: null,
		}),
		{ voice: 'zh-CN-YunyangNeural', rate: 1, pitch: -7 },
	);
	engine.start(['>', '#####', '---', '有效內容']);
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(generated, ['有效內容']);
});

test('EdgeTtsEngine stops and reports once when synthesis rejects', async () => {
	const generated: string[] = [];
	const errors: string[] = [];
	const client: EdgeSpeechClient = {
		synthesize: async (text) => {
			generated.push(text);
			throw new Error('network failure');
		},
	};
	const engine = new EdgeTtsEngine(
		client,
		() => { throw new Error('audio must not be created'); },
		{ voice: 'zh-CN-YunyangNeural', rate: 1, pitch: -7 },
		{ onError: (message) => errors.push(message) },
	);

	engine.start(['異常句', '不得繼續']);
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(generated, ['異常句']);
	assert.equal(errors.length, 1);
	assert.equal(engine.isPlaying, false);
});

test('EdgeTtsEngine completes past the final sentence without generating the last sentence', () => {
	const generated: string[] = [];
	let done = 0;
	const engine = new EdgeTtsEngine(
		{ synthesize: async (text) => { generated.push(text); return new Blob(['audio']); } },
		() => { throw new Error('audio must not be created'); },
		{ voice: 'zh-CN-YunyangNeural', rate: 1, pitch: -7 },
		{ onDone: () => done++ },
	);
	engine.start(['第一句', '第二句'], 2);
	assert.deepEqual(generated, []);
	assert.equal(done, 1);
	assert.equal(engine.isPlaying, false);
});
