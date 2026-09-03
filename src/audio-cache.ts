import type { EdgeSpeechClient, EdgeVoiceSettings } from './edge-tts';

export interface AudioCacheEntry {
	key: string;
	size: number;
	lastUsed: number;
}

export interface AudioCacheStore {
	get(key: string): Promise<Blob | null>;
	put(key: string, value: Blob): Promise<void>;
	remove(key: string): Promise<void>;
	clear(): Promise<void>;
}

export async function audioCacheKey(provider: string, text: string, settings: EdgeVoiceSettings): Promise<string> {
	const value = `${provider}\u0000${settings.voice}\u0000${settings.rate}\u0000${settings.pitch}\u0000${text}`;
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function entriesToEvict(entries: AudioCacheEntry[], incomingBytes: number, maxBytes: number): string[] {
	let total = entries.reduce((sum, entry) => sum + entry.size, 0) + incomingBytes;
	if (total <= maxBytes) return [];
	const evicted: string[] = [];
	for (const entry of [...entries].sort((a, b) => a.lastUsed - b.lastUsed)) {
		evicted.push(entry.key);
		total -= entry.size;
		if (total <= maxBytes) break;
	}
	return evicted;
}

export class CachingSpeechClient implements EdgeSpeechClient {
	constructor(
		private readonly provider: string,
		private readonly inner: EdgeSpeechClient,
		private readonly cache: AudioCacheStore,
	) {}

	async synthesize(text: string, settings: EdgeVoiceSettings): Promise<Blob> {
		const key = await audioCacheKey(this.provider, text, settings);
		let cached: Blob | null = null;
		try { cached = await this.cache.get(key); } catch { /* Cache is optional. */ }
		if (cached) return cached;
		const created = await this.inner.synthesize(text, settings);
		try { await this.cache.put(key, created); } catch { /* Return usable audio even if cache storage fails. */ }
		return created;
	}
}
