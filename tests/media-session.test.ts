import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureMediaSession, updateMediaProgress, type MediaSessionLike } from '../src/media-session';

test('wires lock-screen handlers and clears them on release', () => {
	const handlers = new Map<string, (() => void) | null>();
	const session: MediaSessionLike = {
		playbackState: 'none', metadata: null,
		setActionHandler: (action, handler) => handlers.set(action, handler),
	};
	let plays = 0;
	const cleanup = configureMediaSession(session, undefined, '筆記', {
		play: () => plays++, pause: () => undefined, stop: () => undefined,
		seekBackward: () => undefined, seekForward: () => undefined,
		previous: () => undefined, next: () => undefined,
	});
	handlers.get('play')?.();
	assert.equal(plays, 1);
	cleanup();
	assert.equal(session.playbackState, 'none');
	assert.equal(handlers.get('play'), null);
});

test('updates media playback using elapsed seconds', () => {
	let state: { duration: number; playbackRate: number; position: number } | undefined;
	const session: MediaSessionLike = {
		playbackState: 'none', metadata: null,
		setActionHandler: () => undefined,
		setPositionState: (value) => { state = value; },
	};
	updateMediaProgress(session, 12, 60, 1.25, true, false);
	assert.equal(session.playbackState, 'playing');
	assert.deepEqual(state, { duration: 60, playbackRate: 1.25, position: 12 });
});
