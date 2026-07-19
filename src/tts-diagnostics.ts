/**
 * 語音環境診斷:把「這台裝置的 speechSynthesis 到底是什麼狀態」變成可讀文字,
 * 讓使用者(尤其 Android)一鍵看到並截圖回報。用來判斷:
 *   - 完全沒有 speechSynthesis(WebView 未提供介面)
 *   - 有介面但抓不到語音(getVoices 空)
 *   - 有語音但唸不出來
 * 以及 WebView / Chromium 版本(判斷是否為版本相關的支援差異)。
 * 純函數,可單元測試。
 */

export interface TtsDiagnostics {
	hasSpeechSynthesis: boolean;
	voiceCount: number;
	/** 中文語音清單,每項為 "name (lang)"。 */
	zhVoices: string[];
	userAgent: string;
	/** 'Android app' | 'iOS app' | 'Desktop' | 'Unknown' */
	platform: string;
}

/** 從 userAgent 擷取 Chrome/WebView 版本與是否為 Android WebView(帶 "wv" 標記)。 */
export function summariseUserAgent(ua: string): string {
	const chrome = /Chrome\/(\d+(?:\.\d+)*)/.exec(ua)?.[1];
	const isWebView = /;\s*wv[;)]/.test(ua) || /\bwv\b/.test(ua);
	const parts: string[] = [];
	if (chrome) parts.push(`Chromium ${chrome}`);
	if (isWebView) parts.push('Android WebView');
	if (parts.length === 0) return ua.slice(0, 140);
	return parts.join(' · ');
}

/** 把診斷資料格式化成一行一項的可讀文字(繁中,方便截圖回報)。 */
export function formatTtsDiagnostics(d: TtsDiagnostics): string[] {
	const lines: string[] = [];
	lines.push(`平台:${d.platform}`);
	lines.push(
		`speechSynthesis:${d.hasSpeechSynthesis ? '存在' : '不存在(這台 WebView 沒有語音介面)'}`,
	);
	if (d.hasSpeechSynthesis) {
		lines.push(`偵測到語音數:${d.voiceCount}`);
		lines.push(
			d.zhVoices.length > 0
				? `中文語音:${d.zhVoices.join('、')}`
				: '中文語音:無(有介面但抓不到中文語音)',
		);
	}
	lines.push(`環境:${summariseUserAgent(d.userAgent)}`);
	return lines;
}
