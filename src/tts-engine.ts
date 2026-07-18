/**
 * 逐句朗讀引擎。包 speechSynthesis,一句一個 utterance 依序唸。
 *
 * 設計目標:核心排序邏輯與 Obsidian / 瀏覽器解耦,可單元測試。
 * 透過依賴注入(synth + createUtterance)讓測試能用假物件手動觸發事件。
 */

/** 只取用得到的 utterance 欄位,方便在測試裡用普通物件替代。 */
export interface TtsUtterance {
	text: string;
	voice: SpeechSynthesisVoice | null;
	rate: number;
	lang: string;
	onstart: (() => void) | null;
	onend: (() => void) | null;
	onerror: ((e: unknown) => void) | null;
}

/** speechSynthesis 的最小介面。 */
export interface TtsSynth {
	speak(u: TtsUtterance): void;
	cancel(): void;
	pause(): void;
	resume(): void;
}

export interface TtsEngineOptions {
	synth: TtsSynth;
	createUtterance: (text: string) => TtsUtterance;
	voice?: SpeechSynthesisVoice | null;
	rate?: number;
	lang?: string;
}

export interface TtsEngineCallbacks {
	onSentenceStart?: (index: number) => void;
	onDone?: () => void;
	onError?: (message: string) => void;
}

export class TtsEngine {
	private sentences: string[] = [];
	private index = 0;
	private active: TtsUtterance | null = null;
	private playing = false;
	private paused = false;

	constructor(
		private readonly opts: TtsEngineOptions,
		private readonly cb: TtsEngineCallbacks = {},
	) {}

	get currentIndex(): number {
		return this.index;
	}
	get total(): number {
		return this.sentences.length;
	}
	get isPlaying(): boolean {
		return this.playing;
	}
	get isPaused(): boolean {
		return this.paused;
	}

	/** 開始朗讀。fromIndex 可從指定句開始。 */
	start(sentences: string[], fromIndex = 0): void {
		this.sentences = sentences;
		if (sentences.length === 0) {
			this.playing = false;
			this.cb.onError?.('沒有可朗讀的內容');
			return;
		}
		this.playFrom(Math.min(Math.max(0, fromIndex), sentences.length - 1));
	}

	pause(): void {
		if (!this.playing) return;
		this.opts.synth.pause();
		this.paused = true;
	}

	resume(): void {
		if (!this.playing) return;
		this.opts.synth.resume();
		this.paused = false;
	}

	stop(): void {
		this.opts.synth.cancel();
		this.active = null;
		this.playing = false;
		this.paused = false;
	}

	next(): void {
		if (this.sentences.length === 0) return;
		if (this.index + 1 < this.sentences.length) {
			this.playFrom(this.index + 1);
		} else {
			this.opts.synth.cancel();
			this.finish();
		}
	}

	prev(): void {
		if (this.sentences.length === 0) return;
		this.playFrom(Math.max(0, this.index - 1));
	}

	jumpTo(i: number): void {
		if (i < 0 || i >= this.sentences.length) return;
		this.playFrom(i);
	}

	/** 從指定句(重新)開始播放。 */
	private playFrom(i: number): void {
		this.index = i;
		this.opts.synth.cancel();
		this.active = null;
		this.playing = true;
		this.paused = false;
		this.speakCurrent();
	}

	private speakCurrent(): void {
		const u = this.opts.createUtterance(this.sentences[this.index]);
		if (this.opts.voice) u.voice = this.opts.voice;
		u.rate = this.opts.rate ?? 1;
		if (this.opts.lang) u.lang = this.opts.lang;

		const idx = this.index;
		u.onstart = () => {
			if (u !== this.active) return; // 忽略已被取消的舊 utterance
			this.cb.onSentenceStart?.(idx);
		};
		u.onend = () => {
			if (u !== this.active) return;
			this.advance();
		};
		u.onerror = () => {
			if (u !== this.active) return;
			this.playing = false;
			this.paused = false;
			this.active = null;
			this.cb.onError?.('朗讀發生錯誤');
		};

		this.active = u;
		this.opts.synth.speak(u);
	}

	private advance(): void {
		if (this.index + 1 < this.sentences.length) {
			this.index++;
			this.speakCurrent();
		} else {
			this.finish();
		}
	}

	private finish(): void {
		this.playing = false;
		this.paused = false;
		this.active = null;
		this.cb.onDone?.();
	}
}
