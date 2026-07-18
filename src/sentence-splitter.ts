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

/** 移除一行的 markdown 語法符號,回傳可讀純文字(可能為空字串)。 */
function cleanLine(rawLine: string): string {
	let s = rawLine.trim();
	if (s === '') return '';

	// 水平線 / 表格分隔列 → 丟棄
	if (/^(-{3,}|\*{3,}|_{3,})$/.test(s)) return '';
	if (/^\|?[\s:\-|]+\|?$/.test(s) && s.includes('-')) return '';

	// 區塊級前綴
	s = s.replace(/^(>\s?)+/, ''); // 引用
	s = s.replace(/^#{1,6}\s+/, ''); // 標題
	s = s.replace(/^[-*+]\s+\[[ xX]\]\s+/, ''); // 待辦核取方塊(需早於清單符號)
	s = s.replace(/^[-*+]\s+/, ''); // 無序清單
	s = s.replace(/^\d+\.\s+/, ''); // 有序清單

	// 表格內容列(僅限行首為 | ,避免誤傷 wikilink 別名或行內的 | )
	if (/^\|/.test(s)) {
		s = s.replace(/^\|/, '').replace(/\|$/, '').replace(/\|/g, ' ');
	}

	// 行內語法
	s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ''); // 圖片(先於連結)
	s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // 連結 → 文字
	s = s.replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
		// wikilink:有別名取別名,否則取頁名(去掉 #標題)
		if (inner.includes('|')) return inner.split('|').pop() ?? '';
		return inner.split('#')[0];
	});
	s = s.replace(/(\*\*|__|~~|==)/g, ''); // 成對強調符號
	s = s.replace(/[*_`]/g, ''); // 殘留單一強調 / 行內碼

	return s.replace(/\s+/g, ' ').trim();
}

/**
 * markdown 純文字 → 句子陣列。
 * @param markdown 筆記內容(可含 frontmatter、程式碼區塊、markdown 語法)
 */
export function splitIntoSentences(markdown: string): string[] {
	if (!markdown) return [];

	let text = markdown;
	// 去 YAML frontmatter(僅限檔首)
	text = text.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '');
	// 去圍欄程式碼區塊(不朗讀程式碼)
	text = text.replace(/```[\s\S]*?```/g, '');
	text = text.replace(/~~~[\s\S]*?~~~/g, '');

	const sentences: string[] = [];
	for (const rawLine of text.split('\n')) {
		const cleaned = cleanLine(rawLine);
		if (cleaned) sentences.push(...splitBlock(cleaned));
	}
	return sentences;
}
