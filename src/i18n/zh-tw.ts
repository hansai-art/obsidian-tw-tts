/** 介面字串集中處(全繁體中文)。 */
export const STRINGS = {
	// 命令
	cmdReadNote: '朗讀目前筆記',
	cmdReadSelection: '朗讀選取文字',
	cmdStop: '停止朗讀',
	cmdOpenReader: '開啟朗讀窗格',

	// ribbon / 狀態列
	ribbonTooltip: '朗讀本篇',
	statusIdle: '朗讀',
	statusPlaying: '朗讀中',
	statusPaused: '已暫停',

	// 朗讀窗格
	viewTitle: '中文朗讀',
	play: '播放',
	pause: '暫停',
	resume: '繼續',
	stop: '停止',
	prev: '上一句',
	next: '下一句',
	emptyReader: '按左側工具列的朗讀鈕,或在筆記上執行「朗讀目前筆記」開始。',

	// 提示 / 錯誤
	noContent: '這篇筆記沒有可朗讀的內容。',
	noActiveNote: '請先開啟一篇筆記。',
	noSelection: '請先選取要朗讀的文字。',
	noChineseVoice: '找不到中文語音,請先在系統安裝中文語音:',
	installHintMac: 'macOS:系統設定 → 輔助使用 → 朗讀內容 → 系統聲音,加入中文(台灣)。',
	installHintWin: 'Windows:設定 → 時間與語言 → 語音,新增中文語音。',
	installHintIos: 'iPhone/iPad:設定 → 輔助使用 → 朗讀內容 → 聲音 → 中文,下載語音。',
	installHintAndroid: 'Android:設定 → 系統 → 文字轉語音輸出,安裝中文語音資料。',
	notSupported: '此裝置的瀏覽器不支援語音朗讀(Android 上較常見)。',
	ttsError: '朗讀發生錯誤,請再試一次。',

	// 設定頁
	settingVoiceName: '語音',
	settingVoiceDesc: '選擇朗讀用的語音。預設自動挑台灣中文語音。',
	settingVoiceAuto: '自動(台灣中文優先)',
	settingRate: '語速',
	settingRateDesc: '朗讀速度倍率:0.5 最慢,2.0 最快。',
	settingNoVoices: '目前偵測不到任何語音,請確認系統已安裝語音。',
} as const;
