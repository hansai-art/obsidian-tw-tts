import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	AZURE_SECRET_ID,
	migratePlaintextSecret,
	readSecret,
	secretStorageFromApp,
	withoutPlaintextSecret,
} from '../src/secret-storage';

test('detects the official secret storage shape without importing a new Obsidian runtime', () => {
	const values = new Map<string, string>();
	const storage = secretStorageFromApp({ secretStorage: {
		getSecret: (id: string) => values.get(id) ?? null,
		setSecret: (id: string, value: string) => { values.set(id, value); },
	} });
	assert.ok(storage);
	storage.setSecret(AZURE_SECRET_ID, 'safe');
	assert.equal(storage.getSecret(AZURE_SECRET_ID), 'safe');
	assert.equal(secretStorageFromApp({}), null);
});

test('migrates an existing plaintext key then clears the persisted field', () => {
	const values = new Map<string, string>();
	const storage = {
		getSecret: (id: string) => values.get(id) ?? null,
		setSecret: (id: string, value: string) => { values.set(id, value); },
	};
	assert.deepEqual(migratePlaintextSecret(storage, AZURE_SECRET_ID, ' legacy-key '), {
		plaintext: '', migrated: true,
	});
	assert.equal(values.get(AZURE_SECRET_ID), 'legacy-key');
	assert.equal(readSecret(storage, AZURE_SECRET_ID, ''), 'legacy-key');
});

test('keeps the old local field only when SecretStorage is unavailable', () => {
	assert.deepEqual(migratePlaintextSecret(null, AZURE_SECRET_ID, 'legacy-key'), {
		plaintext: 'legacy-key', migrated: false,
	});
	assert.equal(readSecret(null, AZURE_SECRET_ID, 'legacy-key'), 'legacy-key');
});

test('does not overwrite an existing secret during migration', () => {
	const values = new Map([[AZURE_SECRET_ID, 'new-secret']]);
	const result = migratePlaintextSecret({
		getSecret: (id) => values.get(id) ?? null,
		setSecret: (id, value) => { values.set(id, value); },
	}, AZURE_SECRET_ID, 'legacy-secret');
	assert.deepEqual(result, { plaintext: '', migrated: true });
	assert.equal(values.get(AZURE_SECRET_ID), 'new-secret');
});

test('keeps plaintext when SecretStorage migration fails', () => {
	const result = migratePlaintextSecret({
		getSecret: () => null,
		setSecret: () => { throw new Error('unavailable'); },
	}, AZURE_SECRET_ID, 'legacy-secret');
	assert.deepEqual(result, { plaintext: 'legacy-secret', migrated: false });
});

test('never includes an Azure key in persisted plugin settings', () => {
	assert.deepEqual(withoutPlaintextSecret({ provider: 'azure', azureKey: 'memory-only' }), {
		provider: 'azure',
	});
});
