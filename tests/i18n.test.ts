import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale, STRINGS } from '../src/i18n';

test('switches core interface strings between English and Traditional Chinese', () => {
	setLocale('en');
	assert.equal(STRINGS.cmdReadNote, 'Read current note');
	assert.equal(STRINGS.settingKeyPointsOnly, 'Read key points only');
	assert.equal(STRINGS.ruleConfigName, 'Reading rule configuration');
	assert.equal(STRINGS.resumePosition(3, 10), 'You stopped at sentence 3 of 10.');
	assert.equal(STRINGS.previewNoVoice, 'Select an available voice first.');
	setLocale('zh-TW');
	assert.equal(STRINGS.cmdReadNote, '朗讀目前筆記');
});
