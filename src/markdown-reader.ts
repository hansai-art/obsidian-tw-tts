/** Pure Markdown/Obsidian-to-readable-block parser used by every playback path. */

export type ReadableBlockKind =
	| 'heading'
	| 'paragraph'
	| 'list'
	| 'quote'
	| 'callout'
	| 'table';

export interface ReadableBlock {
	text: string;
	kind: ReadableBlockKind;
	sourceLine: number;
	headingLevel?: number;
}

export interface MarkdownReaderOptions {
	readStandaloneTags: boolean;
	readBareUrls: boolean;
	readMath: boolean;
}

export const DEFAULT_MARKDOWN_READER_OPTIONS: MarkdownReaderOptions = {
	readStandaloneTags: false,
	readBareUrls: false,
	readMath: false,
};

interface ProtectedText {
	text: string;
	values: string[];
	marker: string;
}

const CODE_END = '\uE001';
const TAG_PATTERN = '#[\\p{L}\\p{N}_-]+(?:/[\\p{L}\\p{N}_-]+)*';
const STANDALONE_TAGS = new RegExp(`^(?:${TAG_PATTERN})(?:\\s+${TAG_PATTERN})*$`, 'u');
const INLINE_TAG = new RegExp(`(^|[\\s（(「『【，。！？；、：])#([\\p{L}\\p{N}_-]+(?:/[\\p{L}\\p{N}_-]+)*)`, 'gu');

function uniqueMarker(input: string, base: string): string {
	let marker = base;
	while (input.includes(marker)) marker += 'X';
	return marker;
}

function protectEscapes(input: string): ProtectedText {
	const marker = uniqueMarker(input, '\uE010TWTTSESC');
	const values: string[] = [];
	const text = input.replace(/\\(.)/gs, (_match, value: string) =>
		`${marker}${values.push(value) - 1}${CODE_END}`);
	return { text, values, marker };
}

function protectInlineCode(input: string): ProtectedText {
	const marker = uniqueMarker(input, '\uE000TWTTSCODE');
	const values: string[] = [];
	let text = '';
	let index = 0;
	while (index < input.length) {
		if (input[index] !== '`') {
			text += input[index++];
			continue;
		}
		let runEnd = index;
		while (input[runEnd] === '`') runEnd++;
		const delimiter = input.slice(index, runEnd);
		let closing = input.indexOf(delimiter, runEnd);
		while (closing >= 0 && (input[closing - 1] === '`' || input[closing + delimiter.length] === '`')) {
			closing = input.indexOf(delimiter, closing + 1);
		}
		if (closing < 0) {
			text += delimiter;
			index = runEnd;
			continue;
		}
		text += `${marker}${values.push(input.slice(runEnd, closing)) - 1}${CODE_END}`;
		index = closing + delimiter.length;
	}
	return { text, values, marker };
}

function restoreProtected(input: string, protectedText: ProtectedText): string {
	let output = input;
	for (let index = 0; index < protectedText.values.length; index++) {
		output = output.split(`${protectedText.marker}${index}${CODE_END}`).join(protectedText.values[index]);
	}
	return output;
}

