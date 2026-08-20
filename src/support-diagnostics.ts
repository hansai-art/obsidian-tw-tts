import type { TtsProvider } from './provider-policy';

export type SupportCheckStatus = 'not-run' | 'checking' | 'passed' | 'failed';
export type SupportCheckStage = 'local-api' | 'edge-cli' | 'azure-api' | 'audio-playback';

export interface SupportDiagnostic {
	pluginVersion: string;
	obsidianVersion: string;
	platform: string;
	provider: TtsProvider;
	effectiveProvider?: TtsProvider;
	fallbackReason?: 'edge-unavailable-on-mobile';
	voice: string;
	rate: number;
	pitch: number;
	status: SupportCheckStatus;
	stage?: SupportCheckStage;
	errorCode?: string;
}

export function effectiveSupportProvider(
	configuredProvider: TtsProvider,
	isDesktop: boolean,
): { effectiveProvider: TtsProvider; fallbackReason?: 'edge-unavailable-on-mobile' } {
	if (configuredProvider === 'edge' && !isDesktop) {
		return { effectiveProvider: 'local', fallbackReason: 'edge-unavailable-on-mobile' };
	}
	return { effectiveProvider: configuredProvider };
}

export interface SupportFaqItem {
	question: string;
	answer: string;
}

export const SUPPORT_FAQ: readonly SupportFaqItem[] = [
	{
		question: 'Edge CLI 顯示找不到 edge-tts，怎麼辦？',
		answer: 'macOS 在終端機執行「python3 -m pip install --user edge-tts」；Windows PowerShell 執行「py -m pip install --user edge-tts」。完成後重新啟用外掛，再按「執行環境檢查」。外掛不會自行安裝程式或要求系統管理員權限。',
	},
	{
		question: '有聲音，但不是我選的語音，怎麼辦？',
		answer: '確認朗讀引擎與語音欄位都已選對，再執行環境檢查。診斷摘要會列出正式送出的 provider、voice、語速與音高。',
	},
	{
		question: 'Edge CLI 連線失敗或逾時，怎麼辦？',
		answer: 'Edge CLI 需要網路，且文字會傳到 Microsoft。請暫停 VPN、檢查公司網路或防火牆後重試；也可切回系統語音（離線）。',
	},
	{
		question: 'Azure Speech 為什麼無法使用？',
		answer: '確認 Key 與 Region 來自同一個 Azure Speech 資源，並檢查額度、付款驗證及預算警示。不要把 Key 貼進 AI、截圖、Issue 或筆記。',
	},
	{
		question: '如何請 AI 協助排錯？',
		answer: '先執行環境檢查，再按「複製安全診斷給 AI」。複製內容不含筆記、Azure Key、Vault 名稱與完整私人路徑。',
	},
];

function statusLabel(status: SupportCheckStatus): string {
	switch (status) {
		case 'checking': return '檢查中';
		case 'passed': return '通過';
		case 'failed': return '失敗';
		default: return '尚未執行環境檢查';
	}
}

const SAFE_ERROR_MESSAGES: Readonly<Record<string, string>> = {
	'EDGE-001': '找不到 edge-tts，請完成安裝後重新檢查。',
	'EDGE-002': 'Edge CLI 參數錯誤，請更新外掛後重試。',
	'EDGE-003': 'Edge 語音服務連線失敗或逾時，請檢查網路、VPN 或防火牆。',
	'EDGE-004': 'Edge CLI 憑證驗證失敗，請更新 edge-tts 或檢查公司網路憑證。',
	'EDGE-005': '所選 Edge 語音目前不可用，請改選另一個語音。',
	'EDGE-999': 'Edge CLI 檢查失敗，請複製此安全診斷交給 AI。',
	'AZURE-001': 'Azure Speech 驗證失敗，請確認 Key 與 Region。',
	'AZURE-999': 'Azure Speech 檢查失敗，請檢查額度、網路及資源設定。',
	'LOCAL-001': '找不到可用的系統語音，請先安裝中文語音。',
	'LOCAL-999': '系統語音檢查失敗，請確認 Obsidian 與系統語音設定。',
	'AUDIO-001': '語音已合成但音訊無法播放，請檢查系統輸出裝置。',
};

function safeVersion(value: unknown): string {
	return typeof value === 'string' && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(value) ? value : '未知';
}

function safeProvider(value: unknown): TtsProvider | 'unknown' {
	return value === 'local' || value === 'edge' || value === 'azure' ? value : 'unknown';
}

function safePlatform(value: unknown): string {
	return value === 'Desktop' || value === 'iOS app' || value === 'Android app' || value === 'Unknown' ? value : 'Unknown';
}

function safeVoice(value: unknown): string {
	if (typeof value !== 'string' || value.length === 0) return '自動';
	const voice = value.trim();
	if (!/^[\p{L}\p{N} ._()·-]{1,80}$/u.test(voice)) return '[REDACTED]';
	if (/\b(?:key|token|password|secret)\b/i.test(voice) || /[a-f0-9]{32,}/i.test(voice)) return '[REDACTED]';
	return voice;
}

