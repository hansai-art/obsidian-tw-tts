import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	DEFAULT_MARKDOWN_READER_OPTIONS,
	parseReadableBlocks,
} from '../src/markdown-reader';

const texts = (markdown: string, options = {}) =>
	parseReadableBlocks(markdown, options).map((block) => block.text);

test('exports conservative parser defaults', () => {
	assert.deepEqual(DEFAULT_MARKDOWN_READER_OPTIONS, {
		readStandaloneTags: false,
		readBareUrls: false,
		readMath: false,
	});
});

test('classifies headings, paragraphs, lists, quotes and callouts with source lines', () => {
	assert.deepEqual(parseReadableBlocks('# 標題\n正文\n- 項目\n> 引言\n> [!note] 提醒\n> 內容'), [
		{ text: '標題', kind: 'heading', sourceLine: 0, headingLevel: 1 },
		{ text: '正文', kind: 'paragraph', sourceLine: 1 },
		{ text: '項目', kind: 'list', sourceLine: 2 },
		{ text: '引言', kind: 'quote', sourceLine: 3 },
		{ text: '提醒', kind: 'callout', sourceLine: 4 },
		{ text: '內容', kind: 'quote', sourceLine: 5 },
	]);
});

test('skips only complete frontmatter at the start and keeps later separators', () => {
	assert.deepEqual(texts('---\ntitle: X\n---\n正文'), ['正文']);
	assert.deepEqual(texts('正文\n---\n內容\n---'), ['正文', '內容']);
	assert.deepEqual(texts('---\n未閉合正文'), ['未閉合正文']);
});

test('supports variable backtick and tilde fences with matching longer closers', () => {
	assert.deepEqual(texts('前\n````js\n```\n仍是 code\n`````\n後'), ['前', '後']);
	assert.deepEqual(texts('前\n~~~~\n內容\n~~~~~\n後'), ['前', '後']);
	assert.deepEqual(texts('前\n```ts\nconst x = 1;\n後'), ['前', '```ts', 'const x = 1;', '後']);
});

test('removes block IDs without damaging exponents, emoticons or inline code', () => {
	assert.deepEqual(texts('段落 ^473eef\n^dcc8cc\n- 項目 ^abc123\n^quote-of-the-day'), ['段落', '項目']);
	assert.deepEqual(texts('2^8\nABC^123\n^_^\n使用 `^473eef` 建立 block。'), ['2^8', 'ABC^123', '^_^', '使用 ^473eef 建立 block。']);
});

test('removes inline and multiline Obsidian comments and normalizes whitespace', () => {
	assert.deepEqual(texts('今天 %% TODO %% 天氣很好。\n前。%%\n秘密\n%%後。'), ['今天天氣很好。', '前。', '後。']);
	assert.deepEqual(texts('使用 `%% metadata %%` 範例。\n~~~\n%% code %%\n~~~\n正文'), ['使用 %% metadata %% 範例。', '正文']);
});

test('removes HTML comments but conservatively preserves an unclosed comment', () => {
	assert.deepEqual(texts('前 <!-- inline --> 後\n<!--\n秘密\n-->\n正文'), ['前 後', '正文']);
	assert.deepEqual(texts('正文 <!-- comment\n後文'), ['正文 <!-- comment', '後文']);
	assert.deepEqual(parseReadableBlocks('正文 <!-- comment', {}, true).map((b) => b.text), ['正文']);
});

test('always removes footnote references, inline footnotes, definitions and exact continuations', () => {
	assert.deepEqual(texts('正文[^1]與[^name]。^[補充]\n[^1]: 來源\n    第二行\n\t第三行\n  只縮排兩格要保留'), ['正文與。', '只縮排兩格要保留']);
});

test('safe-skips embeds and images while preserving normal wikilink semantics', () => {
	assert.deepEqual(texts('![[Note]] ![[Note#Heading]] ![[Note#^abc]] ![[image.png]]\n![Alt](image.png)'), []);
	assert.deepEqual(texts('[[Note]] [[Note|Alias]] [[Note#Heading]] [[Note#Heading|標題別名]] [[Note#^abc]]'), ['Note Alias Note 標題別名 Note']);
	assert.deepEqual(parseReadableBlocks('前文。 ![[尚未完成', {}, true).map((block) => block.text), ['前文。']);
});

test('handles standalone and inline tags, nesting, underscores and escaped hashes', () => {
	assert.deepEqual(texts('#AI #中文 #research/tool #AI_tools'), []);
	assert.deepEqual(texts('#AI #中文 #research/tool #AI_tools', { readStandaloneTags: true }), ['AI 中文 research tool AI_tools']);
	assert.deepEqual(texts('今天研究 #AI/design 與 #AI_tools。\n\\#AI'), ['今天研究 AI design 與 AI_tools。', '#AI']);
	assert.deepEqual(texts('# 標題'), ['標題']);
});

