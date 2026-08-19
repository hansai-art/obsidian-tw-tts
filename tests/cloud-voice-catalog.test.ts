import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_VOICES, cloudVoiceOptions } from '../src/cloud-voice-catalog';

test('curated cloud voices put every supported Chinese region before English', () => {
	const firstEnglish = CLOUD_VOICES.findIndex((voice) => voice.language === 'en');
	assert.ok(firstEnglish > 0);
	assert.ok(CLOUD_VOICES.slice(0, firstEnglish).every((voice) => voice.language === 'zh'));
	assert.ok(CLOUD_VOICES.slice(firstEnglish).every((voice) => voice.language === 'en'));
	assert.ok(CLOUD_VOICES.some((voice) => voice.id.startsWith('zh-TW')));
	assert.ok(CLOUD_VOICES.some((voice) => voice.id.startsWith('zh-CN')));
	assert.ok(CLOUD_VOICES.some((voice) => voice.id.startsWith('zh-HK')));
});

test('curated cloud voices exclude dialect and cartoon options', () => {
	const ids = CLOUD_VOICES.map((voice) => voice.id).join(' ');
	assert.doesNotMatch(ids, /liaoning|shaanxi|Xiaoyi|Yunxia/i);
	assert.equal(Object.keys(cloudVoiceOptions()).length, CLOUD_VOICES.length);
});
