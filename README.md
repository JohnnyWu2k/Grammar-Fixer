# Grammend

使用 TypeScript、Bun 與 Firebase Hosting 的文字校正網站。
目前為開發中頁面，後續規劃基本錯字校正與標準注音輸入法誤打還原。

網站：<https://grammend.web.app>

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

## 架構

```text
index.html             網頁入口
src/                   前端程式與樣式
tests/unit/            單元與設定測試
tests/security/        Firestore 權限測試
firebase.json          Hosting 與 Emulator 設定
firestore.rules        客戶端讀寫規則
.firebaserc.example    本機部署設定範本
.github/workflows/     驗證與部署流程
```

後續模組：`core/` 演算法、`data/` 詞庫、`workers/` 背景運算、`ui/` 編輯介面。
資料流：介面 → Worker → 演算法與詞庫 → 候選結果。

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

PR 與 `main` 推送皆執行驗證。設定部署 Variables 後，同儲存庫 PR 建立預覽，
`main` 推送發布正式站點；fork PR 僅驗證。

## 安全

- 目前不使用 Firestore，客戶端讀寫預設拒絕；Admin SDK 權限由 IAM 管理。
- Hosting 啟用 CSP、禁止嵌入與 MIME 嗅探防護。
- `.firebaserc`、環境變數、憑證與本機紀錄不納入版本控制。
- Firebase SDK 僅作規則測試用途，未包含於前端產物。
- 開發工具相依性以 `bun audit` 檢查；目前仍有上游安全公告，`@grpc/grpc-js` 採同主版修補覆寫。
