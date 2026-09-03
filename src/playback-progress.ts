export interface PlaybackBookmark {
	sentenceIndex: number;
	total: number;
	fileMtime: number;
	savedAt: number;
	planFingerprint?: string;
}

export type PlaybackBookmarks = Record<string, PlaybackBookmark>;

export function sanitizeBookmarks(value: unknown): PlaybackBookmarks {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const result: PlaybackBookmarks = {};
	for (const [path, candidate] of Object.entries(value)) {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
		const item = candidate as Partial<PlaybackBookmark>;
		if (!Number.isInteger(item.sentenceIndex) || !Number.isInteger(item.total)) continue;
		if ((item.sentenceIndex ?? -1) < 0 || (item.total ?? 0) <= 0 || (item.sentenceIndex ?? 0) >= (item.total ?? 0)) continue;
		if (!Number.isFinite(item.fileMtime) || !Number.isFinite(item.savedAt)) continue;
		result[path] = {
			sentenceIndex: item.sentenceIndex as number,
			total: item.total as number,
			fileMtime: item.fileMtime as number,
			savedAt: item.savedAt as number,
			...(typeof item.planFingerprint === 'string' ? { planFingerprint: item.planFingerprint } : {}),
		};
	}
	return result;
}

export function resumableIndex(
	bookmark: PlaybackBookmark | undefined,
	total: number,
	fileMtime: number,
	planFingerprint?: string,
): number | null {
	if (!bookmark || bookmark.fileMtime !== fileMtime || bookmark.total !== total) return null;
	if (planFingerprint && bookmark.planFingerprint !== planFingerprint) return null;
	return bookmark.sentenceIndex > 0 && bookmark.sentenceIndex < total ? bookmark.sentenceIndex : null;
}

export function speechPlanFingerprint(sentences: readonly { text: string; pauseAfterMs: number }[]): string {
	let hash = 2166136261;
	for (const sentence of sentences) {
		for (const char of `${sentence.text}\u0000${sentence.pauseAfterMs}\u0001`) {
			hash ^= char.charCodeAt(0);
			hash = Math.imul(hash, 16777619);
		}
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

export function progressPercent(index: number, total: number): number {
	if (total <= 0) return 0;
	return Math.round((Math.min(Math.max(index + 1, 0), total) / total) * 100);
}

export function estimatedSentenceSeconds(text: string, rate: number): number {
	const units = Array.from(text.trim()).length;
	const safeRate = Math.max(0.5, Math.min(2, rate || 1));
	return Math.max(1, units / (5 * safeRate));
}

export function estimatedPlanProgress(
	sentences: readonly { text: string; pauseAfterMs: number }[],
	index: number,
	rate: number,
): { duration: number; position: number } {
	const durations = sentences.map((sentence) =>
		estimatedSentenceSeconds(sentence.text, rate) + Math.max(0, sentence.pauseAfterMs) / 1000);
	const duration = Math.max(1, durations.reduce((sum, seconds) => sum + seconds, 0));
	const boundedIndex = Math.min(Math.max(index, 0), sentences.length);
	const position = durations.slice(0, boundedIndex).reduce((sum, seconds) => sum + seconds, 0);
	return { duration, position };
}

export function seekSentenceIndex(
	sentences: readonly { text: string }[],
	currentIndex: number,
	deltaSeconds: number,
	rate: number,
): number {
	if (sentences.length === 0) return 0;
	const direction = deltaSeconds < 0 ? -1 : 1;
	let remaining = Math.abs(deltaSeconds);
	let index = Math.min(Math.max(currentIndex, 0), sentences.length - 1);
	while (remaining > 0) {
		const next = index + direction;
		if (next < 0 || next >= sentences.length) break;
		index = next;
		remaining -= estimatedSentenceSeconds(sentences[index].text, rate);
	}
	return index;
}