/** Removes known comments while leaving fenced and inline code untouched. */
function stripDelimitedComments(
	input: string,
	open: string,
	close: string,
	prefixMode: boolean,
	collapsePadding: boolean,
): string {
	let output = '';
	let index = 0;
	while (index < input.length) {
		const atLineStart = index === 0 || input[index - 1] === '\n';
		if (atLineStart) {
			const lineEnd = input.indexOf('\n', index);
			const firstLineEnd = lineEnd < 0 ? input.length : lineEnd;
			const firstLine = input.slice(index, firstLineEnd);
			const fence = firstLine.match(/^\s{0,3}(`{3,}|~{3,})/);
			if (fence) {
				const char = fence[1][0];
				const length = fence[1].length;
				let fenceEnd = firstLineEnd;
				let cursor = lineEnd < 0 ? input.length : lineEnd + 1;
				while (cursor < input.length) {
					const nextEnd = input.indexOf('\n', cursor);
					const currentEnd = nextEnd < 0 ? input.length : nextEnd;
					const candidate = input.slice(cursor, currentEnd).trim();
					const closing = candidate.match(/^(`+|~+)\s*$/);
					fenceEnd = currentEnd;
					if (closing && closing[1][0] === char && closing[1].length >= length) break;
					cursor = nextEnd < 0 ? input.length : nextEnd + 1;
				}
				output += input.slice(index, fenceEnd);
				index = fenceEnd;
				continue;
			}
		}

		if (input[index] === '`') {
			let runEnd = index;
			while (input[runEnd] === '`') runEnd++;
			const delimiter = input.slice(index, runEnd);
			const closing = input.indexOf(delimiter, runEnd);
			if (closing >= 0) {
				const end = closing + delimiter.length;
				output += input.slice(index, end);
				index = end;
				continue;
			}
		}

		if (!input.startsWith(open, index)) {
			output += input[index++];
			continue;
		}
		const end = input.indexOf(close, index + open.length);
		if (end < 0) {
			if (!prefixMode) return output + input.slice(index);
			output += input.slice(index).replace(/[^\r\n]/g, '');
			return output;
		}
		let afterIndex = end + close.length;
		if (collapsePadding && /\s$/.test(output) && /^\s/.test(input.slice(afterIndex))) {
			while (output.endsWith(' ') || output.charCodeAt(output.length - 1) === 9) output = output.slice(0, -1);
			while (input[afterIndex] === ' ' || input.charCodeAt(afterIndex) === 9) afterIndex++;
		}
		output += input.slice(index, afterIndex).replace(/[^\r\n]/g, '');
		index = afterIndex;
	}
	return output;
}

function stripKnownHtml(input: string, prefixMode: boolean): string {
	let output = '';
	let index = 0;
	while (index < input.length) {
		if (input[index] !== '<') {
			output += input[index++];
			continue;
		}
		let cursor = index + 1;
		if (input[cursor] === '/') cursor++;
		const nameStart = cursor;
		while (/[A-Za-z]/.test(input[cursor] ?? '')) cursor++;
		const tagName = input.slice(nameStart, cursor).toLowerCase();
		if (!['mark', 'font', 'br'].includes(tagName) || !/[\s/>]/.test(input[cursor] ?? '')) {
			output += input[index++];
			continue;
		}
		let quote: '"' | "'" | null = null;
		let end = cursor;
		for (; end < input.length; end++) {
			const char = input[end];
			if (quote) {
				if (char === quote) quote = null;
			} else if (char === '"' || char === "'") {
				quote = char;
			} else if (char === '>') {
				break;
			}
		}
		if (end >= input.length) {
			if (prefixMode && /^<\/(?:m(?:a(?:r(?:k)?)?)?|f(?:o(?:n(?:t)?)?)?)/i.test(input.slice(index))) break;
			output += input.slice(index);
			break;
		}
		if (tagName === 'br') output += ' ';
		index = end + 1;
	}
	return output;
}

function transformInlineMath(input: string, readMath: boolean, prefixMode: boolean): string {
	let output = '';
	let index = 0;
	while (index < input.length) {
		if (input[index] !== '$' || /[\s\d]/.test(input[index + 1] ?? '')) {
			output += input[index++];
			continue;
		}
		let close = index + 1;
		while ((close = input.indexOf('$', close)) >= 0) {
			if (!/\s/.test(input[close - 1] ?? '')) break;
			close++;
		}
		if (close < 0) {
			const unfinished = input.slice(index + 1);
			if (prefixMode && !/^\d+(?:\.\d*)?$/.test(unfinished)) break;
			output += input.slice(index);
			break;
		}
		if (readMath) output += input.slice(index + 1, close);
		index = close + 1;
	}
	return output;
}

function transformBareUrls(input: string, readBareUrls: boolean): string {
	if (readBareUrls) return input;
	return input.replace(/https?:\/\/[^\s<>()]+/gi, (url) => {
		const punctuation = url.match(/[.,!?;:，。！？；：]+$/u)?.[0] ?? '';
		return punctuation;
	});
}

