import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceGender } from '../src/voice-gender';

const v = (name: string) => ({ name }) as SpeechSynthesisVoice;

test('recognizes common female Chinese voices', () => {
	assert.equal(voiceGender(v('Meijia')), 'female');
	assert.equal(voiceGender(v('美佳')), 'female');
	assert.equal(voiceGender(v('Tingting')), 'female');
	assert.equal(voiceGender(v('Sinji')), 'female');
	assert.equal(voiceGender(v('Grandma (中文（台灣）)')), 'female');
	assert.equal(voiceGender(v('Microsoft HsiaoChen Online (Natural)')), 'female');
});

test('recognizes common male Chinese voices', () => {
	assert.equal(voiceGender(v('Grandpa (中文（台灣）)')), 'male');
	assert.equal(voiceGender(v('YunJhe')), 'male');
	assert.equal(voiceGender(v('Reed')), 'male');
	assert.equal(voiceGender(v('Rocko')), 'male');
	assert.equal(voiceGender(v('Microsoft Zhiwei')), 'male');
});

test('returns unknown for unrecognized voices', () => {
	assert.equal(voiceGender(v('Eddy')), 'unknown');
	assert.equal(voiceGender(v('SomeRandomVoice')), 'unknown');
	assert.equal(voiceGender(v('')), 'unknown');
});

test('is case-insensitive', () => {
	assert.equal(voiceGender(v('GRANDPA')), 'male');
	assert.equal(voiceGender(v('meijia')), 'female');
});
