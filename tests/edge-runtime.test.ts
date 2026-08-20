import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeFailureMessage, pickDesktopRequire } from '../src/edge-tts';

test('desktop require falls back to module scope when Obsidian omits window.require', () => {
	const moduleRequire = (() => undefined) as (id: string) => unknown;
	assert.equal(pickDesktopRequire(undefined, moduleRequire), moduleRequire);
});

test('window require remains preferred when both Electron bridges exist', () => {
	const windowRequire = (() => undefined) as (id: string) => unknown;
	const moduleRequire = (() => undefined) as (id: string) => unknown;
	assert.equal(pickDesktopRequire(windowRequire, moduleRequire), windowRequire);
});

test('Edge failure text identifies missing command and timeout without exposing note text', () => {
	assert.match(edgeFailureMessage({ code: 'ENOENT', message: 'spawn /private/path ENOENT' }), /找不到/);
	assert.match(edgeFailureMessage({ killed: true, message: 'timeout' }), /逾時/);
	assert.match(edgeFailureMessage({ code: 1, edgeStderr: 'aiohttp.client_exceptions.ClientConnectorError' }), /連線失敗/);
	assert.match(edgeFailureMessage({ code: 1, edgeStderr: 'ssl.SSLCertVerificationError: CERTIFICATE_VERIFY_FAILED' }), /憑證驗證失敗/);
	assert.doesNotMatch(edgeFailureMessage({ message: 'secret note contents' }), /secret note contents/);
});
