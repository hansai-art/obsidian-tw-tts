/**
 * 把 markdown 筆記切成「可朗讀的句子」陣列。
 *
 * 設計目標:純函數、無 Obsidian 依賴、可單元測試。
 * 流程:去 frontmatter/程式碼區塊 → 逐行做區塊級清理(標題/清單/引用/表格)
 *      → 行內清理(粗體/連結/wikilink/行內碼) → 依中英文句末標點切句。
 * 每一行(區塊)自成邊界,所以標題、清單項各自成為獨立句子。
 */

const FULL_TERMINATORS = '。！？；';
const CLOSERS = new Set([
	'」', '』', '）', '】', '》', '〉', '”', '’', '"', "'", ')', ']', '}',
]);

/** 判斷某字元是否為句末標點(需要下一個字元判斷半形句點是否為小數點)。 */
function isTerminator(ch: string, next: string | undefined): boolean {
	if (FULL_TERMINATORS.includes(ch)) return true;
	if (ch === '!' || ch === '?') return true;
	if (ch === '.') {
		// 半形句點:只有後面接空白 / 結尾 / 收尾括號才算句末,避免切斷 3.14、U.S.A
		if (next === undefined) return true;
		if (/\s/.test(next)) return true;
		if (CLOSERS.has(next)) return true;
		return false;
	}
	return false;
}

/** 收尾時可一起吸附進同一句的字元(連續標點與收尾括號)。 */
function isTrailing(ch: string): boolean {
	return (
		FULL_TERMINATORS.includes(ch) ||
		ch === '!' ||
		ch === '?' ||
		ch === '.' ||
		CLOSERS.has(ch)
	);
}

/** 把單一區塊(已清理的一行)切成句子。 */
function splitBlock(block: string): string[] {
	const out: string[] = [];
	let cur = '';
	let i = 0;
	const n = block.length;
	while (i < n) {
		const ch = block[i];
		cur += ch;
		if (isTerminator(ch, block[i + 1])) {
			let j = i + 1;
			// 吸附後面連續的標點與收尾括號(例:?! 或 。」)
			while (j < n && isTrailing(block[j])) {
				cur += block[j];
				j++;
			}
			const s = cur.trim();
			if (s) out.push(s);
			cur = '';
			i = j;
			continue;
		}
		i++;
	}
	const rest = cur.trim();
	if (rest) out.push(rest);
	return out;
}

const PRESENTATION_TAGS = new Set(['mark', 'font']);
const INLINE_CODE_END = '\uE001';

/** 暫存 inline code，避免技術筆記裡的 `<mark>` 被當成顯示標籤移除。 */
function protectInlineCode(input: string): { text: string; spans: string[]; marker: string } {
	const spans: string[] = [];
	let marker = '\uE000TWTTSCODE';
	while (input.includes(marker)) marker += 'X';
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
		const code = input.slice(runEnd, closing);
		const spanIndex = spans.push(code) - 1;
		text += `${marker}${spanIndex}${INLINE_CODE_END}`;
		index = closing + delimiter.length;
	}
	return { text, spans, marker };
}

function restoreInlineCode(input: string, spans: string[], marker: string): string {
	let output = input;
	for (let index = 0; index < spans.length; index++) {
		output = output.replace(`${marker}${index}${INLINE_CODE_END}`, spans[index]);
	}
	return output;
}

/**
 * 只移除已確認的顯示型 HTML tags，保留 inner text 與其他技術內容。
 * 逐字尋找 closing `>`，避免 attribute 引號內的 `>` 讓 regex 提早結束。
 */
function stripPresentationHtml(input: string): string {
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
		while (cursor < input.length && /[A-Za-z]/.test(input[cursor])) cursor++;
		const tagName = input.slice(nameStart, cursor).toLowerCase();
		if (!PRESENTATION_TAGS.has(tagName) || !/[\s/>]/.test(input[cursor] ?? '')) {
			output += input[index++];
			continue;
		}

		let quote: '"' | "'" | null = null;
		let end = cursor;
		for (; end < input.length; end++) {
			const ch = input[end];
			if (quote) {
				if (ch === quote) quote = null;
				continue;
			}
			if (ch === '"' || ch === "'") {
				quote = ch;
				continue;
			}
			if (ch === '>') break;
		}
		if (end >= input.length) {
			output += input.slice(index);
			break;
		}
		index = end + 1;
	}
	return output;
}

