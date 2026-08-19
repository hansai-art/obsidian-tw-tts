import { requestUrl } from 'obsidian';
import { AzureSpeechClient, type AzureSpeechSettings } from './azure-tts';

/** Obsidian transport adapter：讓核心 Azure contract 可在 Node 測試，不把 Obsidian runtime 帶進測試。 */
export class ObsidianAzureSpeechClient extends AzureSpeechClient {
	constructor(settings: Pick<AzureSpeechSettings, 'key' | 'region'>) {
		super(settings, requestUrl);
	}
}