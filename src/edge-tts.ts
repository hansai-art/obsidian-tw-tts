/* global module -- Obsidian desktop loads plugin bundles through CommonJS. */

type ExecFile = (
	file: string,
	args: string[],
	options: { timeout: number; maxBuffer: number },
	callback: (error: Error | null, stdout: string, stderr: string) => void,
) => void;

interface DesktopNodeModules {
	execFile: ExecFile;
	readFile(path: string): Promise<Uint8Array>;
	rm(path: string, options: { force: boolean }): Promise<void>;
	access(path: string): Promise<void>;
	readdir(path: string): Promise<string[]>;
	tmpdir(): string;
	homedir(): string;
	join(...paths: string[]): string;
}

type DesktopRequire = (id: string) => unknown;

/** Electron bridge 版本相容：Obsidian 1.13 可不提供 window.require。 */
export function pickDesktopRequire(
	windowRequire: DesktopRequire | undefined,
	globalRequire: DesktopRequire | undefined,
): DesktopRequire | undefined {
	return windowRequire ?? globalRequire;
}

/**
 * Obsidian 桌面版 Electron 提供 window.require；呼叫端已以 Platform.isDesktopApp
 * 限制 Edge provider，這裡再檢查一次，避免行動版取用 Node API。
 */
function desktopNodeModules(): DesktopNodeModules {
	// Obsidian/Electron 版本不同：有些掛在 window.require，有些只提供 CommonJS module.require。
	const moduleRequire =
		typeof module === 'object' && typeof module.require === 'function'
			? (module.require.bind(module) as DesktopRequire)
			: undefined;
	const nodeRequire = pickDesktopRequire(
		(window as unknown as { require?: DesktopRequire }).require,
		moduleRequire,
	);
	if (!nodeRequire) throw new Error('Edge CLI 僅支援桌面版 Obsidian');
	const childProcess = nodeRequire('child_process') as { execFile: ExecFile };
	const fs = nodeRequire('fs/promises') as Pick<DesktopNodeModules, 'readFile' | 'rm' | 'access' | 'readdir'>;
	const os = nodeRequire('os') as Pick<DesktopNodeModules, 'tmpdir' | 'homedir'>;
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
	return `${value >= 0 ? '+' : ''}${value}Hz`;
}

/** 將既有的倍率語速轉為 edge-tts CLI 接受的百分比。 */
export function edgeRate(rate: number): string {
	const value = Math.round((rate - 1) * 100);
	return `${value >= 0 ? '+' : ''}${value}%`;
}

interface ProcessFailure {
	code?: string | number;
	killed?: boolean;
	message?: string;
	edgeStderr?: string;
	edgeStdout?: string;
	signal?: string;
}

export function edgeFailureDetails(error: ProcessFailure): Record<string, unknown> {
	const safeMessage = error.message?.split('\n')[0].replace(/--text(?:=|\s).*/, '--text [REDACTED]');
	return {
		message: safeMessage,
		code: error.code,
		killed: error.killed,
		signal: error.signal,
		stderr: error.edgeStderr,
		stdout: error.edgeStdout,
	};
}

/** 使用者可採取行動的錯誤，不回顯筆記內容或完整系統路徑。 */
export function edgeFailureMessage(error: ProcessFailure): string {
	if (error.code === 'ENOENT') return '找不到 edge-tts。請重新安裝後停用再啟用外掛。';
	if (error.killed || error.message?.toLowerCase().includes('timeout')) return 'Edge 語音合成逾時，請確認網路後重試。';
	const stderr = error.edgeStderr?.toLowerCase() ?? '';
	if (stderr.includes('certificate_verify_failed') || stderr.includes('ssl: certificate')) {
		return 'Edge CLI 的 TLS 憑證驗證失敗。請更新 edge-tts 後重試。';
	}
	if (stderr.includes('clientconnector') || stderr.includes('connection') || stderr.includes('websocket')) {
		return 'Edge 語音服務連線失敗。請檢查網路、VPN 或公司網路限制後重試。';
	}
	if (stderr.includes('invalid voice') || stderr.includes('no voice')) {
		return '所選 Edge 語音目前不可用。請改選另一個語音後重試。';
	}
	if (stderr.includes('permission denied')) return 'Edge CLI 沒有暫存檔寫入權限。請重新安裝 edge-tts 後重試。';
	const code = typeof error.code === 'string' || typeof error.code === 'number' ? `（代碼 ${error.code}）` : '';
	return `Edge CLI 已啟動但合成失敗${code}，且未收到可安全顯示的診斷輸出。`;
}

function runEdgeTts(command: string, args: string[], { execFile }: DesktopNodeModules): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(command, args, { timeout: 45_000, maxBuffer: 1_024 * 1_024 }, (error, stdout, stderr) => {
			if (!error) return resolve();
			const failure = error as Error & ProcessFailure;
			failure.edgeStderr = stderr.slice(0, 2_000);
			failure.edgeStdout = stdout.slice(0, 2_000);
			reject(failure);
		});
	});
}

async function existingPath(path: string, modules: DesktopNodeModules): Promise<string | null> {
	try {
		await modules.access(path);
		return path;
	} catch {
		return null;
	}
}

/** GUI app 不會繼承 Terminal PATH；優先尋找 pip --user 的常見安裝位置。 */
async function resolveEdgeExecutable(modules: DesktopNodeModules): Promise<string> {
	const home = modules.homedir();
	const direct = await existingPath(modules.join(home, '.local', 'bin', 'edge-tts'), modules);
	if (direct) return direct;
	try {
		const versions = await modules.readdir(modules.join(home, 'Library', 'Python'));
		for (const version of versions.sort().reverse()) {
			const candidate = await existingPath(modules.join(home, 'Library', 'Python', version, 'bin', 'edge-tts'), modules);
			if (candidate) return candidate;
		}
	} catch {
		// macOS user-site Python directory 不存在時保守回退 PATH。
	}
	return 'edge-tts';
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
			await runEdgeTts(await resolveEdgeExecutable(modules), [
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
		private readonly providerLabel = 'Edge',
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
		let audio: EdgeAudio;
		try {
			const blob = await this.client.synthesize(this.sentences[this.index], this.settings);
			if (generation !== this.generation || !this.playing) return;
			audio = this.createAudio(blob);
			this.audio = audio;
			audio.onEnded = () => {
				if (generation === this.generation) this.advance();
			};
			audio.onError = () => {
				if (generation === this.generation) this.fail(`${this.providerLabel} 語音播放失敗`);
			};
		} catch (error) {
			if (generation === this.generation) {
				this.fail(
					this.providerLabel === 'Edge'
						? edgeFailureMessage(error as ProcessFailure)
						: `${this.providerLabel} 語音產生失敗。請確認設定與網路後重試。`,
				);
			}
			return;
		}
		try {
			this.cb.onSentenceStart?.(this.index);
			await audio.play();
			if (this.paused) audio.pause();
		} catch {
			if (generation === this.generation) {
				this.fail(`${this.providerLabel} 語音已產生，但音訊無法播放。請確認系統輸出裝置後重試。`);
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
