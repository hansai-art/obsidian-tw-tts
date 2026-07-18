/**
 * 跨平台中文語音品質分級(純函數,可測試)。
 *
 * 各平台(macOS / Windows / iOS / Android / Chrome)的語音清單完全不同,
 * 所以不寫死某支語音,而是用「地區 + 品質分級」排序:
 *   1. 台灣中文優先,其次香港、大陸、其他中文。
 *   2. 同地區內把品質好的排前面(neural / Apple 美佳 / Google / 微軟標準)。
 *   3. 跨地區同名(如 Eddy 台灣 / Eddy 大陸)去重,只留最佳地區那支。
 *   4. 保留大多數語音,只把「角色/機械音」壓到最後,並限制其數量,
 *      讓清單維持在少數幾個好選項(其餘尾巴剔除)。
 */

/** Apple 的角色/特色語音家族(各平台通常品質較差,壓到最後)。 */
const CHARACTER_TOKENS = [
	'eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley',
	'superstar', 'jester', 'trinoids', 'bells', 'boing', 'bubbles', 'wobble',
];

/** 保留的角色音數量上限(其餘尾巴剔除,維持清單精簡)。 */
const MAX_CHARACTER_VOICES = 3;

function normLang(lang: string): string {
	return (lang || '').toLowerCase().replace('_', '-');
}

/** 地區權重:台灣 0、大陸 1、香港 2、其他中文 3、非中文 9。 */
export function regionOrder(lang: string): number {
	const l = normLang(lang);
	if (l.startsWith('zh-tw')) return 0;
	if (l.startsWith('zh-cn') || l.startsWith('zh-sg')) return 1;
	if (l.startsWith('zh-hk') || l.startsWith('zh-mo')) return 2;
	if (l.startsWith('zh')) return 3;
	return 9;
}

/** 顯示用地區標籤。 */
export function regionLabel(lang: string): string {
	switch (regionOrder(lang)) {
		case 0:
			return '台灣';
		case 1:
			return '大陸';
		case 2:
			return '香港';
		case 3:
			return '中文';
		default:
			return lang || '其他';
	}
}

/** 品質分級:數字越小越好。用語音名稱的已知特徵判斷。 */
export function qualityTier(name: string): number {
	const n = (name || '').toLowerCase();
	// 微軟 Edge neural(線上自然語音)/ Apple 旗艦「美佳」= 最佳
	if (n.includes('natural') || n.includes('online')) return 0;
	if (n.includes('meijia') || n.includes('美佳')) return 0;
	// Google / 微軟標準桌面語音 = 良好
	if (n.includes('google') || n.includes('microsoft')) return 1;
	// Apple 角色/機械音 = 墊底
	if (CHARACTER_TOKENS.some((t) => n.includes(t))) return 3;
	// 其他標準語音
	return 2;
}

function isChinese(v: SpeechSynthesisVoice): boolean {
	return normLang(v.lang).startsWith('zh');
}

/** 排序鍵:先地區、再品質、最後名稱(穩定)。 */
function rankOf(v: SpeechSynthesisVoice): [number, number, string] {
	return [regionOrder(v.lang), qualityTier(v.name), (v.name || '').toLowerCase()];
}

function compare(a: SpeechSynthesisVoice, b: SpeechSynthesisVoice): number {
	const [ra, qa, na] = rankOf(a);
	const [rb, qb, nb] = rankOf(b);
	return ra - rb || qa - qb || (na < nb ? -1 : na > nb ? 1 : 0);
}

/**
 * 產出「策展後」的中文語音清單:去重 + 排序 + 剔尾。
 * - 只含中文語音(非中文交由呼叫端以明確指定名稱處理)。
 * - 跨地區同名只留最佳地區那支。
 * - 好語音(tier ≤ 2)全留;角色/機械音最多留 MAX_CHARACTER_VOICES 支。
 */
export function curatedVoices(
	voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice[] {
	const chinese = voices.filter(isChinese);

	// 跨地區同名去重:同一 name 只留排序最佳的一支。
	const bestByName = new Map<string, SpeechSynthesisVoice>();
	for (const v of chinese) {
		const key = (v.name || '').toLowerCase();
		const prev = bestByName.get(key);
		if (!prev || compare(v, prev) < 0) bestByName.set(key, v);
	}

	const sorted = [...bestByName.values()].sort(compare);
	const good = sorted.filter((v) => qualityTier(v.name) <= 2);
	const character = sorted
		.filter((v) => qualityTier(v.name) === 3)
		.slice(0, MAX_CHARACTER_VOICES);
	return [...good, ...character];
}

/**
 * 選出要使用的語音。
 * 1) 使用者明確指定名稱且存在 → 用它(不限語言,尊重使用者選擇)。
 * 2) 否則挑策展清單第一名(目前平台品質最佳的中文語音)。
 * 3) 沒有中文語音 → null(呼叫端提示安裝中文語音)。
 */
export function pickVoice(
	voices: SpeechSynthesisVoice[],
	preferredName?: string,
): SpeechSynthesisVoice | null {
	if (!voices.length) return null;
	if (preferredName) {
		const found = voices.find((v) => v.name === preferredName);
		if (found) return found;
	}
	return curatedVoices(voices)[0] ?? null;
}
