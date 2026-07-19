import {
	App,
	Notice,
	Platform,
	PluginSettingTab,
	Setting,
	setIcon,
	type SettingDefinitionAction,
	type SettingDefinitionItem,
	type SliderComponent,
} from 'obsidian';
import type TwTtsPlugin from './main';
import { STRINGS } from './i18n/zh-tw';
import { curatedVoices, pickVoice, regionLabel } from './voice-catalog';
import { coreSettingDefs, helpGroupDefs } from './setting-defs';
import { playbackError } from './playback-error';

export interface TwTtsSettings {
	/** 使用者選定的語音 name;空字串 = 自動挑目前平台最佳中文語音。 */
	voiceName: string;
	/** 語速倍率 0.5 ~ 2.0。 */
	rate: number;
	/** 單篇讀完自動唸同資料夾下一篇。 */
	autoNextInFolder: boolean;
	/** 右鍵資料夾連播時是否遞迴子資料夾。 */
	folderQueueRecursive: boolean;
	/** 發音字典原始規則字串(一行一條「原文=唸法」)。 */
	pronunciationRules: string;
}

export const DEFAULT_SETTINGS: TwTtsSettings = {
	voiceName: '',
	rate: 1.0,
	autoNextInFolder: false,
	folderQueueRecursive: false,
	pronunciationRules: '',
};

export class TwTtsSettingTab extends PluginSettingTab {
	private plugin: TwTtsPlugin;

	constructor(app: App, plugin: TwTtsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * 宣告式設定(Obsidian 1.13.0+):讓設定項進入 Obsidian 的設定搜尋。
	 * 回傳非空陣列時,1.13.0+ 走此路徑且不呼叫 display();<1.13.0 不呼叫本方法、走 display()。
	 * 純資料定義集中在 setting-defs.ts;語速的「回預設 / 試聽」需存取 this,故在此以 action 列插入。
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		const synth = window.speechSynthesis;
		const voices = synth ? curatedVoices(synth.getVoices()) : [];
		const [voiceDef, rateDef, autoNextDef, folderDef, pronDef] =
			coreSettingDefs(voices);

		const resetAction: SettingDefinitionAction = {
			name: STRINGS.settingRateReset,
			action: () => {
				void this.resetRate();
			},
		};
		const previewAction: SettingDefinitionAction = {
			name: STRINGS.previewButton,
			action: () => this.preview(),
		};

		return [
			voiceDef,
			rateDef,
			resetAction,
			previewAction,
			autoNextDef,
			folderDef,
			pronDef,
			...helpGroupDefs(),
		];
	}

