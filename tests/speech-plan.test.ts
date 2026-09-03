import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSpokenSentences } from '../src/speech-plan';

test('builds one provider-independent spoken plan without changing display sentences', () => {
	const display = [
		{ text: 'GPT', pauseAfterMs: 100 },
		{ text: '○', pauseAfterMs: 0 },
	];
	const spoken = prepareSpokenSentences(display, (text) => text === 'GPT' ? 'G P T' : '');
	assert.deepEqual(spoken, [
		{ text: 'G P T', pauseAfterMs: 100 },
		{ text: '', pauseAfterMs: 0 },
	]);
	assert.equal(display[0].text, 'GPT');
});
