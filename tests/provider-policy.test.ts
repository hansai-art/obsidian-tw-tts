import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	isSupportedSystemVoiceLanguage,
	previewLanguage,
	shouldUseEdgeProvider,
} from '../src/provider-policy';

test('system voice policy exposes only Chinese and English', () => {
	assert.equal(isSupportedSystemVoiceLanguage('zh-TW'), true);
	assert.equal(isSupportedSystemVoiceLanguage('zh-CN'), true);
	assert.equal(isSupportedSystemVoiceLanguage('en-US'), true);
	assert.equal(isSupportedSystemVoiceLanguage('ja-JP'), false);
	assert.equal(isSupportedSystemVoiceLanguage('fr-FR'), false);
});

test('Edge provider is available only for a desktop Edge selection', () => {
	assert.equal(shouldUseEdgeProvider('edge', true), true);
	assert.equal(shouldUseEdgeProvider('edge', false), false);
	assert.equal(shouldUseEdgeProvider('local', true), false);
});

test('preview language follows the selected voice language', () => {
	assert.equal(previewLanguage('en-GB'), 'en');
	assert.equal(previewLanguage('en_US'), 'en');
	assert.equal(previewLanguage('zh-TW'), 'zh');
	assert.equal(previewLanguage(''), 'zh');
});
