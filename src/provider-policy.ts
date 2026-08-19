/** 支援範圍的唯一正本：中文知識庫只列中文、英文系統語音。 */
export type TtsProvider = 'local' | 'edge';

function normaliseLanguage(language: string): string {
	return language.toLowerCase().replace('_', '-');
}

export function isSupportedSystemVoiceLanguage(language: string): boolean {
	const normalised = normaliseLanguage(language);
	return normalised.startsWith('zh') || normalised.startsWith('en');
}

/** Edge CLI 只能由桌面版 Electron 呼叫本機命令。 */
export function shouldUseEdgeProvider(provider: TtsProvider, isDesktop: boolean): boolean {
	return provider === 'edge' && isDesktop;
}

/** 試聽稿必須符合選定聲音的語言；非英文保守使用中文稿。 */
export function previewLanguage(language: string): 'zh' | 'en' {
	return normaliseLanguage(language).startsWith('en') ? 'en' : 'zh';
}
