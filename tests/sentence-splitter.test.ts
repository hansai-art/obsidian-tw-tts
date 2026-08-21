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

test('strips a callout directive but preserves its custom title and body', () => {
	assert.deepEqual(
		splitIntoSentences('前文。\n> [!note] 提醒\n> Callout 第一段。\n> Callout 第二段。\n後文。'),
		['前文。', '提醒', 'Callout 第一段。', 'Callout 第二段。', '後文。'],
	);
});

test('strips default, folded, custom and nested callout directives', () => {
	assert.deepEqual(
		splitIntoSentences([
			'> [!note]',
			'> 內文。',
			'> [!warning]- 注意',
			'> 摺疊內容。',
			'> > [!custom-question-type]+ 巢狀標題',
			'> > 巢狀內容。',
		].join('\n')),
		['內文。', '注意', '摺疊內容。', '巢狀標題', '巢狀內容。'],
	);
});

test('silences non-blockquote callout examples instead of speaking their type', () => {
	assert.deepEqual(
		splitIntoSentences('[!note] 是語法示例。'),
		['是語法示例。'],
	);
	assert.deepEqual(
		splitIntoSentences('自動略過 `[!note]`、摺疊符號等格式，只朗讀自訂標題與內文。'),
		['自動略過、摺疊符號等格式，只朗讀自訂標題與內文。'],
	);
});

test('keeps Highlightr text and removes mark syntax', () => {
	assert.deepEqual(
		splitIntoSentences('<mark style="background: #FFC26352;">Vibe Coding</mark>'),
		['Vibe Coding'],
	);
});

test('keeps text inside nested mark and font tags', () => {
	assert.deepEqual(
		splitIntoSentences('<mark style="background: #CACFD9A6;"><font color="#ff0000">Vibe Coding</font></mark>'),
		['Vibe Coding'],
	);
});

test('handles Highlightr class markup, casing, quoted greater-than and multiple spans', () => {
	assert.deepEqual(
		splitIntoSentences('先讀 <MARK class="hltr-yellow" data-label="1 > 0">重點一</MARK>，再讀 <mark style=\'background:red\'>重點二</mark>。'),
		['先讀 重點一，再讀 重點二。'],
	);
});

test('preserves comparisons, escaped HTML, inline code and unrelated tags', () => {
	assert.deepEqual(splitIntoSentences('2 < 3，而且 5 > 4。'), ['2 < 3，而且 5 > 4。']);
	assert.deepEqual(splitIntoSentences('顯示 &lt;mark&gt;。'), ['顯示 &lt;mark&gt;。']);
	assert.deepEqual(splitIntoSentences('使用 `<mark>` 標籤。'), ['使用 <mark> 標籤。']);
	assert.deepEqual(splitIntoSentences('使用 ``<mark data-code="1">`` 標籤。'), ['使用 <mark data-code="1"> 標籤。']);
	assert.deepEqual(splitIntoSentences('保留 \uE000TWTTSCODE0\uE001 字元。'), ['保留 \uE000TWTTSCODE0\uE001 字元。']);
	assert.deepEqual(splitIntoSentences('保留 <Component>名稱</Component>。'), ['保留 <Component>名稱</Component>。']);
});

test('preserves malformed presentation tags instead of swallowing trailing text', () => {
	assert.deepEqual(
		splitIntoSentences('前文 <mark style="background:red"未閉合，後文仍在。'),
		['前文 <mark style="background:red"未閉合，後文仍在。'],
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

test('sentenceIndexForPrefix stays aligned across callout headers and highlighted text', () => {
	assert.equal(sentenceIndexForPrefix('前文。\n> [!note] 提醒\n> 內容'), 2);
	assert.equal(
		sentenceIndexForPrefix('前文。\n> [!note]\n> <mark style="background:red">重點</mark>。\n後'),
		2,
	);
	assert.equal(sentenceIndexForPrefix('前文。\n> [!no'), 0);
	assert.equal(sentenceIndexForPrefix('前文。\n> [!note]\n> <mark>第一句。</ma'), 1);
});
