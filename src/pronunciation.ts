/**
 * 發音字典(純函數,可測試)。
 *
 * Web Speech API 唸破音字 / 英文專有名詞常常不準(如 iPAS、臺、GPT)。
 * 這裡讓使用者用「原文=唸法」規則,在送去朗讀前替換文字。
 * 只改「唸的內容」,畫面反白仍顯示原文(替換在 utterance 產生時做)。
 */

export type PronunciationRule = readonly [from: string, to: string];

/**
 * 解析多行規則字串。每行 `原文=唸法`;`#` 開頭為註解;
 * 以第一個 `=` 分割(唸法本身可含 `=`);原文空白則略過。
 */
export function parseRules(raw: string): PronunciationRule[] {
	if (!raw) return [];
	const rules: PronunciationRule[] = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq <= 0) continue; // 沒有 = 或 = 在開頭 → 無效
		const from = trimmed.slice(0, eq).trim();
		const to = trimmed.slice(eq + 1).trim();
		if (!from) continue;
		rules.push([from, to]);
	}
	return rules;
}

/**
 * 解析「不朗讀的符號」設定:以空白分隔的符號清單,轉成「取代為空字串」的規則。
 *
 * 為什麼不叫使用者去發音字典寫 `○=`:那個寫法能用,但沒人找得到(等號右邊留空
 * 不是直覺的介面)。這裡給一個一行填完、不用學語法的欄位。
 *
 * 半形與全形空白都當分隔(JS 的 `\s` 已含全形空格 U+3000,不要另外寫字面全形字元,
 * eslint no-irregular-whitespace 會擋);重複的只留一條;token 可以是多個字元(如 `--`)。
 */
export function parseSilentSymbols(raw: string): PronunciationRule[] {
	if (!raw) return [];
	const seen = new Set<string>();
	const rules: PronunciationRule[] = [];
	for (const token of raw.split(/\s+/)) {
		if (!token || seen.has(token)) continue;
		seen.add(token);
		rules.push([token, '']);
	}
	return rules;
}

/**
 * 套用規則:逐條全域取代(大小寫敏感)。
 * 用 split/join 而非 RegExp,避免原文含正則特殊字元時出錯。
 */
export function applyPronunciation(
	text: string,
	rules: PronunciationRule[],
): string {
	let out = text;
	for (const [from, to] of rules) {
		if (!from) continue;
		out = out.split(from).join(to);
	}
	return out;
}
