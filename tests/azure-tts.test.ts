import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AzureSpeechClient, azureEndpoint, azureSsml, escapeXml } from '../src/azure-tts';

test('Azure endpoint accepts a region but rejects an unsafe host', () => {
	assert.equal(azureEndpoint('eastasia'), 'https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1');
	assert.throws(() => azureEndpoint('eastasia.example.com'));
});

test('Azure SSML escapes note text and carries voice, rate and pitch', () => {
	const ssml = azureSsml('A < B & C', {
		key: 'not-used-in-ssml', region: 'eastasia', voice: 'zh-CN-YunyangNeural', rate: 1.2, pitch: -7,
	});
	assert.match(ssml, /voice name="zh-CN-YunyangNeural"/);
	assert.match(ssml, /rate="\+20%" pitch="-7Hz"/);
	assert.match(ssml, /A &lt; B &amp; C/);
	assert.equal(escapeXml(`'"`), '&apos;&quot;');
});

test('Azure client sends official headers without exposing the key in SSML', async () => {
	let captured: { headers?: Record<string, string>; body?: string; url?: string } = {};
	const client = new AzureSpeechClient(
		{ key: 'secret-key', region: 'eastasia' },
		async (request) => {
			captured = request;
			return { status: 200, headers: {}, arrayBuffer: new Uint8Array([1, 2, 3]).buffer, json: null, text: '' };
		},
	);
	const audio = await client.synthesize('測試', { voice: 'zh-TW-HsiaoYuNeural', rate: 1, pitch: 0 });
	assert.equal(audio.size, 3);
	assert.equal(captured.headers?.['Ocp-Apim-Subscription-Key'], 'secret-key');
	assert.match(captured.url ?? '', /^https:\/\/eastasia\.tts\.speech\.microsoft\.com/);
	assert.doesNotMatch(captured.body ?? '', /secret-key/);
});
