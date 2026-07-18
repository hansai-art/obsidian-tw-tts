import {
	MarkdownView,
	Notice,
	Plugin,
	WorkspaceLeaf,
} from 'obsidian';
import { STRINGS } from './i18n/zh-tw';
import { splitIntoSentences } from './sentence-splitter';
import {
	DEFAULT_SETTINGS,
	TwTtsSettingTab,
	type TwTtsSettings,
} from './settings';
import { TwTtsReaderView, VIEW_TYPE_TW_TTS } from './reader-view';

export default class TwTtsPlugin extends Plugin {
	settings!: TwTtsSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		// 提前喚醒語音清單(部分平台 getVoices() 首次為空,需非同步載入)
		window.speechSynthesis?.getVoices();

		this.registerView(
			VIEW_TYPE_TW_TTS,
			(leaf) => new TwTtsReaderView(leaf, this),
		);

		this.addRibbonIcon('volume-2', STRINGS.ribbonTooltip, () => {
			void this.readActiveNote();
		});

		const statusBar = this.addStatusBarItem();
		statusBar.addClass('mod-clickable');
		statusBar.setText(`🔊 ${STRINGS.statusIdle}`);
		statusBar.setAttr('aria-label', STRINGS.ribbonTooltip);
		statusBar.addEventListener('click', () => {
			void this.readActiveNote();
		});

		this.addCommand({
			id: 'read-note',
			name: STRINGS.cmdReadNote,
			callback: () => void this.readActiveNote(),
		});
		this.addCommand({
			id: 'read-selection',
			name: STRINGS.cmdReadSelection,
			editorCallback: (editor) => void this.readSelection(editor.getSelection()),
		});
		this.addCommand({
			id: 'stop',
			name: STRINGS.cmdStop,
			callback: () => this.stopAll(),
		});
		this.addCommand({
			id: 'open-reader',
			name: STRINGS.cmdOpenReader,
			callback: () => void this.activateView(),
		});

		this.addSettingTab(new TwTtsSettingTab(this.app, this));
	}

	onunload(): void {
		window.speechSynthesis?.cancel();
	}

	/** 朗讀目前開啟的筆記。 */
	async readActiveNote(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== 'md') {
			new Notice(STRINGS.noActiveNote);
			return;
		}
		const content = await this.app.vault.cachedRead(file);
		const sentences = splitIntoSentences(content);
		const view = await this.activateView();
		view.readSentences(sentences);
	}

	/** 朗讀選取文字。 */
	async readSelection(selection: string): Promise<void> {
		const text = selection.trim();
		if (!text) {
			new Notice(STRINGS.noSelection);
			return;
		}
		const sentences = splitIntoSentences(text);
		const view = await this.activateView();
		view.readSentences(sentences);
	}

	stopAll(): void {
		window.speechSynthesis?.cancel();
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_TW_TTS)[0];
		const view = leaf?.view;
		if (view instanceof TwTtsReaderView) view.stop();
	}

	/** 開啟(或聚焦)朗讀窗格,回傳其 view。 */
	async activateView(): Promise<TwTtsReaderView> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null =
			workspace.getLeavesOfType(VIEW_TYPE_TW_TTS)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_TW_TTS, active: true });
		}
		workspace.revealLeaf(leaf);
		return leaf.view as TwTtsReaderView;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
