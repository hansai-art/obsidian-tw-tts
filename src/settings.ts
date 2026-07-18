import { App, PluginSettingTab, Setting } from 'obsidian';
import type TwTtsPlugin from './main';
import { STRINGS } from './i18n/zh-tw';
import { sortVoicesChineseFirst } from './voice-utils';

export interface TwTtsSettings {
	/** 使用者選定的語音 name;空字串 = 自動挑台灣中文語音。 */
	voiceName: string;
	/** 語速倍率 0.5 ~ 2.0。 */
	rate: number;
}

export const DEFAULT_SETTINGS: TwTtsSettings = {
	voiceName: '',
	rate: 1.0,
};

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
					dd.addOption(v.name, `${v.name}（${v.lang}）`);
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
			});
	}
}
