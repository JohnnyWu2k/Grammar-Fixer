# Grammend 字在必得

使用 TypeScript、Bun 與 Firebase Hosting 的文字校正網站。
提供英文拼字、基本文法規則、中文詞組用字與標準注音輸入法誤打候選。
分析在瀏覽器內執行，不使用雲端 AI，也不儲存輸入文字。

網站：<https://grammend.web.app>

## 功能

- 自動判斷、英文校正、注音還原三種模式，可選擇中英間距整理。
- 英文誤拼對照與單步編輯距離候選；基本 I 大寫、主動詞一致、a／an、重複字與標點間距規則。
- 標準注音鍵盤按鍵還原，例如 `1l4fu04` → `抱歉`、`su3cl3` → `你好`、`u4t.6ai4503` → `一籌莫展`。支援全形英數、分隔空格、省略聲調及同音候選。
- 替換文字就在原字下方，點一下即可替換；橘色有多個候選時會打開選單。右上角「套用」每次只改一處，使用規則排在最前面的候選，不限顏色。
- 支援繁體中文固定詞語、常見誤寫與語境規則。注音候選會再經中文規則檢查，套用後也會重新檢查全文。
- 英文、注音與中英混合範例由情境及句型組合；依序抽出不同範例，已有草稿時不覆蓋原文。
- 略過網址、Email、程式碼區塊、行內程式碼與部分識別符號。
- 桌面與手機介面、輸入法組字保護、最多 20,000 字元。

這是詞庫與規則工具，不是完整語意潤稿。建議不會在使用者按下套用或選定候選前改動原文；
已選字成另一段中文的內容不在鍵盤還原範圍。

第二版加入 50,230 筆小麥注音讀音（含詞頻），先辨識音節，再依詞頻和聲調排序。完整詞優先於任意單字拼接；
自動判斷會略過一般英文與常見數字格式。若鍵碼較短或意圖不明，可切到「注音還原」查看候選。

## 開發

工具：Bun（版本見 `package.json`）、Node.js 24 LTS、Java 21+（Firestore Emulator）。

```sh
bun install --frozen-lockfile
bun run dev
```

| 指令 | 用途 |
| --- | --- |
| `bun run check` | 型別與單元測試 |
| `bun run test:rules` | 本機 Firestore 權限測試 |
| `bun run build` | 建置至 `dist/` |
| `bun run preview` | 預覽建置結果 |
| `bun run data:zhuyin` | 從固定版本重建注音詞庫 |

## 架構

```text
index.html             網頁入口
src/core/              校正、鍵盤還原與安全文字修改
src/data/              自編詞表與小麥注音讀音快照（MIT）
src/workers/           背景分析 Worker
src/ui/                編輯狀態、介面與 Worker 通訊
public/                靜態圖示
tests/unit/            單元與設定測試
tests/security/        Firestore 權限測試
firebase.json          Hosting 與 Emulator 設定
firestore.rules        客戶端讀寫規則
.firebaserc.example    本機部署設定範本
.github/workflows/     驗證與部署流程
```

資料流：介面 → Worker → 演算法與詞庫 → 候選結果 → 使用者確認。
Worker 按需啟動，不可用時退回主執行緒。擴充詞庫是同源靜態檔，按需載入；請求不帶使用者文字。
詞表格式與授權見 [`src/data/README.md`](src/data/README.md)。

## 部署

本機設定使用 `.firebaserc`，不納入版本控制。
複製 `.firebaserc.example` 為 `.firebaserc`，填入 Firebase 專案與 Hosting 站點 ID。

```sh
bunx firebase login
bun run deploy:hosting
bun run deploy:rules
```

Hosting 使用 `web` target。網站與 Firestore 規則分開部署。

GitHub Actions 設定：

| 類型 | 名稱 | 值 |
| --- | --- | --- |
| Variable | `FIREBASE_PROJECT_ID` | Firebase 專案 ID |
| Variable | `FIREBASE_HOSTING_SITE` | Hosting 站點 ID |
| Secret | `FIREBASE_SERVICE_ACCOUNT` | 部署用服務帳戶 JSON |

PR 僅驗證；`main` 推送通過型別、單元與 Firestore 規則測試後，自動部署正式 Hosting。
CI 建置一次，再將同一份 `dist/` artifact 交給部署工作，不重跑建置或發布資料庫規則。
缺少設定時部署會明確失敗，不會默默略過。

## 安全

- 目前不使用 Firestore，客戶端讀寫預設拒絕；Admin SDK 權限由 IAM 管理。
- Hosting 啟用 CSP、禁止嵌入與 MIME 嗅探防護。
- `.firebaserc`、環境變數、憑證與本機紀錄不納入版本控制。
- Firebase SDK 僅作規則測試用途，未包含於前端產物。
- 開發工具相依性以 `bun audit` 檢查；目前仍有上游安全公告，`@grpc/grpc-js` 採同主版修補覆寫。