test('filters bare URLs by default but keeps Markdown labels and protected code', () => {
	assert.deepEqual(texts('資料：https://example.com/article?id=123。\nhttps://example.com\n[OpenAI](https://openai.com)\n使用 `https://example.com`。'), ['資料：。', 'OpenAI', '使用 https://example.com。']);
	assert.deepEqual(texts('https://example.com/a?q=1', { readBareUrls: true }), ['https://example.com/a?q=1']);
});

test('handles inline and block math without treating prices as math', () => {
	assert.deepEqual(texts('公式 $E=mc^2$ 很有名。\n價格是 $100\nUS$100\n使用 `$variable`。'), ['公式 很有名。', '價格是 $100', 'US$100', '使用 $variable。']);
	assert.deepEqual(texts('價格 $100，售價 US$100。'), ['價格 $100，售價 US$100。']);
	assert.deepEqual(texts('公式 $E=mc^2$。', { readMath: true }), ['公式 E=mc^2。']);
	assert.deepEqual(texts('前文\n$$\nx = 1\ny = 2\n$$\n後文'), ['前文', '後文']);
	assert.deepEqual(texts('前文\n$$\nx = 1\n$$\n後文', { readMath: true }), ['前文', 'x = 1', '後文']);
	assert.deepEqual(texts('前文\n$$\nx = 1\n後文'), ['前文', '$$', 'x = 1', '後文']);
});

test('preserves callout titles/bodies and strips callout tokens everywhere', () => {
	assert.deepEqual(texts('> [!note]\n> [!warning]- 注意\n> > [!custom]+ 巢狀\n> 內容'), ['注意', '巢狀', '內容']);
	assert.deepEqual(texts('略過 [!note]、繼續朗讀。\n使用 `[!warning]` 範例。'), ['略過、繼續朗讀。', '使用 範例。']);
});

test('strips heading markers inside callouts and skips empty quote spacer lines', () => {
	const markdown = [
		'> [!danger] 注意事項',
		'>',
		'> # 一級標題',
		'> ## 二級標題',
		'> ### 三級標題',
		'> #### 四級標題',
		'> ##### 五級標題',
		'> ###### 六級標題',
		'>',
		'> 內文。',
	].join('\n');

	assert.deepEqual(texts(markdown), [
		'注意事項',
		'一級標題',
		'二級標題',
		'三級標題',
		'四級標題',
		'五級標題',
		'六級標題',
		'內文。',
	]);
});

test('removes known presentation tags, converts br, and preserves unknown or malformed HTML', () => {
	assert.deepEqual(texts('<mark>重點</mark><br />下一段 <font color="red">紅字</font>'), ['重點 下一段 紅字']);
	assert.deepEqual(texts('2 < 3 <Component>名稱</Component>'), ['2 < 3 <Component>名稱</Component>']);
	assert.deepEqual(texts('前 <mark style="x"未閉合 後'), ['前 <mark style="x"未閉合 後']);
	assert.deepEqual(texts('使用 ``<mark>``。'), ['使用 <mark>。']);
});

test('supports ordered list variants and arbitrary single-character task statuses', () => {
	assert.deepEqual(texts('1. 第一\n2) 第二\n- [ ] 空白\n- [x] 完成\n- [?] 疑問\n- [-] 取消\n正文 [A] 類型'), ['第一', '第二', '空白', '完成', '疑問', '取消', '正文 [A] 類型']);
});

test('parses tables with and without outer pipes but preserves ordinary pipe prose', () => {
	assert.deepEqual(parseReadableBlocks('| A | B |\n|---|:---:|\n| 1 | 2 |'), [
		{ text: 'A，B', kind: 'table', sourceLine: 0 },
		{ text: '1，2', kind: 'table', sourceLine: 2 },
	]);
	assert.deepEqual(texts('A | B\n--- | ---\n1 | 2'), ['A，B', '1，2']);
	assert.deepEqual(texts('普通 A | B 文字'), ['普通 A | B 文字']);
});

test('unknown syntax is preserved and parser is best effort', () => {
	assert.deepEqual(texts('<unknown data-x="1">文字</unknown>\n::: custom'), ['<unknown data-x="1">文字</unknown>', '::: custom']);
	assert.doesNotThrow(() => parseReadableBlocks('\u0000\ud800 unknown'));
});
