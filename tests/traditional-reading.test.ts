import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	applyBuiltinRules,
	extractEmphasizedText,
	naturalizeMath,
	naturalizeTableRow,
} from '../src/traditional-reading';

test('built-in Taiwanese rule packs are independently switchable', () => {
	assert.equal(
		applyBuiltinRules('用iPAS與GPT完成AI報告，命中率95%', { aiTerms: true, markdownSymbols: true, mixedText: true }),
		'用愛帕斯與 G P T 完成 AI 報告，命中率百分之95',
	);
	assert.equal(applyBuiltinRules('GPT', { aiTerms: false, markdownSymbols: true, mixedText: false }), 'GPT');
});

test('naturalizes common fractions, powers and operators in Traditional Chinese', () => {
	assert.equal(naturalizeMath('\\frac{1}{2} + x^2 = 5'), '2 分之 1 加 x 的平方 等於 5');
	assert.equal(naturalizeMath('\\sqrt{9} \\times 2'), '9 的平方根 乘以 2');
});

test('reads table values together with their column headers', () => {
	assert.equal(naturalizeTableRow(['姓名', '分數'], ['小明', '90']), '姓名：小明；分數：90');
});

test('key-point extraction keeps only bold emphasis', () => {
	assert.equal(extractEmphasizedText('背景 **第一重點** 與 __第二重點__。'), '第一重點；第二重點');
	assert.equal(extractEmphasizedText('先 __第一__，再 **第二**，略過 `**程式碼**`'), '第一；第二');
});

test('Markdown fallback rules preserve operators in ordinary prose', () => {
	assert.equal(
		applyBuiltinRules('比較 2 > 1，標記 A # B。', { aiTerms: false, markdownSymbols: true, mixedText: false }),
		'比較 2 > 1，標記 A # B。',
	);
});
