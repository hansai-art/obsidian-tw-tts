import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderNotesByPath } from '../src/note-order';

const f = (path: string) => ({ path });

test('orderNotesByPath sorts by path A→Z, case-insensitively', () => {
	const files = [f('B/note.md'), f('a/note.md'), f('A/zzz.md')];
	assert.deepEqual(
		orderNotesByPath(files).map((x) => x.path),
		['a/note.md', 'A/zzz.md', 'B/note.md'],
	);
});

test('orderNotesByPath does not mutate the input array', () => {
	const files = [f('b.md'), f('a.md')];
	orderNotesByPath(files);
	assert.deepEqual(files.map((x) => x.path), ['b.md', 'a.md']);
});