	/** 宣告式 control 讀值:綁定到本外掛的 settings(而非預設的 vault config)。 */
	getControlValue(key: string): unknown {
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	/** 宣告式 control 寫值:更新 settings 並持久化。 */
	async setControlValue(key: string, value: unknown): Promise<void> {
		(this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
		await this.plugin.saveSettings();
	}

	/** 語速回預設 1.0x(宣告式路徑用;重繪讓 slider 反映新值)。 */
	private async resetRate(): Promise<void> {
		this.plugin.settings.rate = 1.0;
		await this.plugin.saveSettings();
		// update() 為 1.13.0+ API。此方法僅由宣告式路徑(1.13.0+)觸發,故一定存在;
		// 以最小型別 + optional call 做 feature-detection,避開靜態版本檢查並多一層 runtime 保護。
		(this as unknown as { update?: () => void }).update?.();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const synth = window.speechSynthesis;
		const voices = synth ? curatedVoices(synth.getVoices()) : [];

		const voiceSetting = new Setting(containerEl)
			.setName(STRINGS.settingVoiceName)
			.setDesc(STRINGS.settingVoiceDesc)
			.addDropdown((dd) => {
				dd.addOption('', STRINGS.settingVoiceAuto);
				for (const v of voices) {
					dd.addOption(v.name, `${v.name}（${regionLabel(v.lang)}）`);
				}
				dd.setValue(this.plugin.settings.voiceName);
				dd.onChange(async (val) => {
					this.plugin.settings.voiceName = val;
					await this.plugin.saveSettings();
				});
			});
		if (voices.length === 0) {
			voiceSetting.setDesc(STRINGS.settingNoVoices);
		}

		let rateSlider: SliderComponent;
		new Setting(containerEl)
			.setName(STRINGS.settingRate)
			.setDesc(STRINGS.settingRateDesc)
			.addSlider((sl) => {
				rateSlider = sl;
				sl.setLimits(0.5, 2.0, 0.1).setValue(this.plugin.settings.rate);
				sl.onChange(async (val) => {
					this.plugin.settings.rate = val;
					await this.plugin.saveSettings();
				});
			})
			.addExtraButton((btn) => {
				btn.setIcon('rotate-ccw')
					.setTooltip(STRINGS.settingRateReset)
					.onClick(async () => {
						this.plugin.settings.rate = 1.0;
						rateSlider.setValue(1.0);
						await this.plugin.saveSettings();
					});
			})
			.addExtraButton((btn) => {
				btn.setIcon('play')
					.setTooltip(STRINGS.previewButton)
					.onClick(() => this.preview());
			});

		new Setting(containerEl)
			.setName(STRINGS.settingAutoNext)
			.setDesc(STRINGS.settingAutoNextDesc)
			.addToggle((tg) => {
				tg.setValue(this.plugin.settings.autoNextInFolder);
				tg.onChange(async (val) => {
					this.plugin.settings.autoNextInFolder = val;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(STRINGS.settingFolderRecursive)
			.setDesc(STRINGS.settingFolderRecursiveDesc)
			.addToggle((tg) => {
				tg.setValue(this.plugin.settings.folderQueueRecursive);
				tg.onChange(async (val) => {
					this.plugin.settings.folderQueueRecursive = val;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(STRINGS.settingPronunciation)
			.setDesc(STRINGS.settingPronunciationDesc)
			.addTextArea((ta) => {
				ta.setPlaceholder(STRINGS.settingPronunciationPlaceholder)
					.setValue(this.plugin.settings.pronunciationRules);
				ta.inputEl.rows = 6;
				ta.inputEl.addClass('tw-tts-pronunciation-input');
				ta.onChange(async (val) => {
					this.plugin.settings.pronunciationRules = val;
					await this.plugin.saveSettings();
				});
			});

		this.renderHelp(containerEl);
	}

	/** 設定頁底部的內建教學(中文為主、英文為輔,每項配 Lucide 圖示)。 */
	private renderHelp(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(STRINGS.help.heading).setHeading();

		const list = containerEl.createDiv({ cls: 'tw-tts-help' });
		for (const step of STRINGS.help.steps) {
			const item = list.createDiv({ cls: 'tw-tts-help-item' });
			setIcon(item.createSpan({ cls: 'tw-tts-help-icon' }), step.icon);
			const text = item.createDiv({ cls: 'tw-tts-help-text' });
			text.createDiv({ cls: 'tw-tts-help-zh', text: step.zh });
			text.createDiv({ cls: 'tw-tts-help-en', text: step.en });
		}

		new Setting(containerEl).setName(STRINGS.help.noVoiceHeading).setHeading();
		const icons = STRINGS.help.platformIcons;
		const hints = containerEl.createDiv({ cls: 'tw-tts-help' });
		for (const [icon, hint] of [
			[icons.mac, STRINGS.installHintMac],
			[icons.win, STRINGS.installHintWin],
			[icons.ios, STRINGS.installHintIos],
			[icons.android, STRINGS.installHintAndroid],
		] as const) {
			const item = hints.createDiv({ cls: 'tw-tts-help-item' });
			setIcon(item.createSpan({ cls: 'tw-tts-help-icon' }), icon);
			item.createDiv({ cls: 'tw-tts-help-zh', text: hint });
		}
	}

	/** 用目前設定(語音 / 語速)唸一句範例。 */
	private preview(): void {
		const synth = window.speechSynthesis;
		const voice = synth
			? pickVoice(synth.getVoices(), this.plugin.settings.voiceName)
			: null;
		const err = playbackError({
			hasSpeechApi: !!synth,
			hasVoice: !!voice,
			isAndroid: Platform.isAndroidApp,
			isIos: Platform.isIosApp,
			isDesktop: Platform.isDesktopApp,
		});
		if (err || !synth || !voice) {
			const e = err ?? {
				title: STRINGS.errors.noSpeechApi.title,
				body: STRINGS.errors.noSpeechApi.body,
			};
			// 設定頁沒有窗格可放持久面板,故用長版提示帶出標題 + 完整解法。
			new Notice(`${e.title}\n${e.body.join('\n')}`, 12000);
			return;
		}
		synth.cancel();
		const u = new SpeechSynthesisUtterance(STRINGS.previewSample);
		u.voice = voice;
		u.lang = voice.lang;
		u.rate = this.plugin.settings.rate;
		synth.speak(u);
	}
}
