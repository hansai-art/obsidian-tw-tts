# Hans TW TTS

> 中文為主 · English below

給台灣使用者的 Obsidian 語音朗讀外掛:用**各平台系統內建的中文語音**把筆記唸出來,**逐句反白跟讀**。免費、離線、跨平台,介面全繁體中文。走瀏覽器內建 Web Speech API 與系統語音,**不依賴任何外部伺服器**。

---

## 中文

### 功能

- 一鍵朗讀目前筆記,或只朗讀選取的文字,或**從游標處開始唸**
- **資料夾連播**:右鍵資料夾一次唸完整個資料夾,可設定讀完自動下一篇
- **發音字典**:自訂破音字 / 專有名詞唸法(iPAS、臺、GPT…),全 Obsidian TTS 外掛獨家
- **不朗讀的符號**:拿來當列點的符號(○ ● ※…)可以設成不唸,不會再被唸成「零」
- 獨立**朗讀窗格**逐句顯示筆記;唸到哪句那句就反白 + 自動捲到可視範圍
- 播放 / 暫停 / 繼續 / 停止 / 上一句 / 下一句;播放當下可調語速
- 點窗格裡任一句,從那句開始唸
- 設定:選系統已安裝的多國語音(預設自動挑最佳中文)、調語速與音高
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
- **從游標處開始唸**:命令面板「從游標處開始唸」,從游標所在的那句起讀
- **資料夾連播**:檔案總管右鍵資料夾 →「朗讀此資料夾」,一篇接一篇連續唸(命令面板「朗讀目前資料夾」亦可)
- 右側會開**朗讀窗格**,逐句顯示;唸到的那句會反白;連播時頂端顯示篇名與進度(2/5)
- 控制列:上一句 / 播放暫停 / 停止 / 下一句
- 點窗格裡任一句 → 從那句開始唸
- 命令面板「停止朗讀」可隨時停

### 設定

設定 → 社群外掛 → Hans TW TTS:

- **語音**:預設「自動(推薦最佳語音)」。下拉清單只保留中文與英文，台灣中文優先並依品質排序；避免中文知識庫出現難以選擇的多國語音清單。
- **音高**:-10 到 +10 半音，0 為原始音高。想要較低沉男聲感可用 **-7**；外掛會換算為 Web Speech API 支援的音高倍率，實際音色仍取決於該系統語音。
- **試聽**:設定頁最上方有同一行的**試聽**與**停止試聽**。切換系統中文／英文語音時會立即試聽；英文使用英文範例，中文使用中文範例。
- **語速**:0.5(最慢)到 2.0(最快)。旁邊有**回到預設(1.0x)**按鈕。
- **播放當下也能調語速**:朗讀窗格控制列有 `−  1.0x  +`,點中間數字即回到 1.0x。
- **單篇讀完自動下一篇**:開啟後,唸完一篇會自動接著唸同資料夾的下一篇。
- **資料夾連播含子資料夾**:右鍵連播時是否也含子資料夾內的筆記(預設只該層)。
- **發音字典**:一行一條「原文=唸法」(`#` 開頭為註解),校正破音字與專有名詞。例:`iPAS=愛帕斯`、`臺=台`。只改朗讀發音,畫面仍顯示原文。
- **不朗讀的符號**:一行填完、用空白分隔,例:`○ ● ◎ ※`。這些符號送去朗讀前會被刪掉(否則 `○` 會被唸成「零」),畫面仍顯示原文。整行只有這類符號時會被安靜跳過。若同一個符號在發音字典裡另有指定唸法,以發音字典為準。

### Edge 線上語音（桌面版）

