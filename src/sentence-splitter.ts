import {
	parseReadableBlocks,
	type MarkdownReaderOptions,
} from './markdown-reader';
import type { SpeechSentence } from './speech-plan';

const FULL_TERMINATORS = '。！？；';
const CLOSERS = new Set([
	'」', '』', '）', '】', '》', '〉', '”', '’', '"', "'", ')', ']', '}',
]);

export interface SpeechTimingOptions {
	paragraphPauseMs: number;
	headingPauseMs: number;
}

export const DEFAULT_SPEECH_TIMING_OPTIONS: SpeechTimingOptions = {
	paragraphPauseMs: 400,
	headingPauseMs: 600,
};

function isTerminator(char: string, next: string | undefined): boolean {
	if (FULL_TERMINATORS.includes(char) || char === '!' || char === '?') return true;
	if (char !== '.') return false;
	if (next === undefined || /\s/.test(next) || CLOSERS.has(next)) return true;
	return false;
}

function isTrailing(char: string): boolean {
	return FULL_TERMINATORS.includes(char)
		|| char === '!'
		|| char === '?'
		|| char === '.'
		|| CLOSERS.has(char);
}

/** Sentence punctuation is intentionally independent from Markdown parsing. */
function splitBlock(block: string): string[] {
	const output: string[] = [];
	let current = '';
	let index = 0;
	while (index < block.length) {
		const char = block[index];
		current += char;
		const startsHtmlDeclaration = char === '!' && current.endsWith('<!');
		if (!startsHtmlDeclaration && isTerminator(char, block[index + 1])) {
			let trailing = index + 1;
			while (trailing < block.length && isTrailing(block[trailing])) current += block[trailing++];
			const sentence = current.trim();
			if (sentence) output.push(sentence);
			current = '';
			index = trailing;
			continue;
		}
		index++;
	}
	const rest = current.trim();
	if (rest) output.push(rest);
	return output;
}

function splitInternal(
	markdown: string,
	options: Partial<MarkdownReaderOptions> | undefined,
	prefixMode: boolean,
): string[] {
	return parseReadableBlocks(markdown, options, prefixMode)
		.flatMap((block) => splitBlock(block.text));
}

export function splitIntoSpeechSentences(
	markdown: string,
	options?: Partial<MarkdownReaderOptions>,
	timing?: Partial<SpeechTimingOptions>,
): SpeechSentence[] {
	const resolvedTiming: SpeechTimingOptions = {
		paragraphPauseMs: Number.isFinite(timing?.paragraphPauseMs)
			? Math.max(0, timing?.paragraphPauseMs ?? 0)
			: DEFAULT_SPEECH_TIMING_OPTIONS.paragraphPauseMs,
		headingPauseMs: Number.isFinite(timing?.headingPauseMs)
			? Math.max(0, timing?.headingPauseMs ?? 0)
			: DEFAULT_SPEECH_TIMING_OPTIONS.headingPauseMs,
	};
	const blocks = parseReadableBlocks(markdown, options, false);
	return blocks.flatMap((block, blockIndex) => {
		const sentences = splitBlock(block.text).map((text) => ({ text, pauseAfterMs: 0 }));
		const last = sentences[sentences.length - 1];
		// 停頓是兩個可讀區塊間的節奏；最後一塊不延遲完成事件或資料夾下一篇。
		if (!last || blockIndex === blocks.length - 1) return sentences;
		if (block.kind === 'heading' || block.kind === 'callout') {
			last.pauseAfterMs = Math.max(last.pauseAfterMs, resolvedTiming.headingPauseMs);
		}
		if (block.paragraphBreakAfter) {
			last.pauseAfterMs = Math.max(last.pauseAfterMs, resolvedTiming.paragraphPauseMs);
		}
		return sentences;
	});
}

function cursorEndsAfterSkippedInlineMetadata(
	prefix: string,
	options: Partial<MarkdownReaderOptions> | undefined,
): boolean {
	const lines = prefix.split(/\r?\n/);
	const line = lines[lines.length - 1] ?? '';
	if (/(?:^|\s)\^[A-Za-z0-9-]+\s*$/.test(line)) return true;
	if (/!\[\[[^\r\n]*(?:\]\])?\s*$/.test(line)) return true;
	if (/!\[[^\]\r\n]*\]\([^\r\n)]*\)\s*$/.test(line)) return true;
	if (/(?:\[\^[^\]\r\n]*(?:\])?|\^\[[^\]\r\n]*(?:\])?)\s*$/.test(line)) return true;
	const obsidianCommentTokens = line.match(/%%/g)?.length ?? 0;
	if (obsidianCommentTokens % 2 === 1 || /%%[^\r\n]*%%\s*$/.test(line)) return true;
	if (line.lastIndexOf('<!--') > line.lastIndexOf('-->') || /<!--[\s\S]*-->\s*$/.test(line)) return true;
	if (/\[![^\]\r\n]*(?:\])?[+-]?\s*$/.test(line)) return true;
	if (!options?.readBareUrls && /https?:\/\/[^\s<>()]*\s*$/i.test(line)) return true;
	if (!options?.readMath && /\$(?!\s)[^$\r\n]*\$\s*$/.test(line)) return true;
	return false;
}

export function splitIntoSentences(
	markdown: string,
	options?: Partial<MarkdownReaderOptions>,
): string[] {
	return splitInternal(markdown, options, false);
}

export function sentenceIndexForPrefix(
	prefix: string,
	options?: Partial<MarkdownReaderOptions>,
): number {
	const blocks = parseReadableBlocks(prefix, options, true);
	const sentenceCount = blocks.flatMap((block) => splitBlock(block.text)).length;
	const cursorLine = prefix.split(/\r?\n/).length - 1;
	const cursorLineHasReadableText = blocks.some((block) => block.sourceLine === cursorLine);
	const cursorAfterSkippedMetadata = cursorEndsAfterSkippedInlineMetadata(prefix, options);
	return Math.max(0, sentenceCount - (cursorLineHasReadableText && !cursorAfterSkippedMetadata ? 1 : 0));
}
