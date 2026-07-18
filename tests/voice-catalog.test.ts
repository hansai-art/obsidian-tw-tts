import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	curatedVoices,
	pickVoice,
	qualityTier,
	regionLabel,
	regionOrder,
} from '../src/voice-catalog';

function v(name: string, lang: string): SpeechSynthesisVoice {
	return { name, lang, default: false, localService: true, voiceURI: name } as SpeechSynthesisVoice;
}

test('regionOrder puts Taiwan first, then mainland, then HK', () => {
	assert.equal(regionOrder('zh-TW'), 0);
	assert.equal(regionOrder('zh_CN'), 1);
	assert.equal(regionOrder('zh-HK'), 2);
	assert.equal(regionOrder('en-US'), 9);
});

test('regionLabel maps to Traditional-Chinese region names', () => {
	assert.equal(regionLabel('zh-TW'), '台灣');
	assert.equal(regionLabel('zh-CN'), '大陸');
	assert.equal(regionLabel('zh-HK'), '香港');
});

test('qualityTier: neural/Meijia best, Google/Microsoft next, character last', () => {
	assert.equal(qualityTier('Microsoft HsiaoChen Online (Natural)'), 0);
	assert.equal(qualityTier('Meijia'), 0);
	assert.equal(qualityTier('美佳'), 0);
	assert.equal(qualityTier('Google 國語（臺灣）'), 1);
	assert.equal(qualityTier('Microsoft Hanhan Desktop'), 1);
	assert.equal(qualityTier('Grandpa'), 3);
	assert.equal(qualityTier('SomeStandardVoice'), 2);
});

test('curatedVoices puts the best voice first (Taiwan + quality)', () => {
	const voices = [
		v('Grandpa', 'zh-TW'),
		v('Tingting', 'zh-CN'),
		v('Meijia', 'zh-TW'),
	];
	assert.equal(curatedVoices(voices)[0].name, 'Meijia');
});

test('curatedVoices ranks a zh-TW voice above a zh-CN neural (Taiwan-first)', () => {
	const voices = [
		v('Microsoft Xiaoxiao Online (Natural)', 'zh-CN'),
		v('Meijia', 'zh-TW'),
	];
	assert.equal(curatedVoices(voices)[0].name, 'Meijia');
});

test('curatedVoices dedupes the same name across regions, keeping Taiwan', () => {
	const voices = [v('Eddy', 'zh-CN'), v('Eddy', 'zh-TW'), v('Meijia', 'zh-TW')];
	const names = curatedVoices(voices).map((x) => x.lang);
	const eddy = curatedVoices(voices).filter((x) => x.name === 'Eddy');
	assert.equal(eddy.length, 1);
	assert.equal(eddy[0].lang, 'zh-TW');
	assert.ok(names.length >= 1);
});

test('curatedVoices keeps all good voices but caps character voices at 3', () => {
	const voices = [
		v('Meijia', 'zh-TW'),
		v('Eddy', 'zh-TW'),
		v('Flo', 'zh-TW'),
		v('Grandma', 'zh-TW'),
		v('Grandpa', 'zh-TW'),
		v('Reed', 'zh-TW'),
		v('Rocko', 'zh-TW'),
	];
	const result = curatedVoices(voices);
	const characters = result.filter((x) => qualityTier(x.name) === 3);
	assert.equal(characters.length, 3);
	// 好語音(美佳)一定保留且在最前面
	assert.equal(result[0].name, 'Meijia');
});

test('curatedVoices excludes non-Chinese voices', () => {
	const voices = [v('Ava', 'en-US'), v('Meijia', 'zh-TW')];
	const result = curatedVoices(voices);
	assert.equal(result.length, 1);
	assert.equal(result[0].name, 'Meijia');
});

test('pickVoice returns the best curated voice when no preference', () => {
	const voices = [v('Grandpa', 'zh-TW'), v('Meijia', 'zh-TW')];
	assert.equal(pickVoice(voices)?.name, 'Meijia');
});

test('pickVoice honours an explicit voice name, even a non-Chinese one', () => {
	const voices = [v('Ava', 'en-US'), v('Meijia', 'zh-TW')];
	assert.equal(pickVoice(voices, 'Ava')?.name, 'Ava');
});

test('pickVoice returns null when there is no Chinese voice and no preference', () => {
	assert.equal(pickVoice([v('Ava', 'en-US')]), null);
});

test('pickVoice returns null for an empty list', () => {
	assert.equal(pickVoice([]), null);
});
