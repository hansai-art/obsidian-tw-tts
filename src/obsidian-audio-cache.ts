import type { AudioCacheEntry, AudioCacheStore } from './audio-cache';
import { entriesToEvict } from './audio-cache';

interface BinaryAdapter {
	exists(path: string): Promise<boolean>;
	mkdir(path: string): Promise<void>;
	readBinary(path: string): Promise<ArrayBuffer>;
	writeBinary(path: string, data: ArrayBuffer): Promise<void>;
	remove(path: string): Promise<void>;
	list(path: string): Promise<{ files: string[]; folders: string[] }>;
	stat(path: string): Promise<{ mtime: number; size: number } | null>;
}

export class ObsidianAudioCache implements AudioCacheStore {
	private entries = new Map<string, AudioCacheEntry>();
	private indexed = false;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(
		private readonly adapter: BinaryAdapter,
		private readonly directory: string,
		private readonly maxBytes: () => number,
	) {}

	private path(key: string): string { return `${this.directory}/${key}.mp3`; }

	private async ensureDirectory(): Promise<void> {
		if (!await this.adapter.exists(this.directory)) await this.adapter.mkdir(this.directory);
	}

	private async ensureIndex(): Promise<void> {
		if (this.indexed) return;
		this.indexed = true;
		if (!await this.adapter.exists(this.directory)) return;
		for (const path of (await this.adapter.list(this.directory)).files) {
			const match = path.match(/\/([a-f0-9]{64})\.mp3$/);
			const stat = await this.adapter.stat(path);
			if (match && stat) this.entries.set(match[1], { key: match[1], size: stat.size, lastUsed: stat.mtime });
		}
	}

	async get(key: string): Promise<Blob | null> {
		await this.ensureIndex();
		const path = this.path(key);
		if (!await this.adapter.exists(path)) return null;
		const data = await this.adapter.readBinary(path);
		this.entries.set(key, { key, size: data.byteLength, lastUsed: Date.now() });
		return new Blob([data], { type: 'audio/mpeg' });
	}

	async put(key: string, value: Blob): Promise<void> {
		const operation = this.writeQueue.then(() => this.performPut(key, value));
		this.writeQueue = operation.catch(() => undefined);
		return operation;
	}

	private async performPut(key: string, value: Blob): Promise<void> {
		await this.ensureIndex();
		if (this.maxBytes() <= 0) return;
		await this.ensureDirectory();
		const data = await value.arrayBuffer();
		if (data.byteLength > this.maxBytes()) return;
		const evictions = entriesToEvict([...this.entries.values()], data.byteLength, this.maxBytes());
		for (const evicted of evictions) {
			if (await this.adapter.exists(this.path(evicted))) await this.adapter.remove(this.path(evicted));
			this.entries.delete(evicted);
		}
		await this.adapter.writeBinary(this.path(key), data);
		this.entries.set(key, { key, size: data.byteLength, lastUsed: Date.now() });
	}

	async remove(key: string): Promise<void> {
		if (await this.adapter.exists(this.path(key))) await this.adapter.remove(this.path(key));
		this.entries.delete(key);
	}

	async clear(): Promise<void> {
		await this.ensureIndex();
		for (const key of [...this.entries.keys()]) await this.remove(key);
	}
}
