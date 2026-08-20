import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	effectiveSupportProvider,
	formatAiSupportPrompt,
	formatSupportSummary,
	safeAzureFailureMessage,
	SUPPORT_FAQ,
	type SupportDiagnostic,
} from '../src/support-diagnostics';

test('mobile Edge diagnostics report the local fallback instead of claiming Edge executed', () => {
	assert.deepEqual(effectiveSupportProvider('edge', false), {
		effectiveProvider: 'local',
		fallbackReason: 'edge-unavailable-on-mobile',
	});
	assert.deepEqual(effectiveSupportProvider('edge', true), { effectiveProvider: 'edge' });
	assert.deepEqual(effectiveSupportProvider('azure', false), { effectiveProvider: 'azure' });
});

const diagnostic: SupportDiagnostic = {
	pluginVersion: '0.13.0',
	obsidianVersion: '1.13.7',
	platform: 'Desktop',
	provider: 'edge',
	voice: 'zh-CN-YunyangNeural',
	rate: 1,
	pitch: -7,
	status: 'failed',
	stage: 'edge-cli',
	errorCode: 'EDGE-003',
};

test('support summary contains actionable runtime metadata but no credentials or note text fields', () => {
	const summary = formatSupportSummary(diagnostic);
	assert.match(summary, /外掛版本：0\.13\.0/);
	assert.match(summary, /Provider：edge/);
	assert.match(summary, /Voice：zh-CN-YunyangNeural/);
	assert.match(summary, /錯誤代碼：EDGE-003/);
	assert.doesNotMatch(summary, /Key|筆記內容|Azure Speech Key/i);
});

test('AI support prompt contains guardrails and never accepts raw stderr, paths, keys or note text', () => {
	const hostile = {
		...diagnostic,
		pluginVersion: '0.13.0 /Users/hans/Private Vault',
		obsidianVersion: '1.13.7\n這是我的私人筆記',
		platform: 'Desktop\nsecret',
		provider: 'edge\nsecret',
		voice: 'zh-CN-YunyangNeural /Users/hans/Private Vault key 0123456789abcdef0123456789abcdef',
		rate: Number.NaN,
		pitch: Number.POSITIVE_INFINITY,
		stage: 'edge-cli\nsecret',
		errorCode: 'SECRET-KEY-0123456789abcdef0123456789abcdef',
	} as unknown as SupportDiagnostic;
	const report = formatAiSupportPrompt(hostile);
	assert.match(report, /不要要求我提供筆記內容、Azure Key、密碼或其他憑證/);
	assert.match(report, /Voice：\[REDACTED\]/);
	assert.doesNotMatch(report, /\/Users\/hans\/Private Vault/);
	assert.doesNotMatch(report, /0123456789abcdef0123456789abcdef/);
	assert.doesNotMatch(report, /這是我的私人筆記/);
	assert.doesNotMatch(report, /SECRET-KEY/);
});

test('support summary gives a clear not-run state before environment checking', () => {
	const summary = formatSupportSummary({ ...diagnostic, status: 'not-run', stage: undefined, errorCode: undefined });
	assert.match(summary, /尚未執行環境檢查/);
});

test('Azure support errors never echo unknown exception text or credentials', () => {
	const message = safeAzureFailureMessage(new Error('request failed with key 0123456789abcdef0123456789abcdef at /Users/hans/Private Vault'));
	assert.match(message, /Azure Speech 請求失敗/);
	assert.doesNotMatch(message, /0123456789abcdef|Private Vault|\/Users\/hans/);
	assert.match(safeAzureFailureMessage(new Error('請先輸入 Azure Speech Region')), /Region/);
});

test('support FAQ covers install, wrong voice, connectivity, Azure and AI handoff', () => {
	assert.ok(SUPPORT_FAQ.length >= 5);
	const text = SUPPORT_FAQ.map((item) => `${item.question}\n${item.answer}`).join('\n');
	for (const keyword of ['edge-tts', '不是我選的語音', '連線', 'Azure', 'AI']) assert.match(text, new RegExp(keyword, 'i'));
});
