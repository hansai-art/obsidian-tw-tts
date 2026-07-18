import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	splitIntoSentences,
	sentenceIndexForPrefix,
} from '../src/sentence-splitter';

test('splits Chinese paragraph on full/half-width sentence punctuation', () => {
	assert.deepEqual(
		splitIntoSentences('今天天氣很好。我們去散步吧!你要來嗎?'),
		['今天天氣很好。', '我們去散步吧!', '你要來嗎?'],
	);
});

test('strips heading markers and treats heading as its own sentence', () => {
	assert.deepEqual(
		splitIntoSentences('# 標題\n\n內文一句。'),
		['標題', '內文一句。'],
	);
});

test('strips inline bold, links and inline code', () => {
	assert.deepEqual(
		splitIntoSentences('這是**粗體**和[連結](https://x.com)還有`code`。'),
		['這是粗體和連結還有code。'],
	);
});

test('resolves wikilinks to alias or page name', () => {
	assert.deepEqual(
		splitIntoSentences('看[[某頁面|別名]]和[[另一頁]]。'),
		['看別名和另一頁。'],
	);
});

test('strips list markers, each item is its own chunk', () => {
	assert.deepEqual(
		splitIntoSentences('- 第一項\n- 第二項'),
		['第一項', '第二項'],
	);
});

test('strips task checkbox markers', () => {
	assert.deepEqual(
		splitIntoSentences('- [ ] 待辦一\n- [x] 完成二'),
		['待辦一', '完成二'],
	);
});

test('skips YAML frontmatter', () => {
	assert.deepEqual(
		splitIntoSentences('---\ntitle: X\ntags: [a, b]\n---\n內文。'),
		['內文。'],
	);
});

test('skips fenced code blocks', () => {
	assert.deepEqual(
		splitIntoSentences('前面。\n```js\nconst a = 1;\n```\n後面。'),
		['前面。', '後面。'],
	);
});

test('returns empty array for blank input', () => {
	assert.deepEqual(splitIntoSentences('   \n\n  '), []);
});

test('does not split on decimal points', () => {
	assert.deepEqual(
		splitIntoSentences('圓周率是 3.14 喔。'),
		['圓周率是 3.14 喔。'],
	);
});

test('splits English sentences on period followed by space', () => {
	assert.deepEqual(
		splitIntoSentences('Hello world. This is fine.'),
		['Hello world.', 'This is fine.'],
	);
});

test('keeps closing quote attached to sentence punctuation', () => {
	assert.deepEqual(
		splitIntoSentences('他說「你好。」然後走了。'),
		['他說「你好。」', '然後走了。'],
	);
});

test('strips blockquote markers', () => {
	assert.deepEqual(
		splitIntoSentences('> 引用一句。'),
		['引用一句。'],
	);
});

test('skips horizontal rules and table separators', () => {
	assert.deepEqual(
		splitIntoSentences('前。\n---\n| 欄 |\n|---|\n後。'),
		['前。', '欄', '後。'],
	);
});

test('collapses internal whitespace and trims', () => {
	assert.deepEqual(
		splitIntoSentences('這是   一句話。'),
		['這是 一句話。'],
	);
});

test('sentenceIndexForPrefix returns the sentence the cursor sits in', () => {
	const doc = '第一句。第二句。第三句。';
	// 游標在「第二句」中間 → 前綴含 1 個完整句 + 1 個未完成句 = 2 句 → index 1
	assert.equal(sentenceIndexForPrefix('第一句。第二'), 1);
	// 游標在開頭 → index 0
	assert.equal(sentenceIndexForPrefix(''), 0);
	// 游標在最後 → 最後一句
	assert.equal(sentenceIndexForPrefix(doc), splitIntoSentences(doc).length - 1);
});
