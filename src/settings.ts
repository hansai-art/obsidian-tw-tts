import {
	App,
	apiVersion,
	Notice,
	Platform,
	PluginSettingTab,
	Setting,
	setIcon,
	type SettingDefinitionAction,
	type SettingDefinitionItem,
	type SettingDefinitionRender,
	type SliderComponent,
} from 'obsidian';
import type TwTtsPlugin from './main';
import { STRINGS } from './i18n/zh-tw';
import { availableVoices, pickVoice, regionLabel } from './voice-catalog';
import { coreSettingDefs, helpGroupDefs } from './setting-defs';
import { playbackError } from './playback-error';
import { semitonesToSpeechPitch } from './tts-engine';
import { createEdgeAudio, edgeFailureMessage, EdgeCliSpeechClient, type EdgeAudio } from './edge-tts';
import { ObsidianAzureSpeechClient } from './azure-obsidian';
import { cloudVoiceOptions } from './cloud-voice-catalog';
import {
	previewLanguage,
	shouldAutoPreviewOnSettingChange,
	shouldUseAzureProvider,
	shouldUseEdgeProvider,
	type TtsProvider,
} from './provider-policy';
import {
	effectiveSupportProvider,
	formatAiSupportPrompt,
	formatSupportSummary,
	safeAzureFailureMessage,
	SUPPORT_FAQ,
	supportErrorCode,
	type SupportCheckStage,
	type SupportDiagnostic,
} from './support-diagnostics';

interface SupportCheckOutcome {
	passed: boolean;
	stage: SupportCheckStage;
	message: string;
}

export interface TwTtsSettings {
	/** local = Web Speech；edge = 桌面 CLI；azure = 使用者自己的 Azure Speech API。 */
	provider: TtsProvider;
	/** Edge CLI 語音名稱；僅在 desktop Edge 引擎使用。 */
	edgeVoice: string;
	/** Azure Speech Key 僅存於本機 Obsidian 外掛資料，不會送往外掛作者。 */
	azureKey: string;
	azureRegion: string;
	azureVoice: string;
	/** 使用者選定的語音 name;空字串 = 自動挑目前平台最佳中文語音。 */
	voiceName: string;
	/** 語速倍率 0.5 ~ 2.0。 */
	rate: number;
	/** 音高，使用半音表示 -10 ~ +10。 */
	pitch: number;
	/** 單篇讀完自動唸同資料夾下一篇。 */
	autoNextInFolder: boolean;
	/** 右鍵資料夾連播時是否遞迴子資料夾。 */
	folderQueueRecursive: boolean;
	/** 發音字典原始規則字串(一行一條「原文=唸法」)。 */
	pronunciationRules: string;
	/** 不朗讀的符號,以空白分隔(如「○ ● ※」)。這些符號會在送去朗讀前被刪掉。 */
	silentSymbols: string;
}

export const DEFAULT_SETTINGS: TwTtsSettings = {
	provider: 'local',
	edgeVoice: 'zh-CN-XiaoxiaoNeural',
	azureKey: '',
	azureRegion: '',
	azureVoice: 'zh-CN-XiaoxiaoNeural',
	voiceName: '',
	rate: 1.0,
	pitch: 0,
	autoNextInFolder: false,
	folderQueueRecursive: false,
	pronunciationRules: '',
	silentSymbols: '',
};

export class TwTtsSettingTab extends PluginSettingTab {
	private plugin: TwTtsPlugin;
	private edgePreviewAudio: EdgeAudio | null = null;
	private supportDiagnostic: SupportDiagnostic | null = null;
	private supportStatusEl: HTMLElement | null = null;
	/** 切換聲音時淘汰舊的非同步合成，避免晚回來的舊音檔蓋過新選擇。 */
	private previewGeneration = 0;
	/** 快速重複檢查時只接受最後一次結果，避免舊請求覆蓋新狀態。 */
	private supportCheckGeneration = 0;

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
		const voices = synth ? availableVoices(synth.getVoices()) : [];
		const [providerDef, edgeVoiceDef, , azureRegionDef, azureVoiceDef, voiceDef, rateDef, pitchDef, autoNextDef, folderDef, pronDef, silentDef] =
			coreSettingDefs(voices);

