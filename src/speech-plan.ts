/** A displayed sentence plus the silent pause that follows its audio. */
export interface SpeechSentence {
	text: string;
	pauseAfterMs: number;
}

export type SpeechSentenceInput = string | SpeechSentence;

export function normalizeSpeechSentences(sentences: SpeechSentenceInput[]): SpeechSentence[] {
	return sentences.map((sentence) => typeof sentence === 'string'
		? { text: sentence, pauseAfterMs: 0 }
		: {
			text: sentence.text,
			pauseAfterMs: Number.isFinite(sentence.pauseAfterMs)
				? Math.max(0, sentence.pauseAfterMs)
				: 0,
		});
}

/** Final provider guard: known Markdown-only chunks must never reach a speech API. */
export function isSpeakableText(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) return false;
	return !/^(?:>+|#{1,6}|`{3,}|~{3,}|(?:[-*_]\s*){3,}|\|[\s|:-]*\|?)$/.test(trimmed);
}
