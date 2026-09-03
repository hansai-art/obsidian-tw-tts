import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportRuleConfig, parseRuleConfig } from '../src/rule-config';

const source = {
	builtinAiTerms: true,
	builtinMarkdownSymbols: false,
	builtinMixedText: true,
	naturalizeMath: true,
	naturalizeTables: true,
	keyPointsOnly: false,
	pronunciationRules: 'GPT=G P T',
	silentSymbols: '○',
};

test('exports and imports a versioned rule configuration', () => {
	const parsed = parseRuleConfig(exportRuleConfig(source));
	assert.deepEqual(parsed, { schemaVersion: 1, ...source });
});

test('rejects malformed or unsupported rule configurations', () => {
	assert.throws(() => parseRuleConfig('{"schemaVersion":2}'), /不支援/);
	assert.throws(() => parseRuleConfig('{"schemaVersion":1}'), /缺少/);
	assert.throws(() => parseRuleConfig('[]'), /格式/);
});
