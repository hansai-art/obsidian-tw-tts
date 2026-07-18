import {
	Notice,
	Plugin,
	TFile,
	TFolder,
	WorkspaceLeaf,
} from 'obsidian';
import { STRINGS } from './i18n/zh-tw';
import {
	sentenceIndexForPrefix,
	splitIntoSentences,
} from './sentence-splitter';
import { orderNotesByPath } from './note-order';
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
			id: 'read-from-cursor',
			name: STRINGS.cmdReadFromCursor,
			editorCallback: (editor) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') {
					new Notice(STRINGS.noActiveNote);
					return;
				}
				const prefix = editor.getRange({ line: 0, ch: 0 }, editor.getCursor());
				void this.readFile(file, sentenceIndexForPrefix(prefix));
			},
		});
		this.addCommand({
			id: 'read-folder',
			name: STRINGS.cmdReadFolder,
			callback: () => {
				const folder = this.app.workspace.getActiveFile()?.parent;
				if (!folder) {
					new Notice(STRINGS.noActiveNote);
					return;
				}
				void this.readFolder(folder);
			},
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

		// 檔案總管右鍵資料夾 → 朗讀此資料夾
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFolder)) return;
				menu.addItem((item) =>
					item
						.setTitle(STRINGS.menuReadFolder)
						.setIcon('volume-2')
						.onClick(() => void this.readFolder(file)),
				);
			}),
		);

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
		await this.readFile(file);
	}

	/** 朗讀單一檔案,可指定起始句。 */
	async readFile(file: TFile, startIndex = 0): Promise<void> {
		const view = await this.activateView();
		await view.playFile(file, startIndex);
	}

	/** 連播一個資料夾內的筆記。 */
	async readFolder(folder: TFolder): Promise<void> {
		const files = this.collectFolderNotes(folder);
		if (files.length === 0) {
			new Notice(STRINGS.noFolderNotes);
			return;
		}
		const view = await this.activateView();
		await view.playQueue(files);
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

	/** 蒐集資料夾內的 .md(依設定決定是否含子資料夾),依路徑排序。 */
	private collectFolderNotes(folder: TFolder): TFile[] {
		const recursive = this.settings.folderQueueRecursive;
		const out: TFile[] = [];
		const walk = (f: TFolder): void => {
			for (const child of f.children) {
				if (child instanceof TFile) {
					if (child.extension === 'md') out.push(child);
				} else if (recursive && child instanceof TFolder) {
					walk(child);
				}
			}
		};
		walk(folder);
		return orderNotesByPath(out);
	}

	/** 同資料夾、排序後的下一篇 .md;沒有則回 null。 */
	nextSiblingNote(file: TFile): TFile | null {
		const parent = file.parent;
		if (!parent) return null;
		const siblings = orderNotesByPath(
			parent.children.filter(
				(c): c is TFile => c instanceof TFile && c.extension === 'md',
			),
		);
		const idx = siblings.findIndex((f) => f.path === file.path);
		if (idx < 0 || idx + 1 >= siblings.length) return null;
		return siblings[idx + 1];
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
