import {
	Notice,
	Platform,
	Plugin,
	TFile,
	TFolder,
	WorkspaceLeaf,
} from 'obsidian';
import { setLocale, STRINGS } from './i18n';
import {
	sentenceIndexForPrefix,
	splitIntoSpeechSentences,
	type SpeechTimingOptions,
} from './sentence-splitter';
import { formatTtsDiagnostics } from './tts-diagnostics';
import { orderNotesByPath } from './note-order';
import { shouldUseAndroidSelectToSpeak } from './provider-policy';
import {
	DEFAULT_SETTINGS,
	TwTtsSettingTab,
	type TwTtsSettings,
} from './settings';
import { TwTtsReaderView, VIEW_TYPE_TW_TTS } from './reader-view';
import type { MarkdownReaderOptions } from './markdown-reader';
import { sanitizeBookmarks } from './playback-progress';
import {
	AZURE_SECRET_ID,
	migratePlaintextSecret,
	readSecret,
	secretStorageFromApp,
	withoutPlaintextSecret,
} from './secret-storage';
import { CachingSpeechClient, type AudioCacheStore } from './audio-cache';
import { ObsidianAudioCache } from './obsidian-audio-cache';
import { EdgeCliSpeechClient, type EdgeSpeechClient } from './edge-tts';
import { ObsidianAzureSpeechClient } from './azure-obsidian';
import { applyPronunciation, parseRules, parseSilentSymbols } from './pronunciation';
import { applyBuiltinRules } from './traditional-reading';
import { prepareSpokenSentences, type SpeechSentence } from './speech-plan';

export default class TwTtsPlugin extends Plugin {
	settings!: TwTtsSettings;
	private audioCache!: AudioCacheStore;

