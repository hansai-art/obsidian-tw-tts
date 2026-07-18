import {
	ItemView,
	Notice,
	Platform,
	TFile,
	WorkspaceLeaf,
	setIcon,
} from 'obsidian';
import type TwTtsPlugin from './main';
import { STRINGS } from './i18n/zh-tw';
import { TtsEngine, type TtsSynth, type TtsUtterance } from './tts-engine';
import { pickVoice } from './voice-catalog';
import { splitIntoSentences } from './sentence-splitter';
import {
	applyPronunciation,
	parseRules,
	type PronunciationRule,
} from './pronunciation';

export const VIEW_TYPE_TW_TTS = 'tw-read-aloud-view';

interface ResolvedVoice {
	synthApi: SpeechSynthesis;
	voice: SpeechSynthesisVoice;
}

/** 獨立閱讀窗格:逐句顯示 + 目前句反白 + 播放控制列 + 資料夾連播。 */
export class TwTtsReaderView extends ItemView {
	private plugin: TwTtsPlugin;
	private engine: TtsEngine | null = null;
	private titleEl!: HTMLElement;
	private listEl!: HTMLElement;
	private sentenceEls: HTMLElement[] = [];
	private currentEl: HTMLElement | null = null;
	private playPauseBtn!: HTMLElement;
	private rateLabel!: HTMLElement;
	private playing = false;
	private paused = false;
	// 連播佇列:單篇 = [該篇];資料夾連播 = 多篇。
	private queue: TFile[] = [];
	private queueIndex = 0;
	private currentFile: TFile | null = null;
	private rules: PronunciationRule[] = [];

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

		const bar = c.createDiv('tw-tts-controls');
		this.makeBtn(bar, 'skip-back', STRINGS.prev, () => this.engine?.prev());
		this.playPauseBtn = this.makeBtn(bar, 'play', STRINGS.play, () =>
			this.togglePlay(),
		);
		this.makeBtn(bar, 'square', STRINGS.stop, () => this.stop());
		this.makeBtn(bar, 'skip-forward', STRINGS.next, () => this.engine?.next());
		this.renderRateControl(bar);

		this.listEl = c.createDiv('tw-tts-sentences');
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
	}

	// ── 對外播放入口 ─────────────────────────────────────────

	/** 朗讀一段句子(選取文字用;無檔案脈絡,不會自動下一篇)。 */
	readSentences(sentences: string[], startIndex = 0): void {
		const resolved = this.resolveVoice();
		if (!resolved) return;
		if (sentences.length === 0) {
			new Notice(STRINGS.noContent);
			return;
		}
		this.queue = [];
		this.queueIndex = 0;
		this.currentFile = null;
		this.updateTitle();
		this.beginPlayback(sentences, startIndex, resolved);
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
		this.currentFile = file;
		this.updateTitle();
		const content = await this.app.vault.cachedRead(file);
		const sentences = splitIntoSentences(content);
		if (sentences.length === 0) {
			if (this.queueIndex + 1 < this.queue.length) {
				await this.playQueueItem(this.queueIndex + 1);
				return;
			}
			new Notice(STRINGS.noContent);
			this.finishUI();
			return;
		}
		const resolved = this.resolveVoice();
		if (!resolved) return;
		this.beginPlayback(sentences, startIndex, resolved);
	}

	// ── 引擎啟動 ────────────────────────────────────────────

	private resolveVoice(): ResolvedVoice | null {
		const synthApi = window.speechSynthesis;
		if (!synthApi) {
			new Notice(STRINGS.notSupported);
			return null;
		}
		const voice = pickVoice(synthApi.getVoices(), this.plugin.settings.voiceName);
		if (!voice) {
			this.noticeNoVoice();
			return null;
		}
		return { synthApi, voice };
	}

	private beginPlayback(
		sentences: string[],
		startIndex: number,
		{ synthApi, voice }: ResolvedVoice,
	): void {
		this.renderSentenceList(sentences);
		this.rules = parseRules(this.plugin.settings.pronunciationRules);

		const synth: TtsSynth = {
			speak: (u) => synthApi.speak(u as unknown as SpeechSynthesisUtterance),
			cancel: () => synthApi.cancel(),
			pause: () => synthApi.pause(),
			resume: () => synthApi.resume(),
		};
		// 畫面反白顯示原文,送去朗讀的內容才套發音字典。
		const createUtterance = (text: string): TtsUtterance =>
			new SpeechSynthesisUtterance(
				applyPronunciation(text, this.rules),
			) as unknown as TtsUtterance;

		this.engine = new TtsEngine(
			{
				synth,
				createUtterance,
				voice,
				rate: this.plugin.settings.rate,
				lang: voice.lang,
			},
			{
				onSentenceStart: (i) => this.highlight(i),
				onDone: () => this.onFinished(),
				onError: (m) => {
					new Notice(m);
					this.onFinished();
				},
			},
		);

		this.engine.start(sentences, startIndex);
		this.setPlayingUI(true, false);
	}

	private renderSentenceList(sentences: string[]): void {
		this.listEl.empty();
		this.sentenceEls = [];
		this.currentEl = null;
		sentences.forEach((text, i) => {
			const el = this.listEl.createDiv({ cls: 'tw-tts-sentence', text });
			el.dataset.index = String(i);
			el.addEventListener('click', () => {
				this.engine?.jumpTo(i);
				this.setPlayingUI(true, false);
			});
			this.sentenceEls.push(el);
		});
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
		this.engine?.stop();
		this.queue = [];
		this.queueIndex = 0;
		this.finishUI();
	}

	private onFinished(): void {
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
	}

	private noticeNoVoice(): void {
		let hint: string = STRINGS.installHintMac;
		if (Platform.isIosApp) hint = STRINGS.installHintIos;
		else if (Platform.isAndroidApp) hint = STRINGS.installHintAndroid;
		else if (Platform.isWin) hint = STRINGS.installHintWin;
		new Notice(`${STRINGS.noChineseVoice}\n${hint}`, 10000);
	}
}
