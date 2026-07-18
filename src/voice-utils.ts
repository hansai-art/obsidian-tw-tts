/**
 * 語音挑選邏輯(純函數,可測試)。
 * 為中文朗讀而設:預設優先台灣中文語音,其次其他中文語音。
 */

import { voiceGender, type VoiceGender } from './voice-gender';

function rank(v: SpeechSynthesisVoice): number {
	const lang = (v.lang || '').toLowerCase().replace('_', '-');
	if (lang.startsWith('zh-tw')) return 0;
	if (lang.startsWith('zh')) return 1;
	return 2;
}

/** 把語音排序成:台灣中文 → 其他中文 → 其餘;同組維持原順序。 */
export function sortVoicesChineseFirst(
	voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice[] {
	return voices
		.map((v, i) => ({ v, i }))
		.sort((a, b) => rank(a.v) - rank(b.v) || a.i - b.i)
		.map((x) => x.v);
}

function isChinese(v: SpeechSynthesisVoice): boolean {
	return (v.lang || '').toLowerCase().startsWith('zh');
}

/**
 * 選出要使用的語音。
 * 1) 使用者指定名稱且存在 → 用它(不限語言,尊重使用者選擇)
 * 2) 否則挑中文語音(台灣優先);若指定性別偏好,優先挑該性別
 * 3) 都沒有中文語音 → null(交由呼叫端提示使用者安裝中文語音)
 */
export function pickVoice(
	voices: SpeechSynthesisVoice[],
	preferredName?: string,
	genderPreference: VoiceGender | 'any' = 'any',
): SpeechSynthesisVoice | null {
	if (!voices.length) return null;
	if (preferredName) {
		const found = voices.find((v) => v.name === preferredName);
		if (found) return found;
	}
	const chinese = sortVoicesChineseFirst(voices).filter(isChinese);
	if (chinese.length === 0) return null;
	if (genderPreference === 'male' || genderPreference === 'female') {
		const match = chinese.find((v) => voiceGender(v) === genderPreference);
		if (match) return match;
	}
	return chinese[0];
}
