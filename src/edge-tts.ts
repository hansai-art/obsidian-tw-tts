type ExecFile = (
	file: string,
	args: string[],
	callback: (error: Error | null) => void,
) => void;

interface DesktopNodeModules {
	execFile: ExecFile;
	readFile(path: string): Promise<Uint8Array>;
	rm(path: string, options: { force: boolean }): Promise<void>;
	tmpdir(): string;
	join(...paths: string[]): string;
}

type DesktopRequire = (id: string) => unknown;

/**
 * Obsidian 桌面版 Electron 提供 window.require；呼叫端已以 Platform.isDesktopApp
 * 限制 Edge provider，這裡再檢查一次，避免行動版取用 Node API。
 */
function desktopNodeModules(): DesktopNodeModules {
	const nodeRequire = (window as unknown as { require?: DesktopRequire }).require;
	if (!nodeRequire) throw new Error('Edge CLI 僅支援桌面版 Obsidian');
	const childProcess = nodeRequire('child_process') as { execFile: ExecFile };
	const fs = nodeRequire('fs/promises') as Pick<DesktopNodeModules, 'readFile' | 'rm'>;
	const os = nodeRequire('os') as Pick<DesktopNodeModules, 'tmpdir'>;
	const path = nodeRequire('path') as Pick<DesktopNodeModules, 'join'>;
	return { ...childProcess, ...fs, ...os, ...path };
}

/** Edge CLI 的語音設定。音高使用 edge-tts 原生的 Hz 表示。 */
export interface EdgeVoiceSettings {
	voice: string;
	rate: number;
	pitch: number;
}

export interface EdgeSpeechClient {
	synthesize(text: string, settings: EdgeVoiceSettings): Promise<Blob>;
}

export interface EdgeAudio {
	play(): Promise<void>;
	pause(): void;
	release(): void;
	onEnded: (() => void) | null;
	onError: (() => void) | null;
}

export interface EdgeTtsCallbacks {
	onSentenceStart?: (index: number) => void;
	onDone?: () => void;
	onError?: (message: string) => void;
}

/** edge-tts CLI 接受的音高值，例如 -7Hz。 */
export function edgePitch(semitones: number): string {
	const value = Math.round(semitones);
	return `${value > 0 ? '+' : ''}${value}Hz`;
}

/** 將既有的倍率語速轉為 edge-tts CLI 接受的百分比。 */
export function edgeRate(rate: number): string {
	const value = Math.round((rate - 1) * 100);
	return `${value >= 0 ? '+' : ''}${value}%`;
}

function runEdgeTts(args: string[], { execFile }: DesktopNodeModules): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile('edge-tts', args, (error) =>
			error ? reject(error instanceof Error ? error : new Error('edge-tts command failed')) : resolve(),
		);
	});
}

/**
 * 桌面版呼叫使用者自行安裝的 edge-tts CLI。沒有 API key；文字會傳給 Edge 線上服務。
 * 每句使用獨立暫存檔，讀回 Blob 後立刻清除。
 */
export class EdgeCliSpeechClient implements EdgeSpeechClient {
	async synthesize(text: string, settings: EdgeVoiceSettings): Promise<Blob> {
		const modules = desktopNodeModules();
		const output = modules.join(
			modules.tmpdir(),
			`obsidian-tw-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`,
		);
		try {
			await runEdgeTts([
				'--voice',
				settings.voice,
				'--pitch',
				edgePitch(settings.pitch),
				'--rate',
				edgeRate(settings.rate),
				'--text',
				text,
				'--write-media',
				output,
			], modules);
			return new Blob([await modules.readFile(output)], { type: 'audio/mpeg' });
		} finally {
			await modules.rm(output, { force: true });
		}
	}
}

/** 將 Blob 接到 HTMLAudioElement；URL 在切句、停止或結束時釋放。 */
export function createEdgeAudio(blob: Blob): EdgeAudio {
	const url = URL.createObjectURL(blob);
	const audio = new Audio(url);
	return {
		play: () => audio.play(),
		pause: () => audio.pause(),
		release: () => {
			audio.pause();
			audio.removeAttribute('src');
			audio.load();
			URL.revokeObjectURL(url);
		},
		get onEnded(): (() => void) | null {
			return audio.onended ? () => undefined : null;
		},
		set onEnded(callback: (() => void) | null) {
			audio.onended = callback;
		},
		get onError(): (() => void) | null {
			return audio.onerror ? () => undefined : null;
		},
		set onError(callback: (() => void) | null) {
			audio.onerror = callback;
		},
	};
}

/** Edge CLI 逐句產生並播放 MP3，確保後一句只在前一句結束後才開始。 */
export class EdgeTtsEngine {
	private sentences: string[] = [];
	private index = 0;
	private audio: EdgeAudio | null = null;
	private playing = false;
	private paused = false;
	private generation = 0;

	constructor(
		private readonly client: EdgeSpeechClient,
		private readonly createAudio: (blob: Blob) => EdgeAudio,
		private readonly settings: EdgeVoiceSettings,
		private readonly cb: EdgeTtsCallbacks = {},
	) {}

	get isPlaying(): boolean { return this.playing; }
	get isPaused(): boolean { return this.paused; }

	start(sentences: string[], fromIndex = 0): void {
		if (sentences.length === 0) {
			this.cb.onError?.('沒有可朗讀的內容');
			return;
		}
		this.sentences = sentences;
		this.playFrom(Math.min(Math.max(0, fromIndex), sentences.length - 1));
	}

	setRate(rate: number): void {
		this.settings.rate = rate;
		if (this.playing && !this.paused) this.playFrom(this.index);
	}

	pause(): void {
		if (!this.playing || !this.audio) return;
		this.audio.pause();
		this.paused = true;
	}

	resume(): void {
		if (!this.playing || !this.audio) return;
		void this.audio.play();
		this.paused = false;
	}

	stop(): void {
		this.generation++;
		this.audio?.pause();
		this.audio?.release();
		this.audio = null;
		this.playing = false;
		this.paused = false;
	}

	next(): void {
		if (this.index + 1 < this.sentences.length) this.playFrom(this.index + 1);
		else this.finish();
	}

	prev(): void { this.playFrom(Math.max(0, this.index - 1)); }

	jumpTo(index: number): void {
		if (index >= 0 && index < this.sentences.length) this.playFrom(index);
	}

	private playFrom(index: number): void {
		this.stop();
		this.index = index;
		this.playing = true;
		const generation = ++this.generation;
		void this.playCurrent(generation);
	}

	private async playCurrent(generation: number): Promise<void> {
		try {
			const blob = await this.client.synthesize(this.sentences[this.index], this.settings);
			if (generation !== this.generation || !this.playing) return;
			const audio = this.createAudio(blob);
			this.audio = audio;
			audio.onEnded = () => {
				if (generation === this.generation) this.advance();
			};
			audio.onError = () => {
				if (generation === this.generation) this.fail('Edge 語音播放失敗');
			};
			this.cb.onSentenceStart?.(this.index);
			await audio.play();
			if (this.paused) audio.pause();
		} catch {
			if (generation === this.generation) {
				this.fail('Edge 語音產生失敗。請確認已安裝 edge-tts、網路正常後重試。');
			}
		}
	}

	private advance(): void {
		if (this.index + 1 < this.sentences.length) {
			this.index++;
			const generation = ++this.generation;
			void this.playCurrent(generation);
		} else this.finish();
	}

	private finish(): void {
		this.stop();
		this.cb.onDone?.();
	}

	private fail(message: string): void {
		this.stop();
		this.cb.onError?.(message);
	}
}