function safeNumber(value: unknown): string {
	return typeof value === 'number' && Number.isFinite(value) ? String(value) : '未知';
}

function safeStage(value: unknown): SupportCheckStage | undefined {
	return value === 'local-api' || value === 'edge-cli' || value === 'azure-api' || value === 'audio-playback' ? value : undefined;
}

function safeErrorCode(value: unknown): string | undefined {
	return typeof value === 'string' && SAFE_ERROR_MESSAGES[value] ? value : undefined;
}

function safeDiagnosticMessage(diagnostic: SupportDiagnostic): string | undefined {
	if (diagnostic.status === 'checking') return '正在檢查目前的朗讀引擎。';
	const code = safeErrorCode(diagnostic.errorCode);
	if (diagnostic.status === 'failed') return code ? SAFE_ERROR_MESSAGES[code] : '環境檢查失敗，請重新執行檢查。';
	if (diagnostic.status !== 'passed') return undefined;
	if (diagnostic.stage === 'local-api') return '已偵測到系統語音 API 與可用語音。';
	if (diagnostic.stage === 'audio-playback') {
		return safeProvider(diagnostic.provider) === 'azure'
			? 'Azure Speech 合成成功，音訊播放已啟動。'
			: 'Edge CLI 合成成功，音訊播放已啟動。';
	}
	return '環境檢查通過。';
}

export function formatSupportSummary(diagnostic: SupportDiagnostic): string {
	const lines = [
		`外掛版本：${safeVersion(diagnostic.pluginVersion)}`,
		`Obsidian 版本：${safeVersion(diagnostic.obsidianVersion)}`,
		`平台：${safePlatform(diagnostic.platform)}`,
		`設定 Provider：${safeProvider(diagnostic.provider)}`,
		`實際 Provider：${safeProvider(diagnostic.effectiveProvider ?? diagnostic.provider)}`,
		`Voice：${safeVoice(diagnostic.voice)}`,
		`語速：${safeNumber(diagnostic.rate)}`,
		`音高：${safeNumber(diagnostic.pitch)}`,
		`環境檢查：${statusLabel(diagnostic.status)}`,
	];
	if (diagnostic.fallbackReason === 'edge-unavailable-on-mobile') {
		lines.push('回落原因：Edge CLI 僅支援桌面版，行動版使用系統語音。');
	}
	const stage = safeStage(diagnostic.stage);
	const errorCode = safeErrorCode(diagnostic.errorCode);
	const message = safeDiagnosticMessage(diagnostic);
	if (stage) lines.push(`階段：${stage}`);
	if (errorCode) lines.push(`錯誤代碼：${errorCode}`);
	if (message) lines.push(`安全摘要：${message}`);
	return lines.join('\n');
}

export function formatAiSupportPrompt(diagnostic: SupportDiagnostic): string {
	return [
		'我正在使用 Obsidian 外掛 Hans TW TTS。',
		'請根據以下已去識別化的診斷資料，判斷根因並提供逐步解法。',
		'不要要求我提供筆記內容、Azure Key、密碼或其他憑證。',
		'',
		formatSupportSummary(diagnostic),
	].join('\n');
}

export function supportErrorCode(provider: TtsProvider, safeMessage: string): string {
	const message = safeMessage.toLowerCase();
	if (provider === 'edge') {
		if (message.includes('找不到 edge-tts')) return 'EDGE-001';
		if (message.includes('參數錯誤')) return 'EDGE-002';
		if (message.includes('逾時') || message.includes('連線失敗')) return 'EDGE-003';
		if (message.includes('憑證')) return 'EDGE-004';
		if (message.includes('語音目前不可用')) return 'EDGE-005';
		if (message.includes('播放')) return 'AUDIO-001';
		return 'EDGE-999';
	}
	if (provider === 'azure') {
		if (message.includes('key') || message.includes('region') || message.includes('401') || message.includes('403')) return 'AZURE-001';
		if (message.includes('播放')) return 'AUDIO-001';
		return 'AZURE-999';
	}
	if (message.includes('找不到') || message.includes('語音')) return 'LOCAL-001';
	return 'LOCAL-999';
}

/** Azure 錯誤只保留可採取行動的分類，不回顯 request、Key、端點或私人路徑。 */
export function safeAzureFailureMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : '';
	if (message === '請先輸入 Azure Speech Key') return message;
	if (message === '請先輸入 Azure Speech Region') return message;
	if (message === 'Azure 區域格式不正確') return message;
	if (/\b(?:401|403)\b/.test(message)) return 'Azure Speech 驗證失敗，請確認 Key 與 Region 屬於同一個 Speech 資源。';
	if (/\b429\b/.test(message)) return 'Azure Speech 額度或請求頻率已達限制，請檢查用量與帳務設定。';
	if (/timeout|network|connection|connect/i.test(message)) return 'Azure Speech 連線失敗，請檢查網路、VPN 或公司網路限制。';
	return 'Azure Speech 請求失敗，請檢查 Key、Region、額度與網路後重試。';
}
