import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	audioCacheKey,
	CachingSpeechClient,
	entriesToEvict,
	type AudioCacheStore,
} from '../src/audio-cache';

test('cache keys use SHA-256 and change with provider, voice, prosody or text', async () => {
	const settings = { voice: 'A', rate: 1, pitch: 0 };
	const base = await audioCacheKey('edge', '甲', settings);
	assert.equal(base.length, 64);
	assert.notEqual(base, await audioCacheKey('azure', '甲', settings));
	assert.notEqual(base, await audioCacheKey('edge', '乙', settings));
	assert.equal(base, await audioCacheKey('edge', '甲', settings));
});

test('LRU eviction respects the configured byte ceiling', () => {
	assert.deepEqual(entriesToEvict([
		{ key: 'old', size: 60, lastUsed: 1 },
		{ key: 'new', size: 30, lastUsed: 2 },
	], 30, 100), ['old']);
});

test('caching speech client avoids duplicate provider requests', async () => {
	const values = new Map<string, Blob>();
	const cache: AudioCacheStore = {
		get: async (key) => values.get(key) ?? null,
		put: async (key, value) => { values.set(key, value); },
		remove: async (key) => { values.delete(key); },
		clear: async () => { values.clear(); },
	};
	let calls = 0;
	const client = new CachingSpeechClient('edge', {
		synthesize: async () => { calls++; return new Blob(['audio']); },
	}, cache);
	const settings = { voice: 'A', rate: 1, pitch: 0 };
	await client.synthesize('甲', settings);
	await client.synthesize('甲', settings);
	assert.equal(calls, 1);
});

test('cache failures never block successful provider audio', async () => {
	let calls = 0;
	const failingCache: AudioCacheStore = {
		get: async () => { throw new Error('read failed'); },
		put: async () => { throw new Error('write failed'); },
		remove: async () => undefined,
		clear: async () => undefined,
	};
	const client = new CachingSpeechClient('edge', {
		synthesize: async () => { calls++; return new Blob(['audio']); },
	}, failingCache);
	const result = await client.synthesize('甲', { voice: 'A', rate: 1, pitch: 0 });
	assert.equal(await result.text(), 'audio');
	assert.equal(calls, 1);
});
