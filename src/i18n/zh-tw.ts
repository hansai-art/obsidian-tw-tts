/** 介面字串集中處(全繁體中文)。 */
export const STRINGS = {
	// 命令
	cmdReadNote: '朗讀目前筆記',
	cmdReadSelection: '朗讀選取文字',
	cmdReadFromCursor: '從游標處開始唸',
	cmdReadFolder: '朗讀目前資料夾',
	cmdStop: '停止朗讀',
	cmdOpenReader: '開啟朗讀窗格',
	cmdTtsDiagnostics: '語音診斷(回報用)',
	menuReadFolder: '朗讀此資料夾',

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
	rateSlower: '放慢語速',
	rateFaster: '加快語速',
	rateReset: '回到預設語速(1.0x)',
	emptyReader: '按左側工具列的朗讀鈕,或在筆記上執行「朗讀目前筆記」開始。',

	// 提示 / 錯誤
	noContent: '這篇筆記沒有可朗讀的內容。',
	noActiveNote: '請先開啟一篇筆記。',
	noSelection: '請先選取要朗讀的文字。',
	noFolderNotes: '這個資料夾沒有可朗讀的筆記。',
	noChineseVoice: '找不到中文語音,請先在系統安裝中文語音:',
	installHintMac: 'macOS:系統設定 → 輔助使用 → 朗讀內容 → 系統聲音,加入中文(台灣)。',
	installHintWin: 'Windows:設定 → 時間與語言 → 語音,新增中文語音。',
	installHintIos: 'iPhone/iPad:設定 → 輔助使用 → 朗讀內容 → 聲音 → 中文,下載語音。',
	installHintAndroid: 'Android:設定 → 系統 → 文字轉語音輸出,安裝中文語音資料。',
	notSupported: '此裝置的瀏覽器不支援語音朗讀(Android 上較常見)。',
	ttsError: '朗讀發生錯誤,請再試一次。',

	// 結構化錯誤:每個都附「原因 + 解法」,在窗格內以持久面板顯示,不只丟秒消的提示。
	errors: {
		androidUnsupported: {
			title: 'Android 無法在外掛內朗讀,但可用系統「選取即朗讀」(台灣語音、免費、離線)',
			body: [
				'原因:Obsidian 的 Android WebView 沒有開放語音介面(Chromium 長年未修的 bug),所有外掛在 Android 都無法直接朗讀,不是你少裝了什麼。',
				'在 Android 讀筆記的最佳方式是系統內建的「選取即朗讀」,可用台灣中文語音、免費、離線。設定三步:',
				'1. 裝台灣語音:系統設定搜尋「文字轉語音」→ 偏好引擎選 Google → 安裝語音資料 →「中文(台灣)」。',
				'2. 開啟朗讀:系統設定 → 協助工具(無障礙)→「選取即朗讀 / Select to Speak」→ 開啟。',
				'3. 使用:在 Obsidian 選取要唸的文字 → 點出現的「選取即朗讀」圖示 → 系統就用台灣語音唸。',
				'(各廠牌選單名稱略有不同,找不到時直接搜尋「文字轉語音」「選取即朗讀」。)',
				'想要逐句反白 / 資料夾連播等外掛功能,請在電腦或 iPhone / iPad 使用,本外掛在那些平台可直接朗讀。',
			],
		},
		noSpeechApi: {
			title: '這個環境無法使用語音朗讀',
			body: [
				'原因:目前的執行環境沒有提供瀏覽器語音介面(Web Speech API)。',
				'解法:把 Obsidian 更新到最新版後重試。桌機(macOS / Windows)與 iPhone / iPad 可正常使用。',
			],
		},
		noVoiceTitle: '找不到可用的中文語音(外掛正常,只是系統缺語音)',
		noVoiceLead: '解法:在系統安裝一個中文語音後回來重試。',
	},

	// 設定頁
	settingVoiceName: '語音',
	settingVoiceDesc: '選擇朗讀用的語音。清單依品質排序,最上面是目前平台最推薦的。',
	settingVoiceAuto: '自動(推薦最佳語音)',
	settingRate: '語速',
	settingRateDesc: '朗讀速度倍率:0.5 最慢,2.0 最快。',
	settingRateReset: '回到預設(1.0x)',
	settingNoVoices: '目前偵測不到任何語音,請確認系統已安裝語音。',
	settingAutoNext: '單篇讀完自動下一篇',
	settingAutoNextDesc: '朗讀完一篇後,自動接著唸同資料夾的下一篇筆記。',
	settingFolderRecursive: '資料夾連播含子資料夾',
	settingFolderRecursiveDesc: '右鍵「朗讀此資料夾」時,是否也包含子資料夾內的筆記。',
	settingPronunciation: '發音字典',
	settingPronunciationDesc:
		'一行一條,格式「原文=唸法」,# 開頭為註解。只改朗讀發音,畫面仍顯示原文。',
	settingPronunciationPlaceholder: 'iPAS=愛帕斯\nGPT=G P T\n臺=台\n# 這行是註解',
	// 試聽
	previewButton: '試聽',
	previewSample: '你好,這是台灣中文語音測試。一二三四五。',
	previewNoVoice: '找不到可用的中文語音,無法試聽。',

	// 設定頁內建教學(中英文)
	help: {
		heading: '使用教學 · How to use',
		steps: [
			{
				icon: 'volume-2',
				zh: '朗讀整篇:點左側工具列的喇叭圖示,或執行命令「朗讀目前筆記」。',
				en: 'Read the whole note: click the speaker icon in the left ribbon, or run the "朗讀目前筆記" (Read current note) command.',
			},
			{
				icon: 'text-select',
				zh: '朗讀選取:先選一段文字,再執行命令「朗讀選取文字」,只唸選取範圍。',
				en: 'Read a selection: select some text, then run the "朗讀選取文字" (Read selection) command.',
			},
			{
				icon: 'panel-right',
				zh: '跟讀窗格:右側會開朗讀窗格並逐句反白;點任一句可從那句開始唸。',
				en: 'Follow-along pane: a reader pane opens on the right and highlights each sentence; click any sentence to start from there.',
			},
			{
				icon: 'play',
				zh: '控制:窗格內有播放、暫停、繼續、上一句、下一句、停止。',
				en: 'Controls: play, pause, resume, previous, next and stop inside the pane.',
			},
			{
				icon: 'sliders-horizontal',
				zh: '調整聲音:上方可選語音、偏好男聲/女聲、拉語速,按「試聽」先聽一句。',
				en: 'Tune the voice: pick a voice, prefer male/female, adjust speed above, and press 試聽 (Preview) to sample it.',
			},
		],
		noVoiceHeading: '沒有聲音?請先在系統安裝中文語音 · No sound? Install a Chinese voice first',
		platformIcons: {
			mac: 'laptop',
			win: 'monitor',
			ios: 'smartphone',
			android: 'tablet-smartphone',
		},
	},
} as const;
