/** Pure Markdown/Obsidian-to-readable-block parser used by every playback path. */
import { extractEmphasizedText, naturalizeMath, naturalizeTableRow } from './traditional-reading';

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
	paragraphBreakAfter?: boolean;
}

export interface MarkdownReaderOptions {
	readStandaloneTags: boolean;
	readBareUrls: boolean;
	readMath: boolean;
	readTaskStatus: boolean;
	readFoldedCalloutContent: boolean;
	naturalizeMath: boolean;
	naturalizeTables: boolean;
	keyPointsOnly: boolean;
}

export const DEFAULT_MARKDOWN_READER_OPTIONS: MarkdownReaderOptions = {
	readStandaloneTags: false,
	readBareUrls: false,
	readMath: false,
	readTaskStatus: false,
	readFoldedCalloutContent: true,
	naturalizeMath: false,
	naturalizeTables: false,
	keyPointsOnly: false,
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
			const fence = firstLine.match(/^\s{0,3}(?:>\s*)*(`{3,}|~{3,})/);
			if (fence) {
				const char = fence[1][0];
				const length = fence[1].length;
				let fenceEnd = firstLineEnd;
				let cursor = lineEnd < 0 ? input.length : lineEnd + 1;
				while (cursor < input.length) {
					const nextEnd = input.indexOf('\n', cursor);
					const currentEnd = nextEnd < 0 ? input.length : nextEnd;
					const candidate = input.slice(cursor, currentEnd).trim().replace(/^(?:>\s*)+/, '');
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

function transformInlineMath(
	input: string,
	readMath: boolean,
	naturalize: boolean,
	prefixMode: boolean,
	escaped: ProtectedText,
): string {
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
		if (readMath) {
			const math = input.slice(index + 1, close);
			output += naturalize ? naturalizeMath(restoreProtected(math, escaped)) : math;
		}
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
	text = transformInlineMath(text, options.readMath, options.naturalizeMath, prefixMode, escaped);
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
	const cells = tableCells(line);
	return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function tableCells(line: string): string[] {
	const source = line.trim().replace(/^\|/, '').replace(/\|$/, '');
	const cells: string[] = [];
	let cell = '';
	let inCode = false;
	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (char === '\\' && source[index + 1] === '|') {
			cell += '|';
			index++;
		} else if (char === '`') {
			inCode = !inCode;
			cell += char;
		} else if (char === '|' && !inCode) {
			cells.push(cell.trim());
			cell = '';
		} else {
			cell += char;
		}
	}
	cells.push(cell.trim());
	return cells;
}

function tableText(line: string): string {
	return tableCells(line).join('，');
}

function frontmatterEnd(lines: string[]): number {
	if (lines[0]?.trim() !== '---') return -1;
	for (let index = 1; index < lines.length; index++) {
		if (lines[index].trim() === '---') return index;
	}
	return -1;
}

interface SourceLine {
	content: string;
	quoteDepth: number;
	sourceLine: number;
	trimmed: string;
}

interface CalloutState {
	depth: number;
	skipBody: boolean;
}

function unwrapQuoteLine(rawLine: string, sourceLine: number): SourceLine {
	let content = rawLine;
	let quoteDepth = 0;
	while (true) {
		const marker = content.match(/^ {0,3}>[ \t]?/);
		if (!marker) break;
		content = content.slice(marker[0].length);
		quoteDepth++;
	}
	return { content, quoteDepth, sourceLine, trimmed: content.trim() };
}