function normalizeInline(input: string, options: MarkdownReaderOptions, prefixMode: boolean): string {
	if (prefixMode) {
		input = input.replace(/<\/(?:m(?:a(?:r(?:k)?)?)?|f(?:o(?:n(?:t)?)?)?)[^>]*$/i, '');
	}
	const escaped = protectEscapes(input);
	const code = protectInlineCode(escaped.text);
	let text = code.text;

	if (prefixMode) {
		text = text.replace(/!\[\[[^\]\r\n]*$/, '');
		text = text.replace(/(?:\[\^|\^\[)[^\]\r\n]*$/, '');
	}
	text = text.replace(/!\[\[[^\]]+\]\]/g, '');
	text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
	text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
	text = text.replace(/(\s*)\[\[([^\]]+)\]\]/g, (
		_match,
		leading: string,
		inner: string,
		offset: number,
		sourceText: string,
	) => {
		const alias = inner.lastIndexOf('|');
		const visible = alias >= 0 ? inner.slice(alias + 1) : inner.split('#')[0];
		const previous = sourceText[offset - 1] ?? '';
		const keepLeading = !leading || !/\p{Script=Han}/u.test(previous) || !/^\p{Script=Han}/u.test(visible);
		return `${keepLeading ? leading : ''}${visible}`;
	});
	text = text.replace(/\^\[[^\]]*\]/g, '');
	text = text.replace(/\[\^[^\]]+\]/g, '');
	text = transformInlineMath(text, options.readMath, prefixMode);
	text = transformBareUrls(text, options.readBareUrls);
	text = text.replace(/(?:^|\s)\^[A-Za-z0-9-]+\s*$/, '');
	text = text.replace(INLINE_TAG, (_match, lead: string, tag: string) => `${lead}${tag.split('/').join(' ')}`);
	text = stripKnownHtml(text, prefixMode);
	text = text.replace(/(\*\*|__|~~|==)/g, '');
	text = text.replace(/\*/g, '');
	text = restoreProtected(text, code);
	// Callout type tokens are never spoken, including prose and inline-code examples.
	text = text.replace(/\s*\[![^\]\r\n]+\][+-]?(?=[，。！？；、：])/g, '');
	text = text.replace(/\[![^\]\r\n]+\][+-]?/g, '');
	text = restoreProtected(text, escaped);
	return text.replace(/\s+/g, ' ').trim();
}

function isTableSeparator(line: string): boolean {
	const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
	const cells = trimmed.split('|').map((cell) => cell.trim());
	return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function tableText(line: string): string {
	return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()).join('，');
}

function frontmatterEnd(lines: string[]): number {
	if (lines[0]?.trim() !== '---') return -1;
	for (let index = 1; index < lines.length; index++) {
		if (lines[index].trim() === '---') return index;
	}
	return -1;
}

