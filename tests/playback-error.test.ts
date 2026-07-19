import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playbackError, type PlaybackEnv } from '../src/playback-error';
import { STRINGS } from '../src/i18n/zh-tw';

const base: PlaybackEnv = {
	hasSpeechApi: true,
	hasVoice: true,
	isAndroid: false,
	isIos: false,
	isDesktop: true,
};

test('playback proceeds (null) when the API and a voice are both present', () => {
	assert.equal(playbackError(base), null);
});

test('Android without the speech API gets the Android-specific fix', () => {
	const err = playbackError({ ...base, hasSpeechApi: false, hasVoice: false, isAndroid: true, isDesktop: false });
	assert.equal(err, STRINGS.errors.androidUnsupported);
	assert.ok(err && err.body.length >= 2, 'Android error must carry solution steps');
});

test('non-Android without the speech API gets the generic update-app fix', () => {
	const err = playbackError({ ...base, hasSpeechApi: false, hasVoice: false });
	assert.equal(err, STRINGS.errors.noSpeechApi);
});

test('API present but no voice yields install steps, desktop lists mac + win', () => {
	const err = playbackError({ ...base, hasVoice: false });
	assert.ok(err);
	assert.equal(err?.title, STRINGS.errors.noVoiceTitle);
	assert.equal(err?.body[0], STRINGS.errors.noVoiceLead);
	assert.deepEqual(err?.body.slice(1), [STRINGS.installHintMac, STRINGS.installHintWin]);
});

test('no voice on iOS lists only the iOS install step', () => {
	const err = playbackError({ ...base, hasVoice: false, isDesktop: false, isIos: true });
	assert.deepEqual(err?.body.slice(1), [STRINGS.installHintIos]);
});

test('every actionable error has a title and at least one solution line', () => {
	const envs: PlaybackEnv[] = [
		{ ...base, hasSpeechApi: false, hasVoice: false, isAndroid: true, isDesktop: false },
		{ ...base, hasSpeechApi: false, hasVoice: false },
		{ ...base, hasVoice: false },
	];
	for (const env of envs) {
		const err = playbackError(env);
		assert.ok(err, 'expected an error for a non-playable env');
		assert.ok(err && err.title.length > 0);
		assert.ok(err && err.body.length > 0);
	}
});
