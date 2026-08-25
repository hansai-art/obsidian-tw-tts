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
	assert.equal(sentenceIndexForPrefix('前文。\n> [!no'), 1);
	assert.equal(sentenceIndexForPrefix('前文。\n> [!note]\n> <mark>第一句。</ma'), 1);
});

test('sentenceIndexForPrefix stays aligned after v0.14 metadata filters', () => {
	assert.equal(sentenceIndexForPrefix('第一句。\n第二句。 ^473'), 2);
	assert.equal(sentenceIndexForPrefix('第一句。\n%% 尚未完成'), 1);
	assert.equal(sentenceIndexForPrefix('第一句。\n第二句[^1]'), 2);
	assert.equal(sentenceIndexForPrefix('第一句。\n![[Embed]]'), 1);
	assert.equal(sentenceIndexForPrefix('第一句。\n![[Embed]]\n'), 1);
	assert.equal(sentenceIndexForPrefix('第一句。\n![[Embed]]\n第三'), 1);
	assert.equal(sentenceIndexForPrefix('第一句。\nhttps://example.com'), 1);
	assert.equal(sentenceIndexForPrefix('第一句。\n$E=mc^2$'), 1);
	assert.equal(sentenceIndexForPrefix('第一句。\n$E=mc^2$', { readMath: true }), 1);
});

test('sentenceIndexForPrefix does not replay a sentence before same-line skipped metadata', () => {
	for (const prefix of [
		'第一句。 第二句。 ^473',
		'第一句。 第二句。 %% hidden %%',
		'第一句。 第二句。 <!-- hidden -->',
		'第一句。 第二句[^note]',
		'第一句。 第二句。 ![[Embed]]',
		'第一句。 第二句。 https://example.com',
		'第一句。 第二句。 $E=mc^2$',
		'第一句。 第二句。 [!note]',
	]) {
		assert.equal(sentenceIndexForPrefix(prefix), 2, prefix);
	}
	assert.equal(sentenceIndexForPrefix('第一句。 公式 $E=mc^2$', { readMath: true }), 1);
	assert.equal(sentenceIndexForPrefix('第一句。 網址 https://example.com', { readBareUrls: true }), 1);
	assert.equal(sentenceIndexForPrefix('第一句。 %% hidden %% 後文'), 1);
	assert.equal(sentenceIndexForPrefix('第一句。 <!-- hidden --> 後文'), 1);
	assert.equal(sentenceIndexForPrefix('第一句。 ![[尚未完成'), 1);
	assert.equal(sentenceIndexForPrefix('第一句。 [^尚未完成'), 1);
	assert.equal(sentenceIndexForPrefix('第一句。 公式 $尚未完成'), 1);
	assert.equal(sentenceIndexForPrefix('第一句。 價格 $100'), 1);
});

test('sentenceIndexForPrefix points after skipped block metadata instead of replaying the prior sentence', () => {
	for (const prefix of [
		'第一句。\n<!-- 尚未完成',
		'第一句。\n```ts\nconst hidden = true;',
		'第一句。\n$$\nx = 1',
		'第一句。\n[^1]: 隱藏來源',
		'第一句。\n    註腳續行',
		'第一句。\n',
	]) {
		assert.equal(sentenceIndexForPrefix(prefix), 1, prefix);
	}
});

test('sentenceIndexForPrefix suppresses unfinished frontmatter metadata', () => {
	assert.equal(sentenceIndexForPrefix('---'), 0);
	assert.equal(sentenceIndexForPrefix('---\ntitle: 尚未完成'), 0);
	assert.deepEqual(splitIntoSentences('---\ntitle: 尚未完成'), ['title: 尚未完成']);
});

test('v0.14 smoke fixture produces the specified default reader sentences', () => {
	const fixture = [
		'---', 'tags: [test]', '---', '# 測試', '這是一段正文。 ^473eef',
		'%% 這不應該朗讀 %%', '> [!note] 提醒', '> 這是 Callout。',
		'這是 [[AI|人工智慧]]。', '![[Other Note#^abcdef]]',
		'來源：https://example.com/test?id=1', '公式 $E=mc^2$ 很有名。',
		'正文有註腳[^1]。', '[^1]: 不應該朗讀。', '#AI #研究',
	].join('\n');
	assert.deepEqual(splitIntoSentences(fixture), [
		'測試', '這是一段正文。', '提醒', '這是 Callout。', '這是人工智慧。',
		'來源：', '公式 很有名。', '正文有註腳。',
	]);
});

test('conservatively preserves unmatched comments and fences without punctuation drift', () => {
	assert.deepEqual(splitIntoSentences('前句。\n<!-- unclosed\n後句。'), ['前句。', '<!-- unclosed', '後句。']);
	assert.deepEqual(splitIntoSentences('前句。\n```ts\nconst x = 1;\n後句。'), ['前句。', '```ts', 'const x = 1;', '後句。']);
});
