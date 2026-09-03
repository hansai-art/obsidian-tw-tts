import {
	ItemView,
	Notice,
	Platform,
	TFile,
	WorkspaceLeaf,
	setIcon,
} from 'obsidian';
import type TwTtsPlugin from './main';
import { STRINGS } from './i18n';
import {
	semitonesToSpeechPitch,
	TtsEngine,
	type TtsSynth,
	type TtsUtterance,
} from './tts-engine';
import { pickVoice } from './voice-catalog';
import { splitIntoSpeechSentences } from './sentence-splitter';
import type { SpeechSentence } from './speech-plan';

import { playbackError, type ActionableError } from './playback-error';
import { shouldUseAzureProvider, shouldUseEdgeProvider } from './provider-policy';
import {
	createEdgeAudio,
	EdgeCliSpeechClient,
	EdgeTtsEngine,
} from './edge-tts';
import { ObsidianAzureSpeechClient } from './azure-obsidian';
import { estimatedPlanProgress, progressPercent, resumableIndex, seekSentenceIndex, speechPlanFingerprint } from './playback-progress';
import {
	configureMediaSession,
	updateMediaProgress,
	type MediaMetadataConstructor,
	type MediaSessionLike,
} from './media-session';

export const VIEW_TYPE_TW_TTS = 'tw-read-aloud-view';

interface ResolvedVoice {
	synthApi: SpeechSynthesis;
	voice: SpeechSynthesisVoice;
}

interface PlaybackEngine {
	readonly currentIndex: number;
	readonly total: number;
	start(sentences: SpeechSentence[], fromIndex?: number): void;
	setRate(rate: number): void;
	pause(): void;
	resume(): void;
	stop(): void;
	next(): void;
	prev(): void;
	jumpTo(index: number): void;
}

/** 獨立閱讀窗格:逐句顯示 + 目前句反白 + 播放控制列 + 資料夾連播。 */
export class TwTtsReaderView extends ItemView {
	private plugin: TwTtsPlugin;
	private engine: PlaybackEngine | null = null;
	private titleEl!: HTMLElement;
	private listEl!: HTMLElement;
	private sentenceEls: HTMLElement[] = [];
	private currentEl: HTMLElement | null = null;
	private playPauseBtn!: HTMLElement;
	private rateLabel!: HTMLElement;
	private progressLabel!: HTMLElement;
	private progressInput!: HTMLInputElement;
	private playing = false;
	private paused = false;
	// 連播佇列:單篇 = [該篇];資料夾連播 = 多篇。
	private queue: TFile[] = [];
	private queueIndex = 0;
	private currentFile: TFile | null = null;

	private currentSentences: SpeechSentence[] = [];
	private releaseMediaSession: () => void = () => undefined;
	private loadGeneration = 0;

	constructor(leaf: WorkspaceLeaf, plugin: TwTtsPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_TW_TTS;
	}
	getDisplayText(): string {
		return STRINGS.viewTitle;
	}
	getIcon(): string {
		return 'volume-2';
	}

	async onOpen(): Promise<void> {
		this.renderShell();
	}

	async onClose(): Promise<void> {
		this.stop();
	}

	private renderShell(): void {
		const c = this.contentEl;
		c.empty();
		c.addClass('tw-tts-view');

		this.titleEl = c.createDiv('tw-tts-title');
		this.titleEl.addClass('tw-tts-hidden');
		if (Platform.isAndroidApp) {
			this.listEl = c.createDiv('tw-tts-sentences');
			this.showError(STRINGS.errors.androidUnsupported, false);
			return;
		}

		const bar = c.createDiv('tw-tts-controls');
		this.makeBtn(bar, 'rewind', STRINGS.seekBackwardLabel(this.plugin.settings.seekSeconds), () =>
			this.seekBySeconds(-this.plugin.settings.seekSeconds));
		this.playPauseBtn = this.makeBtn(bar, 'play', STRINGS.play, () =>
			this.togglePlay(),
		);
		this.makeBtn(bar, 'square', STRINGS.stop, () => this.stop());
		this.makeBtn(bar, 'fast-forward', STRINGS.seekForwardLabel(this.plugin.settings.seekSeconds), () =>
			this.seekBySeconds(this.plugin.settings.seekSeconds));
		this.renderRateControl(bar);

		const progress = c.createDiv('tw-tts-progress');
		this.progressInput = progress.createEl('input', {
			type: 'range',
			attr: { min: '0', max: '0', value: '0', 'aria-label': STRINGS.progressLabel },
		});
		this.progressInput.addEventListener('change', () => {
			this.engine?.jumpTo(Number(this.progressInput.value));
			this.setPlayingUI(true, false);
		});
		this.progressLabel = progress.createSpan({ text: '0 / 0（0%）' });

		this.listEl = c.createDiv('tw-tts-sentences');
		c.addEventListener('keydown', (event) => this.handleKeyboard(event));
		this.showEmpty();
	}