function hasFenceCloser(lines: string[], start: number, char: string, length: number): boolean {
	for (let index = start + 1; index < lines.length; index++) {
		const closing = lines[index].trim().match(/^(`+|~+)\s*$/);
		if (closing && closing[1][0] === char && closing[1].length >= length) return true;
	}
	return false;
}

function hasMathBlockCloser(lines: string[], start: number): boolean {
	for (let index = start + 1; index < lines.length; index++) {
		if (lines[index].trim() === '$$') return true;
	}
	return false;
}

export function parseReadableBlocks(
	markdown: string,
	options?: Partial<MarkdownReaderOptions>,
	prefixMode = false,
): ReadableBlock[] {
	if (!markdown) return [];
	const resolved = { ...DEFAULT_MARKDOWN_READER_OPTIONS, ...options };
	let source = stripDelimitedComments(markdown, '%%', '%%', prefixMode, true);
	source = stripDelimitedComments(source, '<!--', '-->', prefixMode, false);
	const lines = source.split(/\r?\n/);
	const yamlEnd = frontmatterEnd(lines);
	const unfinishedPrefixFrontmatter = prefixMode && lines[0]?.trim() === '---' && yamlEnd < 0;
	const blocks: ReadableBlock[] = [];
	let fence: { char: string; length: number } | null = null;
	let mathBlock = false;
	let footnoteContinuation = false;

	for (let sourceLine = 0; sourceLine < lines.length; sourceLine++) {
		const rawLine = lines[sourceLine];
		const trimmed = rawLine.trim();
		if (unfinishedPrefixFrontmatter) continue;
		if (yamlEnd >= 0 && sourceLine <= yamlEnd) continue;

		if (fence) {
			const closing = trimmed.match(/^(`+|~+)\s*$/);
			if (closing && closing[1][0] === fence.char && closing[1].length >= fence.length) fence = null;
			continue;
		}
		const openingFence = trimmed.match(/^(`{3,}|~{3,})(?:[^`~].*)?$/);
		if (openingFence) {
			const char = openingFence[1][0];
			const length = openingFence[1].length;
			if (prefixMode || hasFenceCloser(lines, sourceLine, char, length)) {
				fence = { char, length };
				continue;
			}
		}

		if (mathBlock) {
			if (trimmed === '$$') {
				mathBlock = false;
				continue;
			}
			if (resolved.readMath && trimmed) {
				const text = normalizeInline(rawLine, { ...resolved, readMath: true }, prefixMode);
				if (text) blocks.push({ text, kind: 'paragraph', sourceLine });
			}
			continue;
		}
		if (trimmed === '$$') {
			if (prefixMode || hasMathBlockCloser(lines, sourceLine)) {
				mathBlock = true;
				continue;
			}
			blocks.push({ text: '$$', kind: 'paragraph', sourceLine });
			continue;
		}
		const singleLineMath = trimmed.match(/^\$\$(.+)\$\$$/);
		if (singleLineMath) {
			if (resolved.readMath) blocks.push({ text: singleLineMath[1].trim(), kind: 'paragraph', sourceLine });
			continue;
		}

		if (footnoteContinuation) {
			if (/^(?: {4}|\t)/.test(rawLine)) continue;
			footnoteContinuation = false;
		}
		if (/^\[\^[^\]]+\]:/.test(trimmed)) {
			footnoteContinuation = true;
			continue;
		}
		if (!trimmed) continue;
		if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) continue;

		const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
		if (heading) {
			const text = normalizeInline(heading[2], resolved, prefixMode);
			if (text) blocks.push({ text, kind: 'heading', sourceLine, headingLevel: heading[1].length });
			continue;
		}

		const quote = trimmed.match(/^(?:>\s*)+(.+)$/);
		if (quote) {
			let body = quote[1];
			const directive = body.match(/^\[![^\]\r\n]+\][+-]?(?:\s+(.*)|$)/);
			if (prefixMode && /^\[![^\]\r\n]*$/.test(body)) continue;
			if (directive) body = directive[1] ?? '';
			const text = normalizeInline(body, resolved, prefixMode);
			if (text) blocks.push({ text, kind: directive ? 'callout' : 'quote', sourceLine });
			continue;
		}

		const list = trimmed.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.*)$/);
		if (list) {
			const body = list[1].replace(/^\[[^\]\r\n]\]\s+/, '');
			const text = normalizeInline(body, resolved, prefixMode);
			if (text) blocks.push({ text, kind: 'list', sourceLine });
			continue;
		}

		if (isTableSeparator(trimmed)) continue;
		const hasOuterPipes = /^\|.*\|$/.test(trimmed);
		const startsPipeTable = sourceLine + 1 < lines.length && trimmed.includes('|') && isTableSeparator(lines[sourceLine + 1]);
		const previousIsSeparator = sourceLine > 0 && isTableSeparator(lines[sourceLine - 1]);
		if (hasOuterPipes || startsPipeTable || previousIsSeparator) {
			const text = normalizeInline(tableText(trimmed), resolved, prefixMode);
			if (text) blocks.push({ text, kind: 'table', sourceLine });
			continue;
		}

		if (STANDALONE_TAGS.test(trimmed)) {
			if (!resolved.readStandaloneTags) continue;
			const text = trimmed.split('#').join('').split('/').join(' ').replace(/\s+/g, ' ').trim();
			if (text) blocks.push({ text, kind: 'paragraph', sourceLine });
			continue;
		}

		const text = normalizeInline(rawLine, resolved, prefixMode);
		if (text) blocks.push({ text, kind: 'paragraph', sourceLine });
	}
	return blocks;
}
