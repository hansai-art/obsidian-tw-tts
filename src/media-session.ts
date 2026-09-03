export interface MediaSessionLike {
	playbackState: 'none' | 'paused' | 'playing';
	metadata: unknown;
	setActionHandler(action: string, handler: (() => void) | null): void;
	setPositionState?(state?: { duration: number; playbackRate: number; position: number }): void;
}

export interface MediaMetadataConstructor {
	new (init: { title: string; artist: string; album: string }): unknown;
}

export interface MediaSessionActions {
	play(): void;
	pause(): void;
	stop(): void;
	seekBackward(): void;
	seekForward(): void;
	previous(): void;
	next(): void;
}

export function configureMediaSession(
	session: MediaSessionLike | undefined,
	Metadata: MediaMetadataConstructor | undefined,
	title: string,
	actions: MediaSessionActions,
): () => void {
	if (!session) return () => undefined;
	if (Metadata) session.metadata = new Metadata({ title, artist: 'Hans TW TTS', album: 'Obsidian' });
	const handlers: Array<[string, () => void]> = [
		['play', () => actions.play()], ['pause', () => actions.pause()], ['stop', () => actions.stop()],
		['seekbackward', () => actions.seekBackward()], ['seekforward', () => actions.seekForward()],
		['previoustrack', () => actions.previous()], ['nexttrack', () => actions.next()],
	];
	for (const [action, handler] of handlers) {
		try { session.setActionHandler(action, handler); } catch { /* Unsupported action. */ }
	}
	return () => {
		for (const [action] of handlers) {
			try { session.setActionHandler(action, null); } catch { /* Unsupported action. */ }
		}
		session.playbackState = 'none';
	};
}

export function updateMediaProgress(
	session: MediaSessionLike | undefined,
	positionSeconds: number,
	durationSeconds: number,
	rate: number,
	playing: boolean,
	paused: boolean,
): void {
	if (!session) return;
	session.playbackState = !playing ? 'none' : paused ? 'paused' : 'playing';
	if (!session.setPositionState || durationSeconds <= 0) return;
	const duration = Math.max(durationSeconds, 1);
	const position = Math.min(Math.max(positionSeconds, 0), duration - 0.001);
	try { session.setPositionState({ duration, playbackRate: Math.max(rate, 0.1), position }); } catch { /* Older WebView. */ }
}
