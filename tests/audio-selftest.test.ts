import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSinePcm } from '../src/audio-selftest';

test('makeSinePcm length equals floor(sampleRate * seconds)', () => {
	assert.equal(makeSinePcm(48000, 0.5, 440).length, 24000);
	assert.equal(makeSinePcm(44100, 0.6, 440).length, 26460);
});

test('makeSinePcm returns an empty buffer for zero duration', () => {
	assert.equal(makeSinePcm(48000, 0, 440).length, 0);
});

test('makeSinePcm stays within the 0.2 amplitude envelope', () => {
	const pcm = makeSinePcm(48000, 0.3, 440);
	// 容差含 Float32 rounding(0.2 存成 float32 約為 0.20000000298)。
	for (const s of pcm) assert.ok(Math.abs(s) <= 0.2 + 1e-6, `sample ${s} out of range`);
});

test('makeSinePcm fades in and out (endpoints near zero, middle louder)', () => {
	const pcm = makeSinePcm(48000, 0.3, 440);
	assert.ok(Math.abs(pcm[0]) < 0.02, 'starts near zero');
	assert.ok(Math.abs(pcm[pcm.length - 1]) < 0.02, 'ends near zero');
	// 中段某處應有明顯振幅(不是全零)。
	const mid = pcm.slice(pcm.length / 2 - 200, pcm.length / 2 + 200);
	assert.ok(Math.max(...mid.map(Math.abs)) > 0.1, 'middle has real amplitude');
});
