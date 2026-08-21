import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	EdgeTtsEngine,
	type EdgeAudio,
	type EdgeSpeechClient,
} from '../src/edge-tts';
import { splitIntoSentences } from '../src/sentence-splitter';

async function flushAsyncPlayback(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

test('Callout and Highlightr fixture reaches Edge as clean consecutive sentences', async () => {
	const fixture = [
		'前文。',
		'> [!note] 提醒',
		'> Callout 第一段。',
		'> <mark style="background: #FFC26352;">Vibe Coding</mark>',
		'> <mark style="background: #CACFD9A6;"><font color="#ff0000">巢狀重點</font></mark>',
		'> Callout 最後一段。',
		'後文。',
	].join('\n');
	const sentences = splitIntoSentences(fixture);
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
		{ onSentenceStart: (index) => started.push(index) },
	);

	engine.start(sentences);
	for (let index = 0; index < sentences.length; index++) {
		await flushAsyncPlayback();
		if (index + 1 < sentences.length) audios[index].onEnded?.();
	}

	assert.deepEqual(sentences, [
		'前文。',
		'提醒',
		'Callout 第一段。',
		'Vibe Coding',
		'巢狀重點',
		'Callout 最後一段。',
		'後文。',
	]);
	assert.deepEqual(generated, sentences);
	assert.deepEqual(started, sentences.map((_sentence, index) => index));
	for (const sentence of generated) {
		assert.doesNotMatch(sentence, /\[!|mark|font|style|class|#[0-9a-f]{6,8}/i);
	}
});
