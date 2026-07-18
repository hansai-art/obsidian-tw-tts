# Hans TW TTS

> 中文為主 · English below

給台灣使用者的 Obsidian 語音朗讀外掛:用**各平台系統內建的中文語音**把筆記唸出來,**逐句反白跟讀**。免費、離線、跨平台,介面全繁體中文。走瀏覽器內建 Web Speech API 與系統語音,**不依賴任何外部伺服器**。

---

## 中文

### 功能

- 一鍵朗讀目前筆記,或只朗讀選取的文字
- 獨立**朗讀窗格**逐句顯示筆記;唸到哪句那句就反白 + 自動捲到可視範圍
- 播放 / 暫停 / 繼續 / 停止 / 上一句 / 下一句
- 點窗格裡任一句,從那句開始唸
- 設定:選語音(預設自動挑台灣中文語音)、調語速
- 全繁體中文介面

### 安裝

**A. 官方社群外掛(審核通過後)**
設定 → 社群外掛 → 瀏覽 → 搜「Hans TW TTS」→ 安裝 → 啟用。

**B. BRAT(現在就能用,電腦與手機都可)**
1. 在社群外掛安裝 **BRAT**(Obsidian42 - BRAT)並啟用。
2. 命令面板 →「BRAT: Add a beta plugin」。
3. 貼上 `hansai-art/obsidian-tw-tts`,確認。
4. 回社群外掛啟用「Hans TW TTS」。

**C. 手動**
到 [最新 release](https://github.com/hansai-art/obsidian-tw-tts/releases) 下載 `main.js`、`manifest.json`、`styles.css`,放進 `<vault>/.obsidian/plugins/tw-read-aloud/`,再啟用外掛。手機上 `.obsidian` 是隱藏資料夾,通常用 BRAT 較方便。

### 怎麼用

朗讀目前筆記(任選一種):

1. 點左側工具列的喇叭圖示
2. 點視窗底部狀態列的「🔊 朗讀」
3. 命令面板(`Cmd/Ctrl + P`)→「朗讀目前筆記」

其他:

- 選取一段文字 → 命令面板「朗讀選取文字」,只唸選取的
- 右側會開**朗讀窗格**,逐句顯示;唸到的那句會反白
- 控制列:上一句 / 播放暫停 / 停止 / 下一句
- 點窗格裡任一句 → 從那句開始唸
- 命令面板「停止朗讀」可隨時停

### 設定

設定 → 社群外掛 → Hans TW TTS:

- **語音**:預設「自動(台灣中文優先)」。下拉可改成系統裡任一語音;每個語音都標了男/女標籤。
- **偏好聲音性別**:不限 / 女聲 / 男聲。語音設為「自動」時,優先挑這個性別的台灣中文語音。
- **語速**:0.5(最慢)到 2.0(最快)。旁邊的**試聽**鈕會用目前設定唸一句範例。

### 平台支援

| 平台 | 支援 | 說明 |
|---|---|---|
| macOS | ✅ | 用系統內建中文語音 |
| Windows | ✅ | 需在系統安裝中文語音 |
| iPhone / iPad | ✅ | 用 iOS 內建中文語音 |
| Android | ⚠️ 盡力支援 | 視裝置 WebView 與是否安裝中文 TTS 語音資料,可能無法朗讀 |

### 找不到中文語音怎麼辦

外掛偵測不到中文語音時會跳提示。請先到系統安裝中文語音:

- **macOS**:系統設定 → 輔助使用 → 朗讀內容 → 系統聲音,加入中文(台灣)
- **Windows**:設定 → 時間與語言 → 語音,新增中文語音
- **iPhone / iPad**:設定 → 輔助使用 → 朗讀內容 → 聲音 → 中文,下載語音
- **Android**:設定 → 系統 → 文字轉語音輸出,安裝中文語音資料

### 開發

- TypeScript + esbuild。`npm run dev` 監看建置,`npm run build` 正式建置。
- `npm test` 跑單元測試(Node 內建測試 runner + tsx)。
- 純邏輯(`sentence-splitter`、`tts-engine`、`voice-utils`)與 Obsidian 解耦,可獨立測試。

### 授權

MIT。原創程式碼,不衍生自任何 AGPL 專案。

---

## English

An Obsidian plugin (Traditional-Chinese first) that reads your notes aloud using your device's **built-in Traditional Chinese system voice**, with **sentence-by-sentence highlight follow**. Free, offline, cross-platform. It uses the Web Speech API and each platform's system voices, so it does **not** depend on any external server.

### Features

- Read the current note aloud, or read only the selected text
- A dedicated **reader pane** shows the note sentence by sentence; the sentence being read is highlighted and auto-scrolled into view
- Play / Pause / Resume / Stop / Previous / Next sentence
- Click any sentence in the pane to start reading from there
- Settings: choose a voice (defaults to a Traditional Chinese voice) and adjust speed
- Traditional Chinese interface

### Installation

**A. Community Plugins (once approved):** Settings → Community plugins → Browse → search "Hans TW TTS" → Install → Enable.

**B. BRAT (works now, desktop and mobile):** Install the BRAT plugin, then command palette → "BRAT: Add a beta plugin" → paste `hansai-art/obsidian-tw-tts` → enable "Hans TW TTS".

**C. Manual:** Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/hansai-art/obsidian-tw-tts/releases) into `<vault>/.obsidian/plugins/tw-read-aloud/`, then enable the plugin.

### Usage

Read the current note via the ribbon speaker icon, the status-bar "🔊 朗讀" button, or the command "朗讀目前筆記". Select text and run "朗讀選取文字" to read only the selection. The reader pane opens on the right and highlights each sentence as it is read; click any sentence to start from there. "停止朗讀" stops playback.

Settings let you pick a voice (each labelled male/female), set a preferred gender for the auto-picked Traditional Chinese voice, adjust speed (0.5x–2.0x), and hit the preview button to hear a sample with the current settings.

### Platform support

macOS ✅ · Windows ✅ · iPhone/iPad ✅ · Android ⚠️ best effort (depends on the device WebView and whether a Chinese TTS voice is installed).

### License

MIT. Original code; not derived from any AGPL project.
