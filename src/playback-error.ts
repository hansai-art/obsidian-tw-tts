/**
 * 播放前置檢查:把「無法朗讀」的各種情況對應到「原因 + 解法」的可行動訊息。
 * 純函數,可單元測試;呼叫端負責把結果渲染成窗格內的持久面板。
 *
 * 設計原則(Hans 要求):任何錯誤都要告訴使用者怎麼解,不能只說「不能用」。
 */
import { STRINGS } from './i18n/zh-tw';

/** 目前執行環境的能力旗標(由 window.speechSynthesis 與 Obsidian Platform 推得)。 */
export interface PlaybackEnv {
	/** window.speechSynthesis 是否存在。 */
	hasSpeechApi: boolean;
	/** 是否找得到可用語音。 */
	hasVoice: boolean;
	isAndroid: boolean;
	isIos: boolean;
	isDesktop: boolean;
}

/** 可行動錯誤:標題 + 一到多行解法。 */
export interface ActionableError {
	title: string;
	/** readonly:相容於 STRINGS(as const)的唯讀陣列與動態組出的陣列。 */
	body: readonly string[];
}

/** 依平台選出安裝中文語音的步驟(桌機分不出 mac/win,兩個都給)。 */
function installSteps(env: PlaybackEnv): string[] {
	if (env.isIos) return [STRINGS.installHintIos];
	if (env.isAndroid) return [STRINGS.installHintAndroid];
	if (env.isDesktop) return [STRINGS.installHintMac, STRINGS.installHintWin];
	// 環境不明:全平台步驟都列出來,讓使用者自己對號入座。
	return [
		STRINGS.installHintMac,
		STRINGS.installHintWin,
		STRINGS.installHintIos,
		STRINGS.installHintAndroid,
	];
}

/**
 * 回傳應顯示的錯誤,若可正常播放則回 null。
 * 優先序:沒有語音 API(Android 特例 / 一般)> 有 API 但沒語音。
 */
export function playbackError(env: PlaybackEnv): ActionableError | null {
	if (!env.hasSpeechApi) {
		return env.isAndroid
			? STRINGS.errors.androidUnsupported
			: STRINGS.errors.noSpeechApi;
	}
	if (!env.hasVoice) {
		return {
			title: STRINGS.errors.noVoiceTitle,
			body: [STRINGS.errors.noVoiceLead, ...installSteps(env)],
		};
	}
	return null;
}
