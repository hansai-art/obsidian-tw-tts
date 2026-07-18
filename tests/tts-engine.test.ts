import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TtsEngine, type TtsUtterance, type TtsSynth } from '../src/tts-engine';

/** 可手動觸發事件的假 speechSynthesis,用來測試排序邏輯。 */
class MockSynth implements TtsSynth {
	spoken: TtsUtterance[] = [];
	cancelled = 0;
	paused = 0;
	resumed = 0;
	speak(u: TtsUtterance) {
		this.spoken.push(u);
	}
	cancel() {
		this.cancelled++;
	}
	pause() {
		this.paused++;
	}
	resume() {
		this.resumed++;
	}
	last() {
		return this.spoken[this.spoken.length - 1];
	}
	fireStart(i = this.spoken.length - 1) {
		this.spoken[i].onstart?.();
	}
	fireEnd(i = this.spoken.length - 1) {
		this.spoken[i].onend?.();
	}
}

function makeUtterance(text: string): TtsUtterance {
	return { text, voice: null, rate: 1, lang: '', onstart: null, onend: null, onerror: null };
}

function setup(cb = {}) {
	const synth = new MockSynth();
	const engine = new TtsEngine(
		{ synth, createUtterance: makeUtterance, rate: 1 },
		cb,
	);
	return { synth, engine };
}

test('start speaks the first sentence', () => {
	const { synth, engine } = setup();
	engine.start(['甲', '乙', '丙']);
	assert.equal(synth.spoken.length, 1);
	assert.equal(synth.last().text, '甲');
	assert.equal(engine.isPlaying, true);
});

test('onstart fires onSentenceStart with the index', () => {
	const seen: number[] = [];
	const { synth, engine } = setup({ onSentenceStart: (i: number) => seen.push(i) });
	engine.start(['甲', '乙']);
	synth.fireStart(0);
	assert.deepEqual(seen, [0]);
});

test('onend advances to the next sentence', () => {
	const { synth, engine } = setup();
	engine.start(['甲', '乙', '丙']);
	synth.fireEnd(0);
	assert.equal(synth.last().text, '乙');
	assert.equal(engine.currentIndex, 1);
});

test('finishing the last sentence calls onDone and stops', () => {
	let done = 0;
	const { synth, engine } = setup({ onDone: () => done++ });
	engine.start(['甲', '乙']);
	synth.fireEnd(0); // -> 乙
	synth.fireEnd(1); // -> done
	assert.equal(done, 1);
	assert.equal(engine.isPlaying, false);
});

test('applies voice and rate to each utterance', () => {
	const synth = new MockSynth();
	const fakeVoice = { name: 'zh-TW-Test' } as unknown as SpeechSynthesisVoice;
	const engine = new TtsEngine(
		{ synth, createUtterance: makeUtterance, voice: fakeVoice, rate: 1.5 },
		{},
	);
	engine.start(['甲']);
	assert.equal(synth.last().voice, fakeVoice);
	assert.equal(synth.last().rate, 1.5);
});

test('stop cancels and a stale onend does not advance', () => {
	const { synth, engine } = setup();
	engine.start(['甲', '乙']);
	engine.stop();
	assert.equal(synth.cancelled >= 1, true);
	assert.equal(engine.isPlaying, false);
	synth.fireEnd(0); // stale event from the cancelled utterance
	assert.equal(synth.spoken.length, 1); // 乙 must NOT be spoken
});

test('next skips to the following sentence', () => {
	const { synth, engine } = setup();
	engine.start(['甲', '乙', '丙']);
	engine.next();
	assert.equal(engine.currentIndex, 1);
	assert.equal(synth.last().text, '乙');
});

test('prev goes back one sentence', () => {
	const { synth, engine } = setup();
	engine.start(['甲', '乙', '丙']);
	engine.next(); // 乙
	engine.prev(); // 甲
	assert.equal(engine.currentIndex, 0);
	assert.equal(synth.last().text, '甲');
});

test('jumpTo plays the chosen sentence', () => {
	const { synth, engine } = setup();
	engine.start(['甲', '乙', '丙']);
	engine.jumpTo(2);
	assert.equal(engine.currentIndex, 2);
	assert.equal(synth.last().text, '丙');
});

test('start with empty array reports an error and speaks nothing', () => {
	let err = '';
	const { synth, engine } = setup({ onError: (m: string) => (err = m) });
	engine.start([]);
	assert.equal(synth.spoken.length, 0);
	assert.equal(engine.isPlaying, false);
	assert.match(err, /內容/);
});

test('utterance error triggers onError and stops', () => {
	let err = '';
	const { synth, engine } = setup({ onError: (m: string) => (err = m) });
	engine.start(['甲']);
	synth.last().onerror?.('boom');
	assert.equal(engine.isPlaying, false);
	assert.match(err, /錯誤/);
});

test('setRate restarts the current sentence at the new rate while playing', () => {
	const { synth, engine } = setup();
	engine.start(['甲', '乙']);
	synth.fireEnd(0); // -> 乙 (index 1)
	const before = synth.spoken.length;
	engine.setRate(1.5);
	assert.equal(synth.spoken.length, before + 1); // 乙 re-spoken
	assert.equal(synth.last().text, '乙');
	assert.equal(synth.last().rate, 1.5);
	assert.equal(engine.currentIndex, 1);
});

test('setRate does not speak when idle; applies to the next sentence', () => {
	const { synth, engine } = setup();
	engine.setRate(0.75);
	assert.equal(synth.spoken.length, 0);
	engine.start(['甲']);
	assert.equal(synth.last().rate, 0.75);
});

test('pause and resume delegate to the synth', () => {
	const { synth, engine } = setup();
	engine.start(['甲']);
	engine.pause();
	assert.equal(synth.paused, 1);
	assert.equal(engine.isPaused, true);
	engine.resume();
	assert.equal(synth.resumed, 1);
	assert.equal(engine.isPaused, false);
});