function hasFenceCloser(
	lines: SourceLine[],
	start: number,
	char: string,
	length: number,
	quoteDepth: number,
): boolean {
	for (let index = start + 1; index < lines.length; index++) {
		if (lines[index].quoteDepth < quoteDepth) return false;
		if (lines[index].quoteDepth !== quoteDepth) continue;
		const closing = lines[index].trimmed.match(/^(`+|~+)\s*$/);
		if (closing && closing[1][0] === char && closing[1].length >= length) return true;
	}
	return false;
}

function hasMathBlockCloser(lines: SourceLine[], start: number, quoteDepth: number): boolean {
	for (let index = start + 1; index < lines.length; index++) {
		if (lines[index].quoteDepth < quoteDepth) return false;
		if (lines[index].quoteDepth === quoteDepth && lines[index].trimmed === '$$') return true;
	}
	return false;
}

function isThematicBreak(line: string): boolean {
	const compact = line.trim().replace(/[ \t]/g, '');
	return /^(-{3,}|\*{3,}|_{3,})$/.test(compact);
}

function taskStatusLabel(status: string): string {
	if (status === ' ') return '未完成';
	if (status.toLowerCase() === 'x') return '已完成';
	if (status === '-') return '已取消';
	if (status === '/') return '進行中';
	if (status === '>') return '已延後';
	if (status === '<') return '已排程';
	if (status === '!') return '重要';
	if (status === '?') return '有疑問';
	return '已標記';
}

function markParagraphBreak(blocks: ReadableBlock[]): void {
	const previous = blocks[blocks.length - 1];
	if (previous) previous.paragraphBreakAfter = true;
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
	const rawLines = source.split(/\r?\n/);
	const lines = rawLines.map(unwrapQuoteLine);
	const yamlEnd = frontmatterEnd(rawLines);
	const unfinishedPrefixFrontmatter = prefixMode && rawLines[0]?.trim() === '---' && yamlEnd < 0;
	const blocks: ReadableBlock[] = [];
	const callouts: CalloutState[] = [];
	let fence: { char: string; length: number; quoteDepth: number } | null = null;
	let mathBlock: { quoteDepth: number } | null = null;
	let footnoteContinuation: { quoteDepth: number } | null = null;

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const { content, quoteDepth, sourceLine, trimmed } = line;
		if (unfinishedPrefixFrontmatter) continue;
		if (yamlEnd >= 0 && sourceLine <= yamlEnd) continue;

		if (fence) {
			if (quoteDepth >= fence.quoteDepth) {
				const closing = quoteDepth === fence.quoteDepth
					? trimmed.match(/^(`+|~+)\s*$/)
					: null;
				if (closing && closing[1][0] === fence.char && closing[1].length >= fence.length) fence = null;
				continue;
			}
			fence = null;
		}

		if (mathBlock) {
			if (quoteDepth >= mathBlock.quoteDepth) {
				if (quoteDepth === mathBlock.quoteDepth && trimmed === '$$') {
					mathBlock = null;
					continue;
				}
				if (resolved.readMath && trimmed) {
					const normalized = normalizeInline(content, { ...resolved, readMath: true }, prefixMode);
					const text = resolved.naturalizeMath ? naturalizeMath(normalized) : normalized;
					if (text) blocks.push({ text, kind: quoteDepth > 0 ? 'quote' : 'paragraph', sourceLine });
				}
				continue;
			}
			mathBlock = null;
		}

		if (footnoteContinuation) {
			if (quoteDepth === footnoteContinuation.quoteDepth && /^(?: {4}|\t)/.test(content)) continue;
			footnoteContinuation = null;
		}

		while (callouts.length > 0 && quoteDepth < callouts[callouts.length - 1].depth) callouts.pop();
		if (prefixMode && /^\[![^\]\r\n]*$/.test(trimmed)) continue;
		const directive = quoteDepth > 0
			? trimmed.match(/^\[!([^\]\r\n]+)\]([+-])?(?:[ \t]+(.*)|$)/)
			: null;
		if (directive) {
			while (callouts.length > 0 && quoteDepth <= callouts[callouts.length - 1].depth) callouts.pop();
			const hiddenByAncestor = callouts.some((callout) => callout.skipBody);
			const skipBody = hiddenByAncestor
				|| (directive[2] === '-' && !resolved.readFoldedCalloutContent);
			callouts.push({ depth: quoteDepth, skipBody });
			if (!hiddenByAncestor) {
				const title = normalizeInline(directive[3] ?? '', resolved, prefixMode);
				if (title) blocks.push({ text: title, kind: 'callout', sourceLine });
			}
			continue;
		}
		if (callouts.some((callout) => callout.skipBody && quoteDepth >= callout.depth)) continue;
		if (!trimmed) {
			markParagraphBreak(blocks);
			continue;
		}

		const openingFence = trimmed.match(/^(`{3,}|~{3,})(?:[^`~].*)?$/);
		if (openingFence) {
			const char = openingFence[1][0];
			const length = openingFence[1].length;
			if (prefixMode || hasFenceCloser(lines, index, char, length, quoteDepth)) {
				fence = { char, length, quoteDepth };
				continue;
			}
		}

		if (trimmed === '$$') {
			if (prefixMode || hasMathBlockCloser(lines, index, quoteDepth)) {
				mathBlock = { quoteDepth };
				continue;
			}
			blocks.push({ text: '$$', kind: quoteDepth > 0 ? 'quote' : 'paragraph', sourceLine });
			continue;
		}
		const singleLineMath = trimmed.match(/^\$\$(.+)\$\$$/);
		if (singleLineMath) {
			if (resolved.readMath) blocks.push({ text: singleLineMath[1].trim(), kind: quoteDepth > 0 ? 'quote' : 'paragraph', sourceLine });
			continue;
		}

		if (/^\[\^[^\]]+\]:/.test(trimmed)) {
			footnoteContinuation = { quoteDepth };
			continue;
		}
		if (isThematicBreak(trimmed)) continue;

		const heading = trimmed.match(/^(#{1,6})(?:[ \t]+|$)(.*)$/);
		if (heading) {
			const body = heading[2].replace(/[ \t]+#+[ \t]*$/, '').trim();
			const text = normalizeInline(body, resolved, prefixMode);
			if (text) blocks.push({ text, kind: 'heading', sourceLine, headingLevel: heading[1].length });
			continue;
		}

		const list = trimmed.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.*)$/);
		if (list) {
			let body = list[1];
			const task = body.match(/^\[([^\]\r\n])\](?:[ \t]+|$)(.*)$/);
			if (task) {
				body = `${resolved.readTaskStatus ? `${taskStatusLabel(task[1])}，` : ''}${task[2]}`;
			}
			const text = normalizeInline(body, resolved, prefixMode);
			if (text) blocks.push({ text, kind: 'list', sourceLine });
			continue;
		}

		if (isTableSeparator(trimmed)) continue;
		const hasOuterPipes = /^\|.*\|$/.test(trimmed);
		const startsPipeTable = index + 1 < lines.length
			&& lines[index + 1].quoteDepth === quoteDepth
			&& trimmed.includes('|')
			&& isTableSeparator(lines[index + 1].trimmed);
		const previousIsSeparator = trimmed.includes('|') && index > 0
			&& lines[index - 1].quoteDepth === quoteDepth
			&& isTableSeparator(lines[index - 1].trimmed);
		if (hasOuterPipes || startsPipeTable || previousIsSeparator) {
			let readableTable = tableText(trimmed);
			if (resolved.naturalizeTables && startsPipeTable) {
				readableTable = `欄位：${tableCells(trimmed).join('、')}`;
			} else if (resolved.naturalizeTables && previousIsSeparator && index >= 2) {
				readableTable = naturalizeTableRow(tableCells(lines[index - 2].trimmed), tableCells(trimmed));
			}
			const text = normalizeInline(readableTable, resolved, prefixMode);
			if (text) blocks.push({ text, kind: 'table', sourceLine });
			continue;
		}

		if (STANDALONE_TAGS.test(trimmed)) {
			if (!resolved.readStandaloneTags) continue;
			const text = trimmed.split('#').join('').split('/').join(' ').replace(/\s+/g, ' ').trim();
			if (text) blocks.push({ text, kind: quoteDepth > 0 ? 'quote' : 'paragraph', sourceLine });
			continue;
		}

		const text = normalizeInline(content, resolved, prefixMode);
		if (text) blocks.push({ text, kind: quoteDepth > 0 ? 'quote' : 'paragraph', sourceLine });
	}
	let result = blocks;
	if (resolved.keyPointsOnly) {
		result = result.flatMap((block) => {
			if (block.kind === 'heading' || block.kind === 'callout') return [block];
			const emphasized = extractEmphasizedText(rawLines[block.sourceLine] ?? '');
			const text = normalizeInline(emphasized, resolved, prefixMode);
			return text ? [{ ...block, text }] : [];
		});
	}
	return result;
}
