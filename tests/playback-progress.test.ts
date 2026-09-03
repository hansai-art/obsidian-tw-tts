import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	estimatedPlanProgress,
	estimatedSentenceSeconds,
	progressPercent,
	resumableIndex,
	sanitizeBookmarks,
	seekSentenceIndex,
	speechPlanFingerprint,
} from '../src/playback-progress';

test('sanitizes persisted bookmarks and rejects stale shapes', () => {
	assert.deepEqual(sanitizeBookmarks({
		'a.md': { sentenceIndex: 2, total: 5, fileMtime: 10, savedAt: 20 },
		'b.md': { sentenceIndex: 5, total: 5, fileMtime: 10, savedAt: 20 },
		'c.md': { sentenceIndex: '2', total: 5, fileMtime: 10, savedAt: 20 },
	}), { 'a.md': { sentenceIndex: 2, total: 5, fileMtime: 10, savedAt: 20 } });
});

test('resumes only an unchanged incomplete note and matching speech plan', () => {
	const mark = { sentenceIndex: 2, total: 5, fileMtime: 10, savedAt: 20, planFingerprint: 'abc' };
	assert.equal(resumableIndex(mark, 5, 10, 'abc'), 2);
	assert.equal(resumableIndex(mark, 5, 10, 'different'), null);
	assert.equal(resumableIndex(mark, 6, 10), null);
	assert.equal(resumableIndex(mark, 5, 11), null);
});

test('speech plan fingerprint changes with text or timing', () => {
	const base = speechPlanFingerprint([{ text: '第一句', pauseAfterMs: 0 }]);
	assert.notEqual(base, speechPlanFingerprint([{ text: '第二句', pauseAfterMs: 0 }]));
	assert.notEqual(base, speechPlanFingerprint([{ text: '第一句', pauseAfterMs: 100 }]));
});

test('reports progress and seeks by estimated time at sentence boundaries', () => {
	assert.equal(progressPercent(0, 4), 25);
	assert.equal(progressPercent(3, 4), 100);
	assert.equal(estimatedSentenceSeconds('一二三四五', 1), 1);
	const sentences = [{ text: '一'.repeat(25) }, { text: '二'.repeat(25) }, { text: '三'.repeat(25) }, { text: '四'.repeat(25) }];
	assert.equal(seekSentenceIndex(sentences, 0, 10, 1), 2);
	assert.equal(seekSentenceIndex(sentences, 3, -10, 1), 1);
});

test('media progress uses estimated seconds instead of sentence indexes', () => {
	assert.deepEqual(estimatedPlanProgress([
		{ text: '12345', pauseAfterMs: 1000 },
		{ text: '1234567890', pauseAfterMs: 0 },
	], 1, 1), { duration: 4, position: 2 });
});
