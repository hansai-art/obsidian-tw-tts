import type { EdgeSpeechClient, EdgeVoiceSettings } from './edge-tts';

export interface AzureSpeechSettings extends EdgeVoiceSettings {
	key: string;
	region: string;
}

export interface AzureRequest {
	url: string;
	method: string;
	contentType: string;
	headers: Record<string, string>;
	body: string;
}

export interface AzureResponse {
	arrayBuffer: ArrayBuffer;
}

export type AzureRequester = (request: AzureRequest) => Promise<AzureResponse>;

export function azureEndpoint(region: string): string {
	const normalised = region.trim().toLowerCase();
	if (!/^[a-z0-9-]+$/.test(normalised)) throw new Error('Azure 區域格式不正確');
	return `https://${normalised}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

export function escapeXml(text: string): string {
	return text.replace(/[<>&'"]/g, (char) => ({
		'<': '&lt;',
		'>': '&gt;',
		'&': '&amp;',
		"'": '&apos;',
		'"': '&quot;',
	}[char] ?? char));
}

function azureRate(rate: number): string {
	const percentage = Math.round((rate - 1) * 100);
	return `${percentage >= 0 ? '+' : ''}${percentage}%`;
}

function azurePitch(pitch: number): string {
	const rounded = Math.round(pitch);
	return `${rounded >= 0 ? '+' : ''}${rounded}Hz`;
}

export function azureSsml(text: string, settings: AzureSpeechSettings): string {
	return [
		'<speak version="1.0" xml:lang="zh-TW">',
		`<voice name="${escapeXml(settings.voice)}">`,
		`<prosody rate="${azureRate(settings.rate)}" pitch="${azurePitch(settings.pitch)}">${escapeXml(text)}</prosody>`,
		'</voice>',
		'</speak>',
	].join('');
}

/** Azure Speech 官方 REST API；憑證只存在使用者本機的 Obsidian 外掛設定，不寫入 log。 */
export class AzureSpeechClient implements EdgeSpeechClient {
	constructor(
		private readonly settings: Pick<AzureSpeechSettings, 'key' | 'region'>,
		private readonly requester: AzureRequester,
	) {}

	async synthesize(text: string, settings: EdgeVoiceSettings): Promise<Blob> {
		const key = this.settings.key.trim();
		if (!key) throw new Error('請先輸入 Azure Speech Key');
		const region = this.settings.region.trim();
		if (!region) throw new Error('請先輸入 Azure Speech Region');
		const response = await this.requester({
			url: azureEndpoint(region),
			method: 'POST',
			contentType: 'application/ssml+xml',
			headers: {
				'Ocp-Apim-Subscription-Key': key,
				'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
				'User-Agent': 'obsidian-tw-tts',
			},
			body: azureSsml(text, { ...settings, key, region }),
		});
		return new Blob([response.arrayBuffer], { type: 'audio/mpeg' });
	}
}