外掛預設仍使用**系統語音（離線）**、自動挑選最佳中文語音，音高預設為 `0`。如要使用 Edge CLI，可在設定把「朗讀引擎」切成 **Edge CLI**；它預設使用 `zh-CN-XiaoxiaoNeural`，不需要 Azure 帳號或 API Key。第一次使用前，請在電腦安裝 [`edge-tts`](https://github.com/rany2/edge-tts)，讓終端機可執行 `edge-tts`。

- Edge CLI 是透過 Microsoft Edge 線上服務合成，朗讀文字會傳送到該服務；可隨時切回**系統語音（離線）**。
- 可在「Edge 語音」欄位選擇已知 voice，例如 `zh-CN-YunyangNeural`；再將音高設為 `-7`，即可使用 Yunyang 的低沉音高作為一組可選範例，並非預設值。
- Edge CLI 僅支援桌面版 Obsidian；iPhone/iPad 會自動使用既有的系統語音。
- 朗讀窗格仍會逐句產生、播放、反白並依序接續下一句；資料夾連播與發音字典同樣適用。

### 平台支援

| 平台 | 支援 | 說明 |
|---|---|---|
| macOS | ✅ | 用系統內建中文語音 |
| Windows | ✅ | 需在系統安裝中文語音 |
| iPhone / iPad | ✅ | 用 iOS 內建中文語音 |
| Android | ❌ 外掛內不支援(改用系統朗讀) | Obsidian 的 Android WebView 未開放語音介面([Chromium 長年未修的 bug](https://issues.chromium.org/issues/40417848)),所有外掛皆無法直接朗讀。改用系統「選取即朗讀」即可用台灣語音、免費、離線,見下方步驟 |

**Android 為什麼不能在外掛內朗讀:** 這不是本外掛的問題,而是 Obsidian 的 Android WebView 沒有把系統語音接進 Web Speech API(Chromium 開了十多年沒修的 bug,連 `speechSynthesis` 介面都不給)。所有 TTS 外掛在 Android 都一樣,純外掛無法碰到系統原生語音。

**Android 建議做法(系統「選取即朗讀」,台灣語音、免費、離線):**

1. **裝台灣語音**:系統設定搜尋「文字轉語音」→ 偏好引擎選 Google →「安裝語音資料」→「中文(台灣)」。
2. **開啟朗讀**:系統設定 →「協助工具 / 無障礙」→「選取即朗讀 / Select to Speak」→ 開啟。
3. **使用**:在 Obsidian 選取要唸的文字 → 點出現的「選取即朗讀」圖示 → 系統用台灣語音唸出來。

（各廠牌選單名稱略有不同;找不到時直接搜尋「文字轉語音」「選取即朗讀」。想要逐句反白、資料夾連播等外掛功能,請在電腦或 iPhone / iPad 使用。）

### 找不到中文語音怎麼辦

外掛偵測不到中文語音時,會在朗讀窗格內顯示「原因 + 解法」面板。請先到系統安裝中文語音:

- **macOS**:系統設定 → 輔助使用 → 朗讀內容 → 系統聲音,加入中文(台灣)
- **Windows**:設定 → 時間與語言 → 語音,新增中文語音
- **iPhone / iPad**:設定 → 輔助使用 → 朗讀內容 → 聲音 → 中文,下載語音

### 開發

- TypeScript + esbuild。`npm run dev` 監看建置,`npm run build` 正式建置。
- `npm test` 跑單元測試(Node 內建測試 runner + tsx)。
- 純邏輯(`sentence-splitter`、`tts-engine`、`voice-catalog`、`pronunciation`、`note-order`、`setting-defs`、`playback-error`)與 Obsidian 解耦,可獨立測試。

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
- Settings: choose any installed system voice (the best Chinese voice remains the automatic default), adjust speed and pitch
- Traditional Chinese interface

### Installation

**A. Community Plugins (once approved):** Settings → Community plugins → Browse → search "Hans TW TTS" → Install → Enable.

**B. BRAT (works now, desktop and mobile):** Install the BRAT plugin, then command palette → "BRAT: Add a beta plugin" → paste `hansai-art/obsidian-tw-tts` → enable "Hans TW TTS".

**C. Manual:** Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/hansai-art/obsidian-tw-tts/releases) into `<vault>/.obsidian/plugins/tw-read-aloud/`, then enable the plugin.

### Usage

Read the current note via the ribbon speaker icon, the status-bar "🔊 朗讀" button, or the command "朗讀目前筆記". Select text and run "朗讀選取文字" to read only the selection, or "從游標處開始唸" to start from the sentence at your cursor. Right-click a folder → "朗讀此資料夾" to play every note in it back-to-back. The reader pane opens on the right, highlights each sentence as it is read (with the note title + position when playing a folder), and click any sentence to start from there. "停止朗讀" stops playback.

Settings let you pick any installed system voice (quality-ranked Chinese voices come first, while the best Chinese voice remains the automatic default), adjust/reset/preview speed and adjust pitch in semitones (-10 to +10; -7 gives a lower voice), toggle auto-advance to the next note in a folder, choose whether folder playback recurses into subfolders, define a **pronunciation dictionary** (one `原文=唸法` rule per line) to fix how proper nouns and heteronyms are read — no other Obsidian TTS plugin has this — and list **silent symbols** (space-separated, e.g. `○ ● ◎ ※`) that are stripped before speaking, so bullet glyphs are not read aloud (`○` would otherwise be voiced as "zero"); a line consisting only of such symbols is skipped. The reader pane also has a live speed control (− [1.0x] +).

### Platform support

macOS ✅ · Windows ✅ · iPhone/iPad ✅ · Android ❌ not supported. Obsidian's Android WebView does not expose the Web Speech API (a [known Chromium bug](https://bugs.chromium.org/p/chromium/issues/detail?id=487255) that blocks every offline TTS plugin). Use desktop/iOS, or Android's system **Select to Speak** (Settings → Accessibility) to read notes on Android.

### License

MIT. Original code; not derived from any AGPL project.