	/** 播放當下的語速控制:− [1.0x] +;點中間數字回到預設。 */
	private renderRateControl(bar: HTMLElement): void {
		const group = bar.createDiv('tw-tts-rate');
		this.makeBtn(group, 'minus', STRINGS.rateSlower, () =>
			this.changeRate(this.plugin.settings.rate - 0.1),
		).addClass('tw-tts-btn-mini');
		this.rateLabel = group.createEl('button', { cls: 'tw-tts-rate-label' });
		this.rateLabel.setAttr('aria-label', STRINGS.rateReset);
		this.rateLabel.addEventListener('click', () => this.changeRate(1.0));
		this.makeBtn(group, 'plus', STRINGS.rateFaster, () =>
			this.changeRate(this.plugin.settings.rate + 0.1),
		).addClass('tw-tts-btn-mini');
		this.updateRateLabel();
	}

	/** 套用新語速:存回設定、即時套到引擎、更新顯示。 */
	private changeRate(rate: number): void {
		const r = Math.min(2.0, Math.max(0.5, Math.round(rate * 10) / 10));
		this.plugin.settings.rate = r;
		void this.plugin.saveSettings();
		this.engine?.setRate(r);
		this.updateRateLabel();
	}

	private updateRateLabel(): void {
		this.rateLabel.setText(`${this.plugin.settings.rate.toFixed(1)}x`);
	}

	private makeBtn(
		parent: HTMLElement,
		icon: string,
		label: string,
		onClick: () => void,
	): HTMLElement {
		const btn = parent.createEl('button', { cls: 'tw-tts-btn' });
		btn.setAttr('aria-label', label);
		setIcon(btn, icon);
		btn.addEventListener('click', onClick);
		return btn;
	}

	private showEmpty(): void {
		this.listEl.empty();
		this.sentenceEls = [];
		this.currentEl = null;
		this.listEl.createDiv({ cls: 'tw-tts-empty', text: STRINGS.emptyReader });
		this.updateProgress(0);
	}

	/**
	 * 在窗格內顯示持久的「原因 + 解法」面板,取代秒消的提示。
	 * 使用者可停留閱讀完整解法,而不是只看到「不能用」就消失。
	 */
	private showError(err: ActionableError, notify = true): void {
		this.listEl.empty();
		this.sentenceEls = [];
		this.currentEl = null;
		const panel = this.listEl.createDiv({ cls: 'tw-tts-error' });
		const head = panel.createDiv({ cls: 'tw-tts-error-head' });
		setIcon(head.createSpan({ cls: 'tw-tts-error-icon' }), 'circle-alert');
		head.createDiv({ cls: 'tw-tts-error-title', text: err.title });
		const list = panel.createEl('ul', { cls: 'tw-tts-error-body' });
		for (const line of err.body) list.createEl('li', { text: line });
		// 同時給一則較長的提示指路;完整解法在上方面板持久顯示。
		if (notify) new Notice(err.title, 8000);
	}

	// ── 對外播放入口 ─────────────────────────────────────────

	/** 朗讀一段句子(選取文字用;無檔案脈絡,不會自動下一篇)。 */
	readSentences(sentences: SpeechSentence[], startIndex = 0): void {
		if (sentences.length === 0) {
			new Notice(STRINGS.noContent);
			return;
		}
		this.queue = [];
		this.queueIndex = 0;
		this.currentFile = null;
		this.updateTitle();
		if (this.shouldUseEdge()) {
			this.beginEdgePlayback(sentences, startIndex);
			return;
		}
		if (shouldUseAzureProvider(this.plugin.settings.provider)) {
			this.beginAzurePlayback(sentences, startIndex);
			return;
		}
		const resolved = this.resolveVoice();
		if (resolved) this.beginPlayback(sentences, startIndex, resolved);
	}

	/** 朗讀單一檔案,可指定起始句(從游標處開始唸)。 */
	async playFile(file: TFile, startIndex = 0): Promise<void> {
		this.queue = [file];
		this.queueIndex = 0;
		await this.loadAndStart(file, startIndex);
	}

