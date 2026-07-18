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