	async onload(): Promise<void> {
		await this.loadSettings();
		setLocale(this.settings.interfaceLanguage);
		const cacheDirectory = `${this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`}/audio-cache`;
		this.audioCache = new ObsidianAudioCache(
			this.app.vault.adapter,
			cacheDirectory,
			() => this.settings.audioCacheMb * 1024 * 1024,
		);

		// 提前喚醒語音清單(部分平台 getVoices() 首次為空,需非同步載入)
		window.speechSynthesis?.getVoices();

		this.registerView(
			VIEW_TYPE_TW_TTS,
			(leaf) => new TwTtsReaderView(leaf, this),
		);

		this.addRibbonIcon('volume-2', STRINGS.ribbonTooltip, () => {
			void this.readActiveNote();
		});

		const statusBar = this.addStatusBarItem();
		statusBar.addClass('mod-clickable');
		statusBar.setText(`🔊 ${STRINGS.statusIdle}`);
		statusBar.setAttr('aria-label', STRINGS.ribbonTooltip);
		statusBar.addEventListener('click', () => {
			void this.readActiveNote();
		});

		this.addCommand({
			id: 'read-note',
			name: STRINGS.cmdReadNote,
			callback: () => void this.readActiveNote(),
		});
		this.addCommand({
			id: 'read-selection',
			name: STRINGS.cmdReadSelection,
			editorCallback: (editor) => void this.readSelection(editor.getSelection()),
		});
		this.addCommand({
			id: 'read-from-cursor',
			name: STRINGS.cmdReadFromCursor,
			editorCallback: (editor) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') {
					new Notice(STRINGS.noActiveNote);
					return;
				}
				const prefix = editor.getRange({ line: 0, ch: 0 }, editor.getCursor());
				void this.readFile(file, sentenceIndexForPrefix(prefix, this.getMarkdownReaderOptions()));
			},
		});
		this.addCommand({
			id: 'read-folder',
			name: STRINGS.cmdReadFolder,
			callback: () => {
				const folder = this.app.workspace.getActiveFile()?.parent;
				if (!folder) {
					new Notice(STRINGS.noActiveNote);
					return;
				}
				void this.readFolder(folder);
			},
		});
		this.addCommand({
			id: 'stop',
			name: STRINGS.cmdStop,
			callback: () => this.stopAll(),
		});
		this.addCommand({
			id: 'open-reader',
			name: STRINGS.cmdOpenReader,
			callback: () => void this.activateView(),
		});
		this.addCommand({
			id: 'tts-diagnostics',
			name: STRINGS.cmdTtsDiagnostics,
			callback: () => this.showTtsDiagnostics(),
		});
		this.addCommand({
			id: 'export-note-mp3',
			name: STRINGS.cmdExportMp3,
			callback: () => void this.exportActiveNoteMp3(),
		});

		// 檔案總管右鍵資料夾 → 朗讀此資料夾
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFolder)) return;
				menu.addItem((item) =>
					item
						.setTitle(STRINGS.menuReadFolder)
						.setIcon('volume-2')
						.onClick(() => void this.readFolder(file)),
				);
			}),
		);

		this.addSettingTab(new TwTtsSettingTab(this.app, this));
	}

	onunload(): void {
		window.speechSynthesis?.cancel();
	}

	/** 診斷:顯示這台裝置的 speechSynthesis 狀態 + WebView 版本,供截圖回報。 */
	private showTtsDiagnostics(): void {
		const synth = window.speechSynthesis;
		const voices = synth ? synth.getVoices() : [];
		const zhVoices = voices
			.filter((v) => /^zh/i.test(v.lang))
			.map((v) => `${v.name} (${v.lang})`);
		const platform = Platform.isAndroidApp
			? 'Android app'
			: Platform.isIosApp
				? 'iOS app'
				: Platform.isDesktopApp
					? 'Desktop'
					: 'Unknown';
		// OS 判斷用 Platform;此處讀 userAgent 只為診斷「WebView/Chromium 版本」
		// (speechSynthesis 支援與版本相關),非用來分支邏輯,故以鬆散型別變數存取。
		const nav = window.navigator as unknown as { userAgent?: string };
		const lines = formatTtsDiagnostics({
			hasSpeechSynthesis: !!synth,
			voiceCount: voices.length,
			zhVoices,
			userAgent: nav.userAgent ?? '',
			platform,
		});
		// duration 0 = 停留到點擊,方便手機截圖回報。
		new Notice(lines.join('\n'), 0);
	}

	/** 朗讀目前開啟的筆記。 */
	async readActiveNote(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== 'md') {
			new Notice(STRINGS.noActiveNote);
			return;
		}
		await this.readFile(file);
	}

	/** 朗讀單一檔案,可指定起始句。 */
	async readFile(file: TFile, startIndex = 0): Promise<void> {
		if (this.handoffToAndroidSelectToSpeak()) return;
		const view = await this.activateView();
		await view.playFile(file, startIndex);
	}

	/** 連播一個資料夾內的筆記。 */
	async readFolder(folder: TFolder): Promise<void> {
		if (this.handoffToAndroidSelectToSpeak()) return;
		const files = this.collectFolderNotes(folder);
		if (files.length === 0) {
			new Notice(STRINGS.noFolderNotes);
			return;
		}
		const view = await this.activateView();
		await view.playQueue(files);
	}

	/** 朗讀選取文字。 */
	async readSelection(selection: string): Promise<void> {
		if (this.handoffToAndroidSelectToSpeak()) return;
		const text = selection.trim();
		if (!text) {
			new Notice(STRINGS.noSelection);
			return;
		}
		const sentences = splitIntoSpeechSentences(
			text,
			this.getMarkdownReaderOptions(),
			this.getSpeechTimingOptions(),
		);
		const view = await this.activateView();
		view.readSentences(sentences);
	}

	/** Android 不啟動外掛引擎，只顯示系統隨選朗讀的操作指引。 */
	private handoffToAndroidSelectToSpeak(): boolean {
		if (!shouldUseAndroidSelectToSpeak(Platform.isAndroidApp)) return false;
		new Notice([
			STRINGS.androidModeTitle,
			...STRINGS.androidModeSteps,
		].join('\n'), 0);
		return true;
	}

	/** 蒐集資料夾內的 .md(依設定決定是否含子資料夾),依路徑排序。 */
	private collectFolderNotes(folder: TFolder): TFile[] {
		const recursive = this.settings.folderQueueRecursive;
		const out: TFile[] = [];
		const walk = (f: TFolder): void => {
			for (const child of f.children) {
				if (child instanceof TFile) {
					if (child.extension === 'md') out.push(child);
				} else if (recursive && child instanceof TFolder) {
					walk(child);
				}
			}
		};
		walk(folder);
		return orderNotesByPath(out);
	}

	/** 同資料夾、排序後的下一篇 .md;沒有則回 null。 */
	nextSiblingNote(file: TFile): TFile | null {
		const parent = file.parent;
		if (!parent) return null;
		const siblings = orderNotesByPath(
			parent.children.filter(
				(c): c is TFile => c instanceof TFile && c.extension === 'md',
			),
		);
		const idx = siblings.findIndex((f) => f.path === file.path);
		if (idx < 0 || idx + 1 >= siblings.length) return null;
		return siblings[idx + 1];
	}

	stopAll(): void {
		window.speechSynthesis?.cancel();
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_TW_TTS)[0];
		const view = leaf?.view;
		if (view instanceof TwTtsReaderView) view.stop();
	}

	/** 開啟(或聚焦)朗讀窗格,回傳其 view。 */
	async activateView(): Promise<TwTtsReaderView> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null =
			workspace.getLeavesOfType(VIEW_TYPE_TW_TTS)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_TW_TTS, active: true });
		}
		await workspace.revealLeaf(leaf);
		return leaf.view as TwTtsReaderView;
	}

	async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as Partial<TwTtsSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {});
		this.settings.playbackBookmarks = sanitizeBookmarks(this.settings.playbackBookmarks);
		this.settings.seekSeconds = Math.min(60, Math.max(5, Number(this.settings.seekSeconds) || 15));
		const cacheMb = Number(this.settings.audioCacheMb);
		this.settings.audioCacheMb = Number.isFinite(cacheMb)
			? Math.min(1000, Math.max(0, cacheMb))
			: 200;
		this.settings.interfaceLanguage = this.settings.interfaceLanguage === 'en' ? 'en' : 'zh-TW';
		for (const key of [
			'builtinAiTerms', 'builtinMarkdownSymbols', 'builtinMixedText',
			'naturalizeMath', 'naturalizeTables', 'keyPointsOnly',
		] as const) {
			if (typeof this.settings[key] !== 'boolean') this.settings[key] = DEFAULT_SETTINGS[key];
		}
		const migration = migratePlaintextSecret(
			secretStorageFromApp(this.app),
			AZURE_SECRET_ID,
			this.settings.azureKey,
		);
		this.settings.azureKey = migration.plaintext;
		if (migration.migrated) await this.saveSettings();
	}

	async saveSettings(): Promise<void> {
		// Azure credentials are memory-only on legacy Obsidian and SecretStorage-only
		// on supported versions. They are never written back to plugin data.
		const persisted = withoutPlaintextSecret({ ...this.settings });
		await this.saveData(persisted);
	}

	getAzureKey(): string {
		return readSecret(secretStorageFromApp(this.app), AZURE_SECRET_ID, this.settings.azureKey);
	}

	async setAzureKey(value: string): Promise<void> {
		const storage = secretStorageFromApp(this.app);
		if (storage) {
			storage.setSecret(AZURE_SECRET_ID, value.trim());
			this.settings.azureKey = '';
		} else {
			this.settings.azureKey = value.trim();
		}
		await this.saveSettings();
	}

	getOnlineSpeechClient(): EdgeSpeechClient | null {
		if (this.settings.provider === 'edge' && Platform.isDesktopApp) {
			return new CachingSpeechClient('edge', new EdgeCliSpeechClient(), this.audioCache);
		}
		if (this.settings.provider === 'azure') {
			return new CachingSpeechClient(
				'azure',
				new ObsidianAzureSpeechClient({ key: this.getAzureKey(), region: this.settings.azureRegion }),
				this.audioCache,
			);
		}
		return null;
	}

	async clearAudioCache(): Promise<void> {
		await this.audioCache.clear();
	}

	applyReadingRules(text: string): string {
		const builtIn = applyBuiltinRules(text, {
			aiTerms: this.settings.builtinAiTerms,
			markdownSymbols: this.settings.builtinMarkdownSymbols,
			mixedText: this.settings.builtinMixedText,
		});
		return applyPronunciation(
			applyPronunciation(builtIn, parseRules(this.settings.pronunciationRules)),
			parseSilentSymbols(this.settings.silentSymbols),
		);
	}

	prepareSpokenPlan(sentences: readonly SpeechSentence[]): SpeechSentence[] {
		return prepareSpokenSentences(sentences, (text) => this.applyReadingRules(text));
	}

	private async exportActiveNoteMp3(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== 'md') {
			new Notice(STRINGS.noActiveNote);
			return;
		}
		const client = this.getOnlineSpeechClient();
		if (!client) {
			new Notice(STRINGS.exportNeedsOnline);
			return;
		}
		const content = await this.app.vault.cachedRead(file);
		const sentences = splitIntoSpeechSentences(
			content,
			this.getMarkdownReaderOptions(),
			this.getSpeechTimingOptions(),
		);
		const spoken = this.prepareSpokenPlan(sentences).map((sentence) => sentence.text);
		if (spoken.length === 0) {
			new Notice(STRINGS.noContent);
			return;
		}
		const exportText = spoken.join('。');
		if (exportText.length > 6000) {
			new Notice(STRINGS.exportTooLong(exportText.length), 8000);
			return;
		}
		const estimatedMinutes = Math.max(1, Math.ceil(exportText.length / 500));
		new Notice(STRINGS.exportPreparing(exportText.length, estimatedMinutes), 6000);
		const voiceSettings = {
			voice: this.settings.provider === 'azure' ? this.settings.azureVoice : this.settings.edgeVoice,
			rate: this.settings.rate,
			pitch: this.settings.pitch,
		};
		try {
			const output = await client.synthesize(exportText, voiceSettings);
			const path = await this.app.fileManager.getAvailablePathForAttachment(`${file.basename}.mp3`, file.path);
			await this.app.vault.createBinary(path, await output.arrayBuffer());
			new Notice(STRINGS.exportSucceeded(path), 8000);
		} catch {
			new Notice(STRINGS.exportFailed, 8000);
		}
	}

	getMarkdownReaderOptions(): MarkdownReaderOptions {
		return {
			readStandaloneTags: this.settings.readStandaloneTags,
			readBareUrls: this.settings.readBareUrls,
			readMath: this.settings.readMath,
			readTaskStatus: this.settings.readTaskStatus,
			readFoldedCalloutContent: this.settings.readFoldedCalloutContent,
			naturalizeMath: this.settings.naturalizeMath,
			naturalizeTables: this.settings.naturalizeTables,
			keyPointsOnly: this.settings.keyPointsOnly,
		};
	}

	getSpeechTimingOptions(): SpeechTimingOptions {
		return {
			paragraphPauseMs: this.settings.paragraphPauseMs,
			headingPauseMs: this.settings.headingPauseMs,
		};
	}
}