/** 移除一行的 markdown 語法符號,回傳可讀純文字(可能為空字串)。 */
function cleanLine(rawLine: string, prefixMode = false): string {
	let s = rawLine.trim();
	if (s === '') return '';
	const isBlockquote = /^(>\s?)+/.test(s);

	// 水平線 / 表格分隔列 → 丟棄
	if (/^(-{3,}|\*{3,}|_{3,})$/.test(s)) return '';
	if (/^\|?[\s:\-|]+\|?$/.test(s) && s.includes('-')) return '';

	// 區塊級前綴
	s = s.replace(/^(>\s?)+/, ''); // 引用
	if (isBlockquote) {
		if (prefixMode && /^\[![^\]\r\n]*$/.test(s)) return ''; // 游標尚在 Callout directive 內
		s = s.replace(/^\[![^\]\r\n]+\][+-]?(?:\s+|$)/, ''); // Callout metadata
	}
	s = s.replace(/^#{1,6}\s+/, ''); // 標題
	s = s.replace(/^[-*+]\s+\[[ xX]\]\s+/, ''); // 待辦核取方塊(需早於清單符號)
	s = s.replace(/^[-*+]\s+/, ''); // 無序清單
	s = s.replace(/^\d+\.\s+/, ''); // 有序清單

	// 表格內容列(僅限行首為 | ,避免誤傷 wikilink 別名或行內的 | )
	if (/^\|/.test(s)) {
		s = s.replace(/^\|/, '').replace(/\|$/, '').replace(/\|/g, ' ');
	}

	// 行內語法；先保護 inline code，再移除 Highlightr 的顯示型 HTML。
	if (prefixMode) {
		// 游標可能落在 closing tag 中間；不可把截斷的 metadata 算成新句。
		s = s.replace(/<\/(?:m(?:a(?:r(?:k)?)?)?|f(?:o(?:n(?:t)?)?)?)[^>]*$/i, '');
	}
	const protectedCode = protectInlineCode(s);
	s = stripPresentationHtml(protectedCode.text);
	s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ''); // 圖片(先於連結)
	s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // 連結 → 文字
	s = s.replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
		// wikilink:有別名取別名,否則取頁名(去掉 #標題)
		if (inner.includes('|')) return inner.split('|').pop() ?? '';
		return inner.split('#')[0];
	});
	s = s.replace(/(\*\*|__|~~|==)/g, ''); // 成對強調符號
	s = s.replace(/[*_`]/g, ''); // 殘留單一強調 / 行內碼
	s = restoreInlineCode(s, protectedCode.spans, protectedCode.marker);
	// Callout type 一律視為不朗讀的 metadata；即使出現在正文或 inline code 範例也移除。
	// 緊鄰中文標點時一併清掉 token 前的空白，避免產生「略過 、」的閱讀文字。
	s = s.replace(/\s*\[![^\]\r\n]+\][+-]?(?=[，。！？；、：])/g, '');
	s = s.replace(/\[![^\]\r\n]+\][+-]?/g, '');

	return s.replace(/\s+/g, ' ').trim();
}

/**
 * markdown 純文字 → 句子陣列。
 * @param markdown 筆記內容(可含 frontmatter、程式碼區塊、markdown 語法)
 */
function splitIntoSentencesInternal(markdown: string, prefixMode: boolean): string[] {
	if (!markdown) return [];

	let text = markdown;
	// 去 YAML frontmatter(僅限檔首)
	text = text.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '');
	// 去圍欄程式碼區塊(不朗讀程式碼)
	text = text.replace(/```[\s\S]*?```/g, '');
	text = text.replace(/~~~[\s\S]*?~~~/g, '');

	const sentences: string[] = [];
	for (const rawLine of text.split('\n')) {
		const cleaned = cleanLine(rawLine, prefixMode);
		if (cleaned) sentences.push(...splitBlock(cleaned));
	}
	return sentences;
}

export function splitIntoSentences(markdown: string): string[] {
	return splitIntoSentencesInternal(markdown, false);
}

/**
 * 「從游標處開始唸」用:給游標前的內容,回傳該從第幾句開始。
 * splitter 是逐行、會剝 markdown,無法精準對字元 offset,
 * 因此以「游標前的句數」推算游標所在句 = max(0, 句數 - 1)。
 */
export function sentenceIndexForPrefix(prefix: string): number {
	return Math.max(0, splitIntoSentencesInternal(prefix, true).length - 1);
}
