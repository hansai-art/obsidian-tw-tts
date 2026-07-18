import { ItemView, Notice, WorkspaceLeaf, setIcon, Platform } from 'obsidian';
import type TwTtsPlugin from './main';
import { STRINGS } from './i18n/zh-tw';
import { TtsEngine, type TtsSynth, type TtsUtterance } from './tts-engine';
import { pickVoice } from './voice-utils';

export const VIEW_TYPE_TW_TTS = 'tw-read-aloud-view';

/** 獨立閱讀窗格:逐句顯示 + 目前句反白 + 播放控制列。 */
export class TwTtsReaderView extends ItemView {
	private plugin: TwTtsPlugin;
	private engine: TtsEngine | null = null;
	private listEl!: HTMLElement;
	private sentenceEls: HTMLElement[] = [];
	private currentEl: HTMLElement | null = null;
	private playPauseBtn!: HTMLElement;
	private playing = false;
	private paused = false;

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

		const bar = c.createDiv('tw-tts-controls');
		this.makeBtn(bar, 'skip-back', STRINGS.prev, () => this.engine?.prev());
		this.playPauseBtn = this.makeBtn(bar, 'play', STRINGS.play, () =>
			this.togglePlay(),
		);
		this.makeBtn(bar, 'square', STRINGS.stop, () => this.stop());
		this.makeBtn(bar, 'skip-forward', STRINGS.next, () => this.engine?.next());

		this.listEl = c.createDiv('tw-tts-sentences');
		this.showEmpty();
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

	/** 主入口:載入句子並開始朗讀。 */
	readSentences(sentences: string[]): void {
		const synthApi = window.speechSynthesis;
		if (!synthApi) {
			new Notice(STRINGS.notSupported);
			return;
		}
		if (sentences.length === 0) {
			new Notice(STRINGS.noContent);
			return;
		}
		const voice = pickVoice(
			synthApi.getVoices(),
			this.plugin.settings.voiceName,
			this.plugin.settings.genderPreference,
		);
		if (!voice) {
			this.noticeNoVoice();
			return;
		}

		this.renderSentenceList(sentences);

		const synth: TtsSynth = {
			speak: (u) => synthApi.speak(u as unknown as SpeechSynthesisUtterance),
			cancel: () => synthApi.cancel(),
			pause: () => synthApi.pause(),
			resume: () => synthApi.resume(),
		};
		const createUtterance = (text: string): TtsUtterance =>
			new SpeechSynthesisUtterance(text) as unknown as TtsUtterance;

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

		this.engine.start(sentences, 0);
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
			this.plugin.readActiveNote();
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
		if (this.currentEl) this.currentEl.removeClass('is-reading');
		this.currentEl = null;
		this.setPlayingUI(false, false);
	}

	private onFinished(): void {
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
