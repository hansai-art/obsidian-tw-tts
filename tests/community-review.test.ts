import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(
	readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'),
) as { version: string; description: string };
const settingsSource = readFileSync(new URL('../src/settings.ts', import.meta.url), 'utf8');

test('manifest description follows the community plugin directory wording rule', () => {
	assert.doesNotMatch(manifest.description, /obsidian/i);
});

test('support diagnostics do not persist data through browser storage', () => {
	assert.doesNotMatch(settingsSource, /\b(?:localStorage|sessionStorage)\b/);
});
