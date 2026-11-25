# 校正資料

- `english.ts`：自編常用英文與常見誤拼對照。未知字不等同錯字。
- `chinese.ts`：自編繁體中文詞組與固定成語對照。固定誤寫可標為高信心；其餘用字與 `src/core/chinese.ts` 的語境規則均保留待確認。
- `zhuyin.ts`：自編臺灣常用詞、完整成語與補充讀音，格式為 `文字|空格分隔的音節|相對權重`。權重是人工排序值；可為同一詞收錄本調和變調，例如「一籌莫展」的 `ㄧ`／`ㄧˋ`。
- `mcbopomofo.generated.txt`：擴充資料，含 7,061 筆單字與 43,169 筆詞組讀音；同一字詞可能有多筆讀音。格式為 `空格分隔的鍵碼音節|文字|語料出現次數`。

擴充資料衍生自[小麥注音詞庫](https://github.com/openvanilla/McBopomofo/tree/5af9da259066dc270c5e5ae76f082636912b75c4/Source/Data)，採 MIT 授權，著作權為 Mengjuei Hsieh 等人。完整聲明位於 [`public/mcbopomofo-license.txt`](../../public/mcbopomofo-license.txt)，建置時一併發布。

`bun run data:zhuyin` 以固定上游版本的 `BPMFBase.txt`、`BPMFMappings.txt` 與 `phrase.occ` 重建快照。腳本過濾非漢字及不合法的讀音，選取較常用的詞組、保留部分稀有單字音節，轉成鍵碼並合併重複讀音。開發、測試及正常建置皆直接使用已納入版本控制的快照，不必存取上游。

解碼時建立音節索引與詞組 Trie，再以有界的候選搜尋組合音節。排序保留明確聲調，對省略聲調與無分隔的拆音給較低分，並參考詞頻。未載入擴充資料時使用自編詞表。
