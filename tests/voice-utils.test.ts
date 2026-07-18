import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVoice, sortVoicesChineseFirst } from '../src/voice-utils';

function v(name: string, lang: string): SpeechSynthesisVoice {
	return { name, lang, default: false, localService: true, voiceURI: name } as SpeechSynthesisVoice;
}

test('sortVoicesChineseFirst orders zh-TW, then other zh, then rest', () => {
	const voices = [v('Ava', 'en-US'), v('Xiaoxiao', 'zh-CN'), v('HsiaoChen', 'zh-TW')];
	const sorted = sortVoicesChineseFirst(voices).map((x) => x.name);
	assert.deepEqual(sorted, ['HsiaoChen', 'Xiaoxiao', 'Ava']);
});

test('pickVoice returns the preferred voice by name when present', () => {
	const voices = [v('HsiaoChen', 'zh-TW'), v('YunJhe', 'zh-TW')];
	assert.equal(pickVoice(voices, 'YunJhe')?.name, 'YunJhe');
});

test('pickVoice honours a non-Chinese preferred voice if the user chose it', () => {
	const voices = [v('Ava', 'en-US'), v('HsiaoChen', 'zh-TW')];
	assert.equal(pickVoice(voices, 'Ava')?.name, 'Ava');
});

test('pickVoice defaults to zh-TW over zh-CN when no preference', () => {
	const voices = [v('Xiaoxiao', 'zh-CN'), v('HsiaoChen', 'zh-TW')];
	assert.equal(pickVoice(voices)?.name, 'HsiaoChen');
});

test('pickVoice falls back to any Chinese voice when no zh-TW', () => {
	const voices = [v('Ava', 'en-US'), v('Xiaoxiao', 'zh-CN')];
	assert.equal(pickVoice(voices)?.name, 'Xiaoxiao');
});

test('pickVoice returns null when there is no Chinese voice and no preference', () => {
	const voices = [v('Ava', 'en-US'), v('Daniel', 'en-GB')];
	assert.equal(pickVoice(voices), null);
});

test('pickVoice returns null for an empty voice list', () => {
	assert.equal(pickVoice([]), null);
});

test('pickVoice with male preference picks a male Chinese voice', () => {
	const voices = [v('Meijia', 'zh-TW'), v('YunJhe', 'zh-TW')];
	assert.equal(pickVoice(voices, '', 'male')?.name, 'YunJhe');
});

test('pickVoice with female preference picks a female Chinese voice', () => {
	const voices = [v('YunJhe', 'zh-TW'), v('Meijia', 'zh-TW')];
	assert.equal(pickVoice(voices, '', 'female')?.name, 'Meijia');
});

test('pickVoice falls back to first Chinese voice when no gender match', () => {
	const voices = [v('Meijia', 'zh-TW'), v('Tingting', 'zh-CN')];
	// both female; asking for male should fall back to the first zh voice
	assert.equal(pickVoice(voices, '', 'male')?.name, 'Meijia');
});

test('pickVoice explicit name still wins over gender preference', () => {
	const voices = [v('Meijia', 'zh-TW'), v('YunJhe', 'zh-TW')];
	assert.equal(pickVoice(voices, 'Meijia', 'male')?.name, 'Meijia');
});
