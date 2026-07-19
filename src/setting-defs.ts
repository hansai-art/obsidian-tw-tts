/**
 * 宣告式設定定義(getSettingDefinitions API,@since Obsidian 1.13.0)的純資料建構。
 *
 * 為什麼分成獨立檔:這裡全是「純資料 + 純函數」,可被 node:test 單元驗證結構;
 * 需要 this / DOM 的部分(語速 reset / 試聽 action、getControlValue 綁定)留在 settings.ts。
 * 只用 `import type` 引入 obsidian,不引入任何 runtime 值,測試環境(tsx)才能載入本檔。
 *
 * 相容策略:1.13.0+ 走這裡的宣告式定義;<1.13.0(如 Hans 目前的 1.12.7)Obsidian
 * 不會呼叫 getSettingDefinitions(),改走 settings.ts 的 display() 圖示版。兩條路並存。
 */
import type {
	SettingDefinitionControl,
	SettingDefinitionEmpty,
	SettingDefinitionGroup,
} from 'obsidian';
import { regionLabel } from './voice-catalog';
import { STRINGS } from './i18n/zh-tw';

/** 語音下拉需要的最小欄位(方便測試,不必造完整 SpeechSynthesisVoice)。 */
export type VoiceLike = { name: string; lang: string };

/** 語音下拉 options:第一項固定「自動」,其餘為策展後語音(名稱 → 顯示標籤)。 */
export function voiceDropdownOptions(voices: VoiceLike[]): Record<string, string> {
	const options: Record<string, string> = { '': STRINGS.settingVoiceAuto };
	for (const v of voices) {
		options[v.name] = `${v.name}（${regionLabel(v.lang)}）`;
	}
	return options;
}

/**
 * 五個純資料 control 定義,依顯示順序:
 * 語音下拉、語速 slider、自動下一篇 toggle、遞迴 toggle、發音字典 textarea。
 * 語速的「回預設 / 試聽」以獨立 action 列在 settings.ts 插入(需存取 this)。
 * key 對應 TwTtsSettings 欄位,由 getControlValue / setControlValue 讀寫。
 */
export function coreSettingDefs(voices: VoiceLike[]): SettingDefinitionControl[] {
	return [
		{
			name: STRINGS.settingVoiceName,
			desc: voices.length === 0 ? STRINGS.settingNoVoices : STRINGS.settingVoiceDesc,
			control: {
				type: 'dropdown',
				key: 'voiceName',
				options: voiceDropdownOptions(voices),
			},
		},
		{
			name: STRINGS.settingRate,
			desc: STRINGS.settingRateDesc,
			control: {
				type: 'slider',
				key: 'rate',
				min: 0.5,
				max: 2.0,
				step: 0.1,
				displayFormat: (v: number) => `${v.toFixed(1)}x`,
			},
		},
		{
			name: STRINGS.settingAutoNext,
			desc: STRINGS.settingAutoNextDesc,
			control: { type: 'toggle', key: 'autoNextInFolder' },
		},
		{
			name: STRINGS.settingFolderRecursive,
			desc: STRINGS.settingFolderRecursiveDesc,
			control: { type: 'toggle', key: 'folderQueueRecursive' },
		},
		{
			name: STRINGS.settingPronunciation,
			desc: STRINGS.settingPronunciationDesc,
			control: {
				type: 'textarea',
				key: 'pronunciationRules',
				placeholder: STRINGS.settingPronunciationPlaceholder,
				rows: 6,
			},
		},
	];
}

/**
 * 教學區的宣告式群組:兩個 group,每列 name+desc 皆進設定搜尋索引。
 * 1.13.0+ 走此版(純文字、無 Lucide 圖示);<1.13.0 走 display() 的圖示版。
 */
export function helpGroupDefs(): SettingDefinitionGroup[] {
	const steps: SettingDefinitionEmpty[] = STRINGS.help.steps.map((s) => ({
		name: s.zh,
		desc: s.en,
	}));
	const hints: SettingDefinitionEmpty[] = [
		STRINGS.installHintMac,
		STRINGS.installHintWin,
		STRINGS.installHintIos,
		STRINGS.installHintAndroid,
	].map((h) => ({ name: h }));
	return [
		{ type: 'group', heading: STRINGS.help.heading, items: steps },
		{ type: 'group', heading: STRINGS.help.noVoiceHeading, items: hints },
	];
}
