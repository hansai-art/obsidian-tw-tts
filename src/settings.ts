import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type TwTtsPlugin from './main';
import { STRINGS } from './i18n/zh-tw';
import { pickVoice, sortVoicesChineseFirst } from './voice-utils';
import { voiceGender, type VoiceGender } from './voice-gender';

export interface TwTtsSettings {
	/** 使用者選定的語音 name;空字串 = 自動挑台灣中文語音。 */
	voiceName: string;
	/** 語速倍率 0.5 ~ 2.0。 */
	rate: number;
	/** 自動挑語音時偏好的性別;'any' = 不限。 */
	genderPreference: VoiceGender | 'any';
}

export const DEFAULT_SETTINGS: TwTtsSettings = {
	voiceName: '',
	rate: 1.0,
	genderPreference: 'any',
};

/** 語音下拉選單的性別標籤(男 / 女 / 性別未知)。 */
function genderLabel(v: SpeechSynthesisVoice): string {
	const g = voiceGender(v);
	if (g === 'male') return STRINGS.labelMale;
	if (g === 'female') return STRINGS.labelFemale;
	return STRINGS.labelUnknown;
}

export class TwTtsSettingTab extends PluginSettingTab {
	private plugin: TwTtsPlugin;

	constructor(app: App, plugin: TwTtsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const synth = window.speechSynthesis;
		const voices = synth ? sortVoicesChineseFirst(synth.getVoices()) : [];

		const voiceSetting = new Setting(containerEl)
			.setName(STRINGS.settingVoiceName)
			.setDesc(STRINGS.settingVoiceDesc)
			.addDropdown((dd) => {
				dd.addOption('', STRINGS.settingVoiceAuto);
				for (const v of voices) {
					dd.addOption(v.name, `${v.name}（${v.lang}｜${genderLabel(v)}）`);
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

		new Setting(containerEl)
			.setName(STRINGS.settingGender)
			.setDesc(STRINGS.settingGenderDesc)
			.addDropdown((dd) => {
				dd.addOption('any', STRINGS.genderAny);
				dd.addOption('female', STRINGS.genderFemale);
				dd.addOption('male', STRINGS.genderMale);
				dd.setValue(this.plugin.settings.genderPreference);
				dd.onChange(async (val) => {
					this.plugin.settings.genderPreference = val as VoiceGender | 'any';
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(STRINGS.settingRate)
			.setDesc(STRINGS.settingRateDesc)
			.addSlider((sl) => {
				sl.setLimits(0.5, 2.0, 0.1)
					.setValue(this.plugin.settings.rate)
					.setDynamicTooltip();
				sl.onChange(async (val) => {
					this.plugin.settings.rate = val;
					await this.plugin.saveSettings();
				});
			})
			.addExtraButton((btn) => {
				btn.setIcon('play')
					.setTooltip(STRINGS.previewButton)
					.onClick(() => this.preview());
			});

		this.renderHelp(containerEl);
	}

	/** 設定頁底部的內建教學(中文為主、英文為輔)。 */
	private renderHelp(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(STRINGS.help.heading).setHeading();

		const list = containerEl.createEl('ol', { cls: 'tw-tts-help' });
		for (const step of STRINGS.help.steps) {
			const li = list.createEl('li');
			li.createEl('div', { cls: 'tw-tts-help-zh', text: step.zh });
			li.createEl('div', { cls: 'tw-tts-help-en', text: step.en });
		}

		new Setting(containerEl).setName(STRINGS.help.noVoiceHeading).setHeading();
		const hints = containerEl.createEl('ul', { cls: 'tw-tts-help' });
		for (const hint of [
			STRINGS.installHintMac,
			STRINGS.installHintWin,
			STRINGS.installHintIos,
			STRINGS.installHintAndroid,
		]) {
			hints.createEl('li', { text: hint });
		}
	}

	/** 用目前設定(語音 / 性別 / 語速)唸一句範例。 */
	private preview(): void {
		const synth = window.speechSynthesis;
		if (!synth) {
			new Notice(STRINGS.notSupported);
			return;
		}
		const voice = pickVoice(
			synth.getVoices(),
			this.plugin.settings.voiceName,
			this.plugin.settings.genderPreference,
		);
		if (!voice) {
			new Notice(STRINGS.previewNoVoice);
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
