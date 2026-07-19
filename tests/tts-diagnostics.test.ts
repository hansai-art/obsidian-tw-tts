import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTtsDiagnostics, summariseUserAgent } from '../src/tts-diagnostics';

test('summariseUserAgent flags Android WebView and Chromium version', () => {
	const ua =
		'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36';
	const s = summariseUserAgent(ua);
	assert.match(s, /Chromium 120\.0\.6099\.230/);
	assert.match(s, /Android WebView/);
});

test('summariseUserAgent handles desktop Chrome (no wv marker)', () => {
	const ua =
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
	const s = summariseUserAgent(ua);
	assert.match(s, /Chromium 119/);
	assert.doesNotMatch(s, /WebView/);
});

test('formatTtsDiagnostics reports the missing-API case clearly', () => {
	const lines = formatTtsDiagnostics({
		hasSpeechSynthesis: false,
		voiceCount: 0,
		zhVoices: [],
		userAgent: 'x; wv) Chrome/120.0.0.0',
		platform: 'Android app',
	});
	assert.ok(lines.some((l) => l.includes('不存在')));
	// 沒有 API 時不應誤報語音數。
	assert.ok(!lines.some((l) => l.startsWith('偵測到語音數')));
});

test('formatTtsDiagnostics lists Chinese voices when present', () => {
	const lines = formatTtsDiagnostics({
		hasSpeechSynthesis: true,
		voiceCount: 3,
		zhVoices: ['美佳 (zh-TW)', 'Ting-Ting (zh-CN)'],
		userAgent: 'Chrome/120.0.0.0',
		platform: 'Desktop',
	});
	assert.ok(lines.some((l) => l.includes('偵測到語音數:3')));
	assert.ok(lines.some((l) => l.includes('美佳 (zh-TW)')));
});

test('formatTtsDiagnostics notes API-present-but-no-Chinese-voice', () => {
	const lines = formatTtsDiagnostics({
		hasSpeechSynthesis: true,
		voiceCount: 5,
		zhVoices: [],
		userAgent: 'Chrome/120',
		platform: 'Desktop',
	});
	assert.ok(lines.some((l) => l.includes('抓不到中文語音')));
});
