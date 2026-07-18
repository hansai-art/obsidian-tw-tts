/**
 * 推測語音性別(純函數,可測試)。
 *
 * Web Speech API 不提供性別欄位,只能用已知語音名稱對照。
 * 涵蓋 macOS / Windows / iOS / Android / Edge 常見中文語音;未收錄者回 'unknown'。
 */

export type VoiceGender = 'male' | 'female' | 'unknown';

// 名稱(小寫)包含以下任一 token 即判定性別。女性優先比對。
const FEMALE_TOKENS = [
	'meijia', 'mei-jia', '美佳',
	'tingting', 'ting-ting', '婷婷',
	'sinji', 'sin-ji', '善怡',
	'xiaoxiao', 'xiaoyi', 'xiaobei', 'xiaoni',
	'hsiaochen', 'hsiaoyu', '曉臻', '曉雨',
	'hanhan', 'yating', 'huihui', 'yaoyao', 'nannan',
	'grandma', 'sandy', 'shelley', 'flo',
];

const MALE_TOKENS = [
	'grandpa', 'reed', 'rocko',
	'yunjhe', '雲哲', 'yunxi', 'yunjian', 'yunyang',
	'zhiwei', 'kangkang', 'danny', 'wanlung', '雲龍',
];

export function voiceGender(voice: { name: string }): VoiceGender {
	const n = (voice.name || '').toLowerCase();
	if (FEMALE_TOKENS.some((t) => n.includes(t))) return 'female';
	if (MALE_TOKENS.some((t) => n.includes(t))) return 'male';
	return 'unknown';
}