	/** 連播多篇筆記(資料夾連播)。 */
	async playQueue(files: TFile[], start = 0): Promise<void> {
		if (files.length === 0) {
			new Notice(STRINGS.noFolderNotes);
			return;
		}
		this.queue = files;
		this.queueIndex = start;
		await this.playQueueItem(start);
	}

	private async playQueueItem(i: number): Promise<void> {
		this.queueIndex = i;
		await this.loadAndStart(this.queue[i]);
	}

	/** 讀檔 → 切句 → 開始朗讀;空內容時佇列自動跳下一篇。 */
	private async loadAndStart(file: TFile, startIndex = 0): Promise<void> {
		const generation = ++this.loadGeneration;
		this.currentFile = file;
		this.updateTitle();
		const content = await this.app.vault.cachedRead(file);
		if (generation !== this.loadGeneration) return;
		const sentences = splitIntoSpeechSentences(
			content,
			this.plugin.getMarkdownReaderOptions(),
			this.plugin.getSpeechTimingOptions(),
		);
		if (sentences.length === 0) {
			if (this.queueIndex + 1 < this.queue.length) {
				await this.playQueueItem(this.queueIndex + 1);
				return;
			}
			new Notice(STRINGS.noContent);
			this.finishUI();
			return;
		}
		if (startIndex >= sentences.length) {
			new Notice(STRINGS.noContent);
			this.finishUI();
			return;
		}
		if (startIndex === 0) {
			const saved = resumableIndex(
				this.plugin.settings.playbackBookmarks[file.path],
				sentences.length,
				file.stat.mtime,
				speechPlanFingerprint(sentences),
			);
			if (saved !== null) startIndex = await this.askResume(saved, sentences.length);
			if (generation !== this.loadGeneration) return;
		}
		if (this.shouldUseEdge()) {
			this.beginEdgePlayback(sentences, startIndex);
			return;
		}
		if (shouldUseAzureProvider(this.plugin.settings.provider)) {
			this.beginAzurePlayback(sentences, startIndex);
			return;
		}
		const resolved = this.resolveVoice();
		if (resolved) this.beginPlayback(sentences, startIndex, resolved);
	}

	// ── 引擎啟動 ────────────────────────────────────────────

	private shouldUseEdge(): boolean {
		// iOS / Android 沒有 Node child_process；設定 Edge 時行動版仍安全回落系統語音。
		return shouldUseEdgeProvider(this.plugin.settings.provider, Platform.isDesktopApp);
	}

	private beginEdgePlayback(sentences: SpeechSentence[], startIndex: number): void {
		this.preparePlayback(sentences);
		this.renderSentenceList(sentences);
		const client = this.plugin.getOnlineSpeechClient() ?? new EdgeCliSpeechClient();
		this.engine = new EdgeTtsEngine(
			client,
			createEdgeAudio,
			{
				voice: this.plugin.settings.edgeVoice,
				rate: this.plugin.settings.rate,
				pitch: this.plugin.settings.pitch,
			},
			{
				onSentenceStart: (i) => this.highlight(i),
				onDone: () => this.onFinished(),
				onError: (m) => {
					new Notice(m);
					this.onPlaybackError();
				},
			},
		);
		// Edge 的音檔也應套用既有發音字典與靜音符號，再由引擎逐句生成與播放。
		const spoken = this.plugin.prepareSpokenPlan(sentences);
		this.engine.start(spoken, startIndex);
		this.setPlayingUI(true, false);
	}

	private beginAzurePlayback(sentences: SpeechSentence[], startIndex: number): void {
		this.preparePlayback(sentences);
		this.renderSentenceList(sentences);
		this.engine = new EdgeTtsEngine(
			this.plugin.getOnlineSpeechClient()
				?? new ObsidianAzureSpeechClient({ key: this.plugin.getAzureKey(), region: this.plugin.settings.azureRegion }),
			createEdgeAudio,
			{ voice: this.plugin.settings.azureVoice, rate: this.plugin.settings.rate, pitch: this.plugin.settings.pitch },
			{
				onSentenceStart: (i) => this.highlight(i),
				onDone: () => this.onFinished(),
				onError: (m) => {
					new Notice(m);
					this.onPlaybackError();
				},
			},
			'Azure Speech',
		);
		const spoken = this.plugin.prepareSpokenPlan(sentences);
		this.engine.start(spoken, startIndex);
		this.setPlayingUI(true, false);
	}