		const resetAction: SettingDefinitionAction = {
			name: STRINGS.settingRateReset,
			action: () => {
				void this.resetRate();
			},
		};
		const previewControls: SettingDefinitionRender = {
			name: STRINGS.previewHeading,
			desc: STRINGS.previewDesc,
			render: (setting) => {
				setting
					.addButton((btn) =>
						btn.setButtonText(STRINGS.previewButton).setIcon('play').onClick(() => this.preview()),
					)
					.addButton((btn) =>
						btn
							.setButtonText(STRINGS.previewStopButton)
							.setIcon('square')
							.onClick(() => this.stopPreview()),
					);
			},
		};
		const azureKeyControl: SettingDefinitionRender = {
			name: STRINGS.settingAzureKey,
			desc: STRINGS.settingAzureKeyDesc,
			render: (setting) => {
				setting.addText((tc) => {
					tc.inputEl.type = 'password';
					tc.setPlaceholder(STRINGS.settingAzureKeyPlaceholder).setValue(this.plugin.settings.azureKey).onChange((value) => {
						this.plugin.settings.azureKey = value.trim();
						void this.plugin.saveSettings();
					});
				});
			},
		};
		const resetPitchAction: SettingDefinitionAction = {
			name: STRINGS.settingPitchReset,
			action: () => {
				void this.resetPitch();
			},
		};
		const supportControls: SettingDefinitionRender = {
			name: STRINGS.supportHeading,
			desc: STRINGS.supportDesc,
			render: (setting) => this.renderSupportControls(setting),
		};
		const supportFaq: SettingDefinitionRender = {
			name: STRINGS.supportFaqHeading,
			render: (setting) => this.renderSupportFaq(setting),
		};

		return [
			previewControls,
			providerDef,
			...(shouldUseEdgeProvider(this.plugin.settings.provider, Platform.isDesktopApp)
				? [edgeVoiceDef]
				: []),
			...(shouldUseAzureProvider(this.plugin.settings.provider)
				? [azureKeyControl, azureRegionDef, azureVoiceDef]
				: []),
			...(!shouldUseEdgeProvider(this.plugin.settings.provider, Platform.isDesktopApp) && !shouldUseAzureProvider(this.plugin.settings.provider)
				? [voiceDef]
				: []),
			rateDef,
			resetAction,
			pitchDef,
			resetPitchAction,
			autoNextDef,
			folderDef,
			pronDef,
			silentDef,
			supportControls,
			supportFaq,
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
		if (key === 'provider') (this as unknown as { update?: () => void }).update?.();
		if (shouldAutoPreviewOnSettingChange(key, this.plugin.settings.provider, Platform.isDesktopApp)) {
			this.preview();
		}
	}

	/** 語速回預設 1.0x(宣告式路徑用;重繪讓 slider 反映新值)。 */
	private async resetRate(): Promise<void> {
		this.plugin.settings.rate = 1.0;
		await this.plugin.saveSettings();
		// update() 為 1.13.0+ API。此方法僅由宣告式路徑(1.13.0+)觸發,故一定存在;
		// 以最小型別 + optional call 做 feature-detection,避開靜態版本檢查並多一層 runtime 保護。
		(this as unknown as { update?: () => void }).update?.();
	}

	private async resetPitch(): Promise<void> {
		this.plugin.settings.pitch = 0;
		await this.plugin.saveSettings();
		(this as unknown as { update?: () => void }).update?.();
	}

	display(): void {
		this.renderLegacySettings();
	}

