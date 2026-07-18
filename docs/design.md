# 中文朗讀 (TW Read Aloud) 設計文件

日期:2026-07-18　狀態:已核准(Hans)　作者:Hans Lin + AI

## 目標

給台灣新手用的 Obsidian 語音朗讀外掛:用各平台**內建系統中文語音**把筆記唸出來,**逐句反白跟讀**,免費、離線、介面全繁體中文。

跨平台:macOS、Windows、iPhone/iPad 支援;Android 盡力支援(使用說明明講可能較差)。

## 為什麼不改 Edge TTS

Edge TTS 靠微軟免費雲端伺服器,2025-12 起常被擋(實測 403),fork 也解決不了 唸不出聲音是伺服器的鍋。改用瀏覽器內建 Web Speech API 走系統語音,才能免費 + 離線 + 跨平台(含手機)。原創程式碼,不繼承 Edge TTS 的 AGPL(本專案 MIT)。

## 技術核心

- Web Speech API:`window.speechSynthesis` + `SpeechSynthesisUtterance`。
- **逐句唸**:把筆記切成句子,一句一個 utterance 依序唸。理由:
  - 天生支援「唸到這句就高亮這句」(每句 utterance 的 onstart 觸發高亮)。
  - 暫停 / 停止 / 上一句 / 下一句控制自然。
  - **不依賴 `onboundary` 事件**(在 WebKit / iOS / mobile 常失效),跨平台最穩。

## 元件(各司其職,純函數可獨立測試)

| 檔案 | 職責 | 依賴 Obsidian |
|---|---|---|
| `src/sentence-splitter.ts` | markdown/純文字 → 句子陣列;去除 markdown 語法符號,依中英文句末標點分句 | 否(純函數,單元測試) |
| `src/tts-engine.ts` | 包 speechSynthesis:給句子陣列+voice+rate,依序唸,回呼 onSentenceStart / onDone / onError;pause/resume/stop/jumpTo | 否(純邏輯,注入 synth,單元測試) |
| `src/reader-view.ts` | 自訂 ItemView 獨立閱讀窗格:逐句渲染、目前句反白 + 自動捲動、控制列、點句跳讀 | 是 |
| `src/settings.ts` | 全繁中設定頁:語音下拉、語速滑桿 | 是 |
| `src/i18n/zh-tw.ts` | 集中的繁中介面字串 | 否 |
| `src/main.ts` | 進入點:ribbon、狀態列鈕、命令、開窗格、載入設定 | 是 |

## 資料流

1. 使用者按 ribbon / 狀態列鈕 / 命令面板「朗讀目前筆記」(或「朗讀選取文字」)。
2. main 取當前筆記內容(或選取範圍)。
3. `sentence-splitter` 切成句子陣列。
4. 開 `reader-view` 顯示逐句列表。
5. `tts-engine` 依序唸每句;每句 onstart 回呼。
6. reader-view 反白目前句 + 自動捲到可視範圍。
7. 唸完清高亮。點某句可從那句重新開始唸。

## 介面(全繁體中文)

- ribbon 圖示 + 底部狀態列鈕:「朗讀本篇」。
- 閱讀窗格控制列:▶ 播放 / ⏸ 暫停 / ⏹ 停止 / ⏮ 上一句 / ⏭ 下一句。
- 命令面板:「朗讀目前筆記」「朗讀選取文字」「停止朗讀」。
- 設定頁:語音(**預設自動挑第一個 zh-TW 語音**,可改;下拉列出系統所有 zh 開頭語音)、語速(0.5~2.0,預設 1.0)。

## 錯誤處理 / 邊界(可靠度關鍵)

- **無中文語音**:提示怎麼去系統安裝(iOS / Android / Windows 各一句)。
- **Android WebView 不支援 speechSynthesis**:偵測 `window.speechSynthesis` 不存在,或 `getVoices()` 持續為空 → 顯示中文「此裝置瀏覽器不支援朗讀」,不當掉。
- **iOS 需使用者手勢啟動**:朗讀由按鈕點擊觸發,天然符合。
- **`getVoices()` 非同步**:等 `voiceschanged` 事件再填語音清單。
- **暫停 / 停止**:`speechSynthesis.pause()` / `cancel()`;停止時清高亮。

## 平台支援(寫進 README / 使用說明)

macOS ✅　Windows ✅　iPhone/iPad ✅　Android ⚠️ 支援度可能較差(視 WebView + 是否安裝中文 TTS 語音資料)。

## 開發 / 建置 / 部署(沿用 hans-kanban 慣例)

- 原始碼:`~/src/obsidian-tw-tts/`(TypeScript + esbuild,獨立 git repo)。
- `npm run build` → `dist/main.js` + `manifest.json` + `styles.css`。
- 複製三檔進 `.obsidian/plugins/tw-read-aloud/`,加進 `community-plugins.json` 啟用。
- 三台裝置靠 vault 同步取得。

## 測試

- 純函數(`sentence-splitter`、`tts-engine` 排序 / 回呼邏輯)寫 node `--test`(tsx)單元測試。
- 手動:Mac 桌機實唸 + 高亮 → iPhone 實測 → Android 盡力測。

## 不做(YAGNI)

MP3 匯出、播放佇列、睡眠計時器、浮動播放器、原地高亮(在原筆記上反白)。