	private resolveVoice(): ResolvedVoice | null {
		const synthApi = window.speechSynthesis;
		const voice = synthApi
			? pickVoice(synthApi.getVoices(), this.plugin.settings.voiceName)
			: null;
		const err = playbackError({
			hasSpeechApi: !!synthApi,
			hasVoice: !!voice,
			isAndroid: Platform.isAndroidApp,
			isIos: Platform.isIosApp,
			isDesktop: Platform.isDesktopApp,
		});
		if (err || !synthApi || !voice) {
			// 沒有 err 但仍缺 synth/voice 不該發生;保底顯示一般錯誤,避免 non-null 斷言。
			this.showError(err ?? { title: STRINGS.errors.noSpeechApi.title, body: STRINGS.errors.noSpeechApi.body });
			return null;
		}
		return { synthApi, voice };
	}

	private beginPlayback(
		sentences: SpeechSentence[],
		startIndex: number,
		{ synthApi, voice }: ResolvedVoice,
	): void {
		this.preparePlayback(sentences);
		this.renderSentenceList(sentences);

		const synth: TtsSynth = {
			speak: (u) => synthApi.speak(u as unknown as SpeechSynthesisUtterance),
			cancel: () => synthApi.cancel(),
			pause: () => synthApi.pause(),
			resume: () => synthApi.resume(),
		};
		// 畫面反白顯示原文,送去朗讀的內容才套設定。
		const createUtterance = (text: string): TtsUtterance =>
			new SpeechSynthesisUtterance(this.plugin.applyReadingRules(text)) as unknown as TtsUtterance;

		this.engine = new TtsEngine(
			{
				synth,
				createUtterance,
				voice,
				rate: this.plugin.settings.rate,
				pitch: semitonesToSpeechPitch(this.plugin.settings.pitch),
				lang: voice.lang,
			},
			{
				onSentenceStart: (i) => this.highlight(i),
				onDone: () => this.onFinished(),
				onError: (m) => {
					new Notice(m);
					this.onPlaybackError();
				},
			},
		);

		this.engine.start(sentences, startIndex);
		this.setPlayingUI(true, false);
	}

	private renderSentenceList(sentences: SpeechSentence[]): void {
		this.listEl.empty();
		this.sentenceEls = [];
		this.currentEl = null;
		sentences.forEach((sentence, i) => {
			const el = this.listEl.createDiv({ cls: 'tw-tts-sentence', text: sentence.text });
			el.dataset.index = String(i);
			el.addEventListener('click', () => {
				this.engine?.jumpTo(i);
				this.setPlayingUI(true, false);
			});
			this.sentenceEls.push(el);
		});
		this.progressInput.max = String(Math.max(0, sentences.length - 1));
		this.updateProgress(0);
	}

	private updateTitle(): void {
		if (!this.currentFile) {
			this.titleEl.setText('');
			this.titleEl.addClass('tw-tts-hidden');
			return;
		}
		this.titleEl.removeClass('tw-tts-hidden');
		const name = this.currentFile.basename;
		this.titleEl.setText(
			this.queue.length > 1
				? `▶ ${name}（${this.queueIndex + 1}/${this.queue.length}）`
				: `▶ ${name}`,
		);
	}

	private highlight(index: number): void {
		if (this.currentEl) this.currentEl.removeClass('is-reading');
		const el = this.sentenceEls[index];
		if (!el) return;
		el.addClass('is-reading');
		el.scrollIntoView({ block: 'center', behavior: 'smooth' });
		this.currentEl = el;
		this.updateProgress(index);
		this.saveBookmark(index);
		this.updateMediaState(this.playing, this.paused, index);
	}

	private togglePlay(): void {
		if (!this.engine || !this.playing) {
			// 閒置 → 請主外掛朗讀目前筆記
			void this.plugin.readActiveNote();
			return;
		}
		if (this.paused) {
			this.engine.resume();
			this.setPlayingUI(true, false);
		} else {
			this.engine.pause();
			this.setPlayingUI(true, true);
		}
	}

	stop(): void {
		this.loadGeneration++;
		this.engine?.stop();
		this.queue = [];
		this.queueIndex = 0;
		this.releaseMediaSession();
		this.finishUI();
	}

	private onFinished(): void {
		if (this.currentFile) {
			delete this.plugin.settings.playbackBookmarks[this.currentFile.path];
			void this.plugin.saveSettings();
		}
		// 佇列還有下一篇 → 接著播
		if (this.queueIndex + 1 < this.queue.length) {
			void this.playQueueItem(this.queueIndex + 1);
			return;
		}
		// 單篇模式 + 「自動下一篇」開啟 → 找同資料夾下一篇
		if (
			this.queue.length === 1 &&
			this.plugin.settings.autoNextInFolder &&
			this.currentFile
		) {
			const next = this.plugin.nextSiblingNote(this.currentFile);
			if (next) {
				void this.playFile(next);
				return;
			}
		}
		this.finishUI();
	}

