export interface CloudVoice {
	id: string;
	label: string;
	language: 'zh' | 'en';
}

/**
 * 雲端語音刻意採精選清單：中文（台灣／大陸／香港）完整在前，英文在後。
 * 排除方言、卡通與角色音，避免一般知識庫出現難以挑選的冷門長清單。
 */
export const CLOUD_VOICES: readonly CloudVoice[] = [
	{ id: 'zh-TW-HsiaoChenNeural', label: '曉臻（台灣・女）', language: 'zh' },
	{ id: 'zh-TW-HsiaoYuNeural', label: '曉雨（台灣・女）', language: 'zh' },
	{ id: 'zh-TW-YunJheNeural', label: '雲哲（台灣・男）', language: 'zh' },
	{ id: 'zh-CN-XiaoxiaoNeural', label: '曉曉（大陸・女）', language: 'zh' },
	{ id: 'zh-CN-YunyangNeural', label: '雲揚（大陸・男）', language: 'zh' },
	{ id: 'zh-CN-YunjianNeural', label: '雲健（大陸・男）', language: 'zh' },
	{ id: 'zh-HK-HiuGaaiNeural', label: '曉佳（香港・女）', language: 'zh' },
	{ id: 'zh-HK-HiuMaanNeural', label: '曉曼（香港・女）', language: 'zh' },
	{ id: 'zh-HK-WanLungNeural', label: '雲龍（香港・男）', language: 'zh' },
	{ id: 'en-US-AvaMultilingualNeural', label: 'Ava（英文・女）', language: 'en' },
	{ id: 'en-US-AndrewMultilingualNeural', label: 'Andrew（英文・男）', language: 'en' },
	{ id: 'en-US-JennyNeural', label: 'Jenny（英文・女）', language: 'en' },
	{ id: 'en-US-GuyNeural', label: 'Guy（英文・男）', language: 'en' },
];

export function cloudVoiceOptions(): Record<string, string> {
	return Object.fromEntries(CLOUD_VOICES.map((voice) => [voice.id, voice.label]));
}
