import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReadableBlocks } from '../src/markdown-reader';

test('naturalizes enabled inline math while leaving prices alone', () => {
	const blocks = parseReadableBlocks('公式 $\\frac{1}{2} + x^2 = 5$。價格 $100。', {
		readMath: true,
		naturalizeMath: true,
	});
	assert.equal(blocks[0].text, '公式 2 分之 1 加 x 的平方 等於 5。價格 $100。');
});

test('naturalizes only math spans and preserves operators in prose', () => {
	const blocks = parseReadableBlocks('我使用 C++ 與 A+B。公式 $x^2+1=2$。', {
		readMath: true,
		naturalizeMath: true,
	});
	assert.equal(blocks[0].text, '我使用 C++ 與 A+B。公式 x 的平方 加 1 等於 2。');
});

test('naturalizes Markdown tables as header-value pairs', () => {
	const blocks = parseReadableBlocks('| 姓名 | 分數 |\n| --- | --- |\n| 小明 | 90 |', {
		naturalizeTables: true,
	});
	assert.deepEqual(blocks.map((block) => block.text), ['欄位：姓名、分數', '姓名：小明；分數：90']);
});

test('keeps escaped and inline-code pipes inside their table cells', () => {
	const blocks = parseReadableBlocks('| 語法 | 說明 |\n| --- | --- |\n| `a|b` | A\\|B |', {
		naturalizeTables: true,
	});
	assert.equal(blocks[1].text, '語法：a|b；說明：A|B');
});

test('key-points mode keeps headings, callout titles and bold spans only', () => {
	const blocks = parseReadableBlocks('# 摘要\n普通背景。\n這裡有 **重點一** 與 __重點二__。\n> [!tip] 提醒\n> 一般說明。', {
		keyPointsOnly: true,
	});
	assert.deepEqual(blocks.map((block) => block.text), ['摘要', '重點一；重點二', '提醒']);
});
