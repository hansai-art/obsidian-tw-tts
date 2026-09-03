export interface SecretStorageLike {
	getSecret(id: string): string | null;
	setSecret(id: string, secret: string): void;
}

export const AZURE_SECRET_ID = 'hans-tw-tts-azure-key';

export function withoutPlaintextSecret(settings: Record<string, unknown>): Record<string, unknown> {
	const persisted = { ...settings };
	delete persisted.azureKey;
	return persisted;
}

export function secretStorageFromApp(app: unknown): SecretStorageLike | null {
	if (!app || typeof app !== 'object') return null;
	const storage = (app as { secretStorage?: Partial<SecretStorageLike> }).secretStorage;
	return storage && typeof storage.getSecret === 'function' && typeof storage.setSecret === 'function'
		? storage as SecretStorageLike
		: null;
}

export function migratePlaintextSecret(
	storage: SecretStorageLike | null,
	secretId: string,
	plaintext: string,
): { plaintext: string; migrated: boolean } {
	if (!storage || !plaintext.trim()) return { plaintext, migrated: false };
	try {
		if (!storage.getSecret(secretId)) storage.setSecret(secretId, plaintext.trim());
		return { plaintext: '', migrated: true };
	} catch {
		return { plaintext, migrated: false };
	}
}

export function readSecret(storage: SecretStorageLike | null, secretId: string, fallback: string): string {
	try {
		return storage?.getSecret(secretId) ?? fallback;
	} catch {
		return fallback;
	}
}
