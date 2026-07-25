import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseRules,
	applyPronunciation,
	parseSilentSymbols,
} from '../src/pronunciation';

test('parseRules reads "from=to" lines', () => {
	assert.deepEqual(parseRules('iPAS=愛帕斯\nGPT=G P T'), [
		['iPAS', '愛帕斯'],
		['GPT', 'G P T'],
	]);
});

test('parseRules skips blank lines and # comments', () => {
	assert.deepEqual(parseRules('# 註解\n\niPAS=愛帕斯\n  \n'), [['iPAS', '愛帕斯']]);
});

test('parseRules splits on the first = so the reading may contain =', () => {
	assert.deepEqual(parseRules('a=b=c'), [['a', 'b=c']]);
});

test('parseRules ignores lines with no = or an empty left side', () => {
	assert.deepEqual(parseRules('novalue\n=orphan\nok=好'), [['ok', '好']]);
});

test('parseRules allows an empty reading (delete the term)', () => {
	assert.deepEqual(parseRules('™='), [['™', '']]);
});

test('applyPronunciation replaces all occurrences', () => {
	const rules = parseRules('臺=台');
	assert.equal(applyPronunciation('臺北到臺南', rules), '台北到台南');
});

test('applyPronunciation is case-sensitive', () => {
	const rules = parseRules('GPT=G P T');
	assert.equal(applyPronunciation('用 GPT 但不動 gpt', rules), '用 G P T 但不動 gpt');
});

test('applyPronunciation treats the term literally (no regex surprises)', () => {
	const rules = parseRules('C++=C plus plus');
	assert.equal(applyPronunciation('我愛 C++', rules), '我愛 C plus plus');
});

test('applyPronunciation with no rules returns the text unchanged', () => {
	assert.equal(applyPronunciation('原文', []), '原文');
});

// ── 不朗讀的符號 ──

test('parseSilentSymbols splits on whitespace into delete rules', () => {
	assert.deepEqual(parseSilentSymbols('○ ● ※'), [['○', ''], ['●', ''], ['※', '']]);
});

test('parseSilentSymbols treats full-width spaces and newlines as separators', () => {
	assert.deepEqual(parseSilentSymbols('○　●\n※'), [['○', ''], ['●', ''], ['※', '']]);
});

test('parseSilentSymbols de-duplicates and ignores padding', () => {
	assert.deepEqual(parseSilentSymbols('  ○   ○ ●  '), [['○', ''], ['●', '']]);
});

test('parseSilentSymbols accepts multi-character tokens', () => {
	assert.deepEqual(parseSilentSymbols('-- ->'), [['--', ''], ['->', '']]);
});

test('parseSilentSymbols on empty input returns no rules', () => {
	assert.deepEqual(parseSilentSymbols(''), []);
	assert.deepEqual(parseSilentSymbols('   '), []);
});

test('silencing a symbol removes it from the spoken text', () => {
	const silent = parseSilentSymbols('○');
	assert.equal(applyPronunciation('○ 第一點', silent), ' 第一點');
});

test('the dictionary runs first, so an explicit reading beats the silent list', () => {
	// 使用者特地寫了「○=圈」代表他要唸出來,明確指定應該贏過概括性靜音。
	const dict = parseRules('○=圈');
	const silent = parseSilentSymbols('○');
	const spoken = applyPronunciation(applyPronunciation('○ 甲', dict), silent);
	assert.equal(spoken, '圈 甲');
});