	/** Obsidian 1.12 與更早版本的設定頁；切換引擎時只重繪這個 fallback。 */
	private renderLegacySettings(): void {
		const { containerEl } = this;
		containerEl.empty();

		const synth = window.speechSynthesis;
		const voices = synth ? availableVoices(synth.getVoices()) : [];

		new Setting(containerEl)
			.setName(STRINGS.previewHeading)
			.setDesc(STRINGS.previewDesc)
			.addButton((btn) =>
				btn.setButtonText(STRINGS.previewButton).setIcon('play').onClick(() => this.preview()),
			)
			.addButton((btn) =>
				btn
					.setButtonText(STRINGS.previewStopButton)
					.setIcon('square')
					.onClick(() => this.stopPreview()),
			);

		new Setting(containerEl)
			.setName(STRINGS.settingProvider)
			.setDesc(STRINGS.settingProviderDesc)
			.addDropdown((dd) => {
				dd.addOption('local', STRINGS.settingProviderLocal);
				dd.addOption('edge', STRINGS.settingProviderEdge);
				dd.addOption('azure', STRINGS.settingProviderAzure);
				dd.setValue(this.plugin.settings.provider);
				dd.onChange(async (val) => {
					this.plugin.settings.provider = val as TtsProvider;
					await this.plugin.saveSettings();
					this.renderLegacySettings();
				});
			});

		if (shouldUseEdgeProvider(this.plugin.settings.provider, Platform.isDesktopApp)) {
			new Setting(containerEl)
				.setName(STRINGS.settingEdgeVoice)
				.setDesc(STRINGS.settingEdgeVoiceDesc)
				.addDropdown((dd) => {
					for (const [id, label] of Object.entries(cloudVoiceOptions())) dd.addOption(id, label);
					dd.setValue(this.plugin.settings.edgeVoice).onChange(async (val) => {
						this.plugin.settings.edgeVoice = val;
						await this.plugin.saveSettings();
						this.preview();
					});
				});
		}

		if (shouldUseAzureProvider(this.plugin.settings.provider)) {
			new Setting(containerEl)
				.setName(STRINGS.settingAzureKey)
				.setDesc(STRINGS.settingAzureKeyDesc)
				.addText((tc) => {
					tc.inputEl.type = 'password';
					tc.setPlaceholder(STRINGS.settingAzureKeyPlaceholder).setValue(this.plugin.settings.azureKey).onChange(async (val) => {
						this.plugin.settings.azureKey = val.trim();
						await this.plugin.saveSettings();
					});
				});
			new Setting(containerEl)
				.setName(STRINGS.settingAzureRegion)
				.setDesc(STRINGS.settingAzureRegionDesc)
				.addText((tc) => tc.setPlaceholder('Eastasia').setValue(this.plugin.settings.azureRegion).onChange(async (val) => {
					this.plugin.settings.azureRegion = val.trim();
					await this.plugin.saveSettings();
				}));
			new Setting(containerEl)
				.setName(STRINGS.settingAzureVoice)
				.setDesc(STRINGS.settingAzureVoiceDesc)
				.addDropdown((dd) => {
					for (const [id, label] of Object.entries(cloudVoiceOptions())) dd.addOption(id, label);
					dd.setValue(this.plugin.settings.azureVoice).onChange(async (val) => {
						this.plugin.settings.azureVoice = val;
						await this.plugin.saveSettings();
						this.preview();
					});
				});
		}

		if (!shouldUseEdgeProvider(this.plugin.settings.provider, Platform.isDesktopApp) && !shouldUseAzureProvider(this.plugin.settings.provider)) {
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
					if (shouldAutoPreviewOnSettingChange('voiceName', this.plugin.settings.provider, Platform.isDesktopApp)) {
						this.preview();
					}
				});
			});
		if (voices.length === 0) {
			voiceSetting.setDesc(STRINGS.settingNoVoices);
		}
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
			;

		let pitchSlider: SliderComponent;
		new Setting(containerEl)
			.setName(STRINGS.settingPitch)
			.setDesc(STRINGS.settingPitchDesc)
			.addSlider((sl) => {
				pitchSlider = sl;
				sl.setLimits(-10, 10, 1).setValue(this.plugin.settings.pitch);
				sl.onChange(async (val) => {
					this.plugin.settings.pitch = val;
					await this.plugin.saveSettings();
				});
			})
			.addExtraButton((btn) => {
				btn.setIcon('rotate-ccw')
					.setTooltip(STRINGS.settingPitchReset)
					.onClick(async () => {
						this.plugin.settings.pitch = 0;
						pitchSlider.setValue(0);
						await this.plugin.saveSettings();
					});
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

		new Setting(containerEl)
			.setName(STRINGS.settingSilentSymbols)
			.setDesc(STRINGS.settingSilentSymbolsDesc)
			.addText((tc) => {
				tc.setPlaceholder(STRINGS.settingSilentSymbolsPlaceholder)
					.setValue(this.plugin.settings.silentSymbols)
					.onChange(async (val) => {
						this.plugin.settings.silentSymbols = val;
						await this.plugin.saveSettings();
					});
			});

		const supportSetting = new Setting(containerEl)
			.setName(STRINGS.supportHeading)
			.setDesc(STRINGS.supportDesc);
		this.renderSupportControls(supportSetting);
		this.renderSupportFaq(new Setting(containerEl).setName(STRINGS.supportFaqHeading));
		this.renderHelp(containerEl);
	}

	private platformLabel(): string {
		if (Platform.isAndroidApp) return 'Android app';
		if (Platform.isIosApp) return 'iOS app';
		if (Platform.isDesktopApp) return 'Desktop';
		return 'Unknown';
	}

	private currentVoiceId(provider = this.plugin.settings.provider): string {
		if (provider === 'edge') return this.plugin.settings.edgeVoice;
		if (provider === 'azure') return this.plugin.settings.azureVoice;
		const synth = window.speechSynthesis;
		return (synth ? pickVoice(synth.getVoices(), this.plugin.settings.voiceName)?.name : null)
			?? this.plugin.settings.voiceName
			?? '自動';
	}

	private makeSupportDiagnostic(
		status: SupportDiagnostic['status'],
		outcome?: SupportCheckOutcome,
	): SupportDiagnostic {
		const provider = this.plugin.settings.provider;
		const effective = effectiveSupportProvider(provider, Platform.isDesktopApp);
		return {
			pluginVersion: this.plugin.manifest.version,
			obsidianVersion: apiVersion,
			platform: this.platformLabel(),
			provider,
			effectiveProvider: effective.effectiveProvider,
			fallbackReason: effective.fallbackReason,
			voice: this.currentVoiceId(effective.effectiveProvider),
			rate: this.plugin.settings.rate,
			pitch: this.plugin.settings.pitch,
			status,
			stage: outcome?.stage,
			errorCode: status === 'failed' && outcome ? supportErrorCode(provider, outcome.message) : undefined,
		};
	}

	private updateSupportDiagnostic(diagnostic: SupportDiagnostic): void {
		this.supportDiagnostic = diagnostic;
		if (!this.supportStatusEl) return;
		this.supportStatusEl.setText(formatSupportSummary(diagnostic));
		this.supportStatusEl.classList.toggle('is-success', diagnostic.status === 'passed');
		this.supportStatusEl.classList.toggle('is-error', diagnostic.status === 'failed');
	}

	private isSupportDiagnosticCurrent(diagnostic: SupportDiagnostic): boolean {
		const current = this.makeSupportDiagnostic('not-run');
		return diagnostic.pluginVersion === current.pluginVersion
			&& diagnostic.provider === current.provider
			&& diagnostic.effectiveProvider === current.effectiveProvider
			&& diagnostic.voice === current.voice
			&& diagnostic.rate === current.rate
			&& diagnostic.pitch === current.pitch;
	}

	private renderSupportControls(setting: Setting): void {
		setting
			.addButton((button) => button
				.setButtonText(STRINGS.supportCheckButton)
				.setIcon('stethoscope')
				.onClick(() => void this.runEnvironmentCheck()))
			.addButton((button) => button
				.setButtonText(STRINGS.supportCopyButton)
				.setIcon('copy')
				.onClick(() => void this.copyAiDiagnostic()));
		this.supportStatusEl = setting.descEl.createDiv({ cls: 'tw-tts-support-status' });
		const diagnostic = this.supportDiagnostic && this.isSupportDiagnosticCurrent(this.supportDiagnostic)
			? this.supportDiagnostic
			: this.makeSupportDiagnostic('not-run');
		this.updateSupportDiagnostic(diagnostic);
	}

	private renderSupportFaq(setting: Setting): void {
		const list = setting.descEl.createDiv({ cls: 'tw-tts-support-faq' });
		for (const item of SUPPORT_FAQ) {
			const details = list.createEl('details');
			details.createEl('summary', { text: item.question });
			details.createEl('p', { text: item.answer });
		}
	}

	private async runEnvironmentCheck(): Promise<void> {
		const checkGeneration = ++this.supportCheckGeneration;
		const effectiveProvider = effectiveSupportProvider(this.plugin.settings.provider, Platform.isDesktopApp).effectiveProvider;
		this.updateSupportDiagnostic(this.makeSupportDiagnostic('checking', {
			passed: false,
			stage: effectiveProvider === 'edge' ? 'edge-cli' : effectiveProvider === 'azure' ? 'azure-api' : 'local-api',
			message: STRINGS.supportChecking,
		}));

		let outcome: SupportCheckOutcome;
		if (effectiveProvider === 'edge') {
			outcome = await this.previewEdge(false);
		} else if (effectiveProvider === 'azure') {
			outcome = await this.previewAzure(false);
		} else {
			const synth = window.speechSynthesis;
			const voice = synth ? pickVoice(synth.getVoices(), this.plugin.settings.voiceName) : null;
			const error = playbackError({
				hasSpeechApi: !!synth,
				hasVoice: !!voice,
				isAndroid: Platform.isAndroidApp,
				isIos: Platform.isIosApp,
				isDesktop: Platform.isDesktopApp,
			});
			if (error || !synth || !voice) {
				outcome = { passed: false, stage: 'local-api', message: error?.title ?? STRINGS.previewNoVoice };
			} else {
				this.preview();
				outcome = { passed: true, stage: 'local-api', message: '已偵測到系統語音 API 與指定語音，試聽已啟動。' };
			}
		}

		if (checkGeneration !== this.supportCheckGeneration) return;
		this.updateSupportDiagnostic(this.makeSupportDiagnostic(outcome.passed ? 'passed' : 'failed', outcome));
		new Notice(outcome.passed ? STRINGS.supportCheckPassed : outcome.message, 8000);
	}

	private async copyAiDiagnostic(): Promise<void> {
		const diagnostic = this.supportDiagnostic && this.isSupportDiagnosticCurrent(this.supportDiagnostic)
			? this.supportDiagnostic
			: this.makeSupportDiagnostic('not-run');
		try {
			await navigator.clipboard.writeText(formatAiSupportPrompt(diagnostic));
			new Notice(STRINGS.supportCopySuccess);
		} catch {
			new Notice(STRINGS.supportCopyFailed, 8000);
		}
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

	/** 用目前設定的中文或英文語音、語速與音高唸一句範例。 */
	private preview(): void {
		if (shouldUseEdgeProvider(this.plugin.settings.provider, Platform.isDesktopApp)) {
			void this.previewEdge();
			return;
		}
		if (shouldUseAzureProvider(this.plugin.settings.provider)) {
			void this.previewAzure();
			return;
		}
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
		const sample = previewLanguage(voice.lang) === 'en'
			? STRINGS.previewSampleEnglish
			: STRINGS.previewSample;
		const u = new SpeechSynthesisUtterance(sample);
		u.voice = voice;
		u.lang = voice.lang;
		u.rate = this.plugin.settings.rate;
		u.pitch = semitonesToSpeechPitch(this.plugin.settings.pitch);
		synth.speak(u);
	}

	private async previewEdge(showNotice = true): Promise<SupportCheckOutcome> {
		this.stopPreview();
		const generation = this.previewGeneration;
		let blob: Blob;
		try {
			const voice = this.plugin.settings.edgeVoice;
			const sample = previewLanguage(voice) === 'en'
				? STRINGS.previewSampleEnglish
				: STRINGS.previewSample;
			blob = await new EdgeCliSpeechClient().synthesize(sample, {
				voice,
				rate: this.plugin.settings.rate,
				pitch: this.plugin.settings.pitch,
			});
		} catch (error) {
			const safeMessage = edgeFailureMessage(error as { code?: string | number; killed?: boolean; message?: string });
			if (generation === this.previewGeneration) {
				const code = supportErrorCode('edge', safeMessage);
				console.error('[Hans TW TTS] Edge preview synthesis failed', { code, stage: 'edge-cli' });
				if (showNotice) new Notice(safeMessage, 8000);
			}
			return { passed: false, stage: 'edge-cli', message: safeMessage };
		}
		if (generation !== this.previewGeneration) {
			return { passed: false, stage: 'edge-cli', message: 'Edge 環境檢查已取消。' };
		}
		try {
			const audio = createEdgeAudio(blob);
			this.edgePreviewAudio = audio;
			audio.onEnded = () => this.releaseEdgePreview(audio);
			audio.onError = () => {
				this.releaseEdgePreview(audio);
				if (showNotice) new Notice('Edge 語音試聽播放失敗。');
			};
			await audio.play();
			return { passed: true, stage: 'audio-playback', message: 'Edge CLI 合成成功，指定語音的音訊播放已啟動。' };
		} catch {
			if (this.edgePreviewAudio) this.releaseEdgePreview(this.edgePreviewAudio);
			const message = 'Edge 語音已產生，但試聽音訊無法播放。請確認系統輸出裝置後重試。';
			if (generation === this.previewGeneration) {
				if (showNotice) new Notice(message, 8000);
			}
			return { passed: false, stage: 'audio-playback', message };
		}
	}

	private async previewAzure(showNotice = true): Promise<SupportCheckOutcome> {
		this.stopPreview();
		const generation = this.previewGeneration;
		try {
			const voice = this.plugin.settings.azureVoice;
			const sample = previewLanguage(voice) === 'en' ? STRINGS.previewSampleEnglish : STRINGS.previewSample;
			const blob = await new ObsidianAzureSpeechClient({
				key: this.plugin.settings.azureKey,
				region: this.plugin.settings.azureRegion,
			}).synthesize(sample, { voice, rate: this.plugin.settings.rate, pitch: this.plugin.settings.pitch });
			if (generation !== this.previewGeneration) {
				return { passed: false, stage: 'azure-api', message: 'Azure 環境檢查已取消。' };
			}
			const audio = createEdgeAudio(blob);
			this.edgePreviewAudio = audio;
			audio.onEnded = () => this.releaseEdgePreview(audio);
			audio.onError = () => {
				this.releaseEdgePreview(audio);
				if (showNotice) new Notice('Azure 語音試聽播放失敗。');
			};
			await audio.play();
			return { passed: true, stage: 'audio-playback', message: 'Azure Speech 合成成功，指定語音的音訊播放已啟動。' };
		} catch (error) {
			if (this.edgePreviewAudio) this.releaseEdgePreview(this.edgePreviewAudio);
			if (generation !== this.previewGeneration) {
				return { passed: false, stage: 'azure-api', message: 'Azure 環境檢查已取消。' };
			}
			const message = safeAzureFailureMessage(error);
			if (showNotice) new Notice(`Azure 語音試聽失敗：${message}`, 10000);
			return { passed: false, stage: 'azure-api', message };
		}
	}

	private releaseEdgePreview(audio: EdgeAudio): void {
		if (this.edgePreviewAudio !== audio) return;
		audio.release();
		this.edgePreviewAudio = null;
	}

	private stopPreview(): void {
		this.previewGeneration++;
		window.speechSynthesis?.cancel();
		if (this.edgePreviewAudio) this.releaseEdgePreview(this.edgePreviewAudio);
	}
}