	private onPlaybackError(): void {
		this.releaseMediaSession();
		this.finishUI();
	}

	private finishUI(): void {
		if (this.currentEl) this.currentEl.removeClass('is-reading');
		this.currentEl = null;
		this.setPlayingUI(false, false);
	}

	private setPlayingUI(playing: boolean, paused: boolean): void {
		this.playing = playing;
		this.paused = paused;
		const showResume = !playing || paused;
		setIcon(this.playPauseBtn, showResume ? 'play' : 'pause');
		this.playPauseBtn.setAttr(
			'aria-label',
			!playing ? STRINGS.play : paused ? STRINGS.resume : STRINGS.pause,
		);
		this.updateMediaState(playing, paused, this.engine?.currentIndex ?? 0);
	}

	private updateMediaState(playing: boolean, paused: boolean, index: number): void {
		const progress = estimatedPlanProgress(this.currentSentences, index, this.plugin.settings.rate);
		updateMediaProgress(
			this.mediaSession(), progress.position, progress.duration,
			this.plugin.settings.rate, playing, paused,
		);
	}

	private preparePlayback(sentences: SpeechSentence[]): void {
		this.currentSentences = sentences;
		this.releaseMediaSession();
		const metadata = (window as unknown as { MediaMetadata?: MediaMetadataConstructor }).MediaMetadata;
		this.releaseMediaSession = configureMediaSession(
			this.mediaSession(),
			metadata,
			this.currentFile?.basename ?? STRINGS.viewTitle,
			{
				play: () => this.togglePlay(),
				pause: () => this.togglePlay(),
				stop: () => this.stop(),
				seekBackward: () => this.seekBySeconds(-this.plugin.settings.seekSeconds),
				seekForward: () => this.seekBySeconds(this.plugin.settings.seekSeconds),
				previous: () => this.engine?.prev(),
				next: () => this.engine?.next(),
			},
		);
	}

	private mediaSession(): MediaSessionLike | undefined {
		return (window.navigator as unknown as { mediaSession?: MediaSessionLike }).mediaSession;
	}

	private seekBySeconds(deltaSeconds: number): void {
		if (!this.engine || this.currentSentences.length === 0) return;
		const target = seekSentenceIndex(
			this.currentSentences,
			this.engine.currentIndex,
			deltaSeconds,
			this.plugin.settings.rate,
		);
		this.engine.jumpTo(target);
		this.setPlayingUI(true, false);
	}

	private updateProgress(index: number): void {
		const total = this.currentSentences.length;
		if (!this.progressInput || !this.progressLabel) return;
		this.progressInput.value = String(Math.max(0, index));
		this.progressLabel.setText(
			total === 0
				? '0 / 0（0%）'
				: `${index + 1} / ${total}（${progressPercent(index, total)}%）`,
		);
	}

	private saveBookmark(index: number): void {
		if (!this.currentFile || this.currentSentences.length === 0) return;
		this.plugin.settings.playbackBookmarks[this.currentFile.path] = {
			sentenceIndex: index,
			total: this.currentSentences.length,
			fileMtime: this.currentFile.stat.mtime,
			savedAt: Date.now(),
			planFingerprint: speechPlanFingerprint(this.currentSentences),
		};
		void this.plugin.saveSettings();
	}

	private askResume(index: number, total: number): Promise<number> {
		return new Promise((resolve) => {
			this.listEl.empty();
			const panel = this.listEl.createDiv('tw-tts-resume');
			panel.createDiv({ text: STRINGS.resumePosition(index + 1, total) });
			const actions = panel.createDiv('tw-tts-resume-actions');
			const choose = (value: number): void => {
				panel.remove();
				resolve(value);
			};
			actions.createEl('button', { text: STRINGS.resumeReading })
				.addEventListener('click', () => choose(index));
			actions.createEl('button', { text: STRINGS.restartReading })
				.addEventListener('click', () => choose(0));
		});
	}

	private handleKeyboard(event: KeyboardEvent): void {
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
		if (event.code === 'Space') {
			event.preventDefault();
			this.togglePlay();
		} else if (event.code === 'ArrowLeft') {
			event.preventDefault();
			this.seekBySeconds(-this.plugin.settings.seekSeconds);
		} else if (event.code === 'ArrowRight') {
			event.preventDefault();
			this.seekBySeconds(this.plugin.settings.seekSeconds);
		}
	}

}
