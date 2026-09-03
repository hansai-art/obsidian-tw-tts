import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObsidianAudioCache } from '../src/obsidian-audio-cache';

class MemoryAdapter {
	files = new Map<string, ArrayBuffer>();
	mtimes = new Map<string, number>();
	directories = new Set<string>();

	async exists(path: string): Promise<boolean> {
		return this.directories.has(path) || this.files.has(path);
	}
	async mkdir(path: string): Promise<void> { this.directories.add(path); }
	async readBinary(path: string): Promise<ArrayBuffer> { return this.files.get(path) as ArrayBuffer; }
	async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
		await Promise.resolve();
		this.files.set(path, data);
		this.mtimes.set(path, Date.now());
	}
	async remove(path: string): Promise<void> { this.files.delete(path); this.mtimes.delete(path); }
	async list(path: string): Promise<{ files: string[]; folders: string[] }> {
		return { files: [...this.files.keys()].filter((file) => file.startsWith(`${path}/`)), folders: [] };
	}
	async stat(path: string): Promise<{ mtime: number; size: number } | null> {
		const data = this.files.get(path);
		return data ? { mtime: this.mtimes.get(path) ?? 0, size: data.byteLength } : null;
	}
}

test('serializes parallel cache writes so the size ceiling is preserved', async () => {
	const adapter = new MemoryAdapter();
	const cache = new ObsidianAudioCache(adapter, 'cache', () => 100);
	await Promise.all([
		cache.put('a'.repeat(64), new Blob([new Uint8Array(60)])),
		cache.put('b'.repeat(64), new Blob([new Uint8Array(60)])),
	]);
	const total = [...adapter.files.values()].reduce((sum, value) => sum + value.byteLength, 0);
	assert.equal(total, 60);
	assert.equal(adapter.files.size, 1);
});
