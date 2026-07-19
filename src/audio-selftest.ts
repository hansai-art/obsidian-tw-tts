/**
 * 音訊自我測試:確認 Web Audio(AudioContext)在目前 WebView 能播放 PCM。
 *
 * 為什麼需要:離線 WASM 神經 TTS 的輸出就是 Float32 PCM → AudioBuffer → 播放,
 * 與此測試完全同一條路徑。Obsidian 的 Android WebView 沒有 speechSynthesis,
 * 但 Web Audio 應該可用;在投入 WASM TTS 前先用這支驗證這個前提是否成立。
 * 平時也可當「沒有聲音?」的診斷:能嗶 = 音訊正常,問題在語音引擎;不能嗶 = 音訊本身有問題。
 */

/** 產生一段正弦波 PCM(頭尾各 20ms 淡入淡出避免爆音)。純函數,可單元測試。 */
export function makeSinePcm(
	sampleRate: number,
	seconds: number,
	freq: number,
): Float32Array {
	const n = Math.max(0, Math.floor(sampleRate * seconds));
	const out = new Float32Array(n);
	if (n === 0) return out;
	const fade = Math.min(Math.floor(sampleRate * 0.02), Math.floor(n / 2));
	for (let i = 0; i < n; i++) {
		let amp = 0.2 * Math.sin((2 * Math.PI * freq * i) / sampleRate);
		if (fade > 0) {
			if (i < fade) amp *= i / fade;
			else if (i >= n - fade) amp *= (n - i) / fade;
		}
		out[i] = amp;
	}
	return out;
}

/**
 * 用 Web Audio 播放一段測試音;播完 resolve。
 * 丟出例外 = 這個 WebView 無法用 AudioContext 播放 PCM(WASM TTS 路徑不通)。
 */
export async function playTestTone(seconds = 0.6, freq = 440): Promise<void> {
	const Ctor =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (!Ctor) throw new Error('這個環境沒有 Web Audio(AudioContext)。');
	const ctx = new Ctor();
	try {
		// 行動裝置需在使用者手勢後 resume;呼叫此函式的命令本身即為手勢。
		if (ctx.state === 'suspended') await ctx.resume();
		const pcm = makeSinePcm(ctx.sampleRate, seconds, freq);
		const buf = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
		buf.getChannelData(0).set(pcm);
		const src = ctx.createBufferSource();
		src.buffer = buf;
		src.connect(ctx.destination);
		await new Promise<void>((resolve) => {
			src.onended = () => resolve();
			src.start();
		});
	} finally {
		await ctx.close();
	}
}
