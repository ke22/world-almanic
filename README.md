# world-almanic

以 Mapbox / MapLibre 為底的**世界年鑑國家速覽**互動地圖。搜尋或由網址指定一個國家，地圖飛到該國並高亮，右側（窄屏為下方）顯示該國的年鑑條目（factbox + 大事記 + 文章）。可單獨開啟，也可用 `<iframe>` 嵌入新聞文章。

> 目前為 **lofi 版**：年鑑條目使用示意 mock 資料（`data/almanac.mock.json`），高亮國界為簡化 polygon。之後替換為真年鑑資料即可，介面不需改動。

## 快速開始

純前端 static，無建置步驟。用任一 static server 開啟（因使用 `fetch` 讀取 JSON，直接 `file://` 開檔在部分瀏覽器會被 CORS 擋）：

```bash
cd world-almanic
python3 -m http.server 8080
# 開啟 http://localhost:8080/
```

## 網址參數契約

| 參數 | 說明 | 範例 |
|---|---|---|
| `country` | 預設選定的國家（ISO 3166-1 alpha-2） | `?country=JP` |
| `expand` | `1` 時直接展開條目面板 | `&expand=1` |
| `engine` | 預設底圖引擎 `maplibre`（預設）／`mapbox` | `&engine=mapbox` |
| `mbtoken` | Mapbox access token（或用 `window.WORLD_ALMANAC_MAPBOX_TOKEN`） | `&mbtoken=pk...` |

嵌入範例：

```html
<iframe src="https://…/world-almanic/index.html?country=JP&expand=1"
        width="100%" height="560" style="border:0"></iframe>
```

## 底圖引擎

- **MapLibre GL JS**（預設）：免 token、免費 demo tiles，開檔即動。
- **Mapbox GL JS**：需 access token。設定 `window.WORLD_ALMANAC_MAPBOX_TOKEN` 或加 `?mbtoken=`。未設 token 時右上切換到 Mapbox 會顯示提示並保留 MapLibre。

右上「底圖」切換鈕可即時切換，當前選定國家會保留。

## 檔案結構

```
world-almanic/
├─ index.html
├─ assets/styles.css        # CNA house style
├─ src/
│  ├─ main.js               # 編排：URL 契約、引擎切換、串接
│  ├─ data-adapter.js       # getEntry(iso) 唯一資料契約
│  ├─ map.js                # MapEngine（Mapbox / MapLibre）
│  ├─ search.js             # 國家搜尋 autocomplete
│  └─ panel.js              # 混合型條目渲染
└─ data/
   ├─ almanac.mock.json     # 示意年鑑條目（換成真資料的替換點）
   ├─ countries.json        # ISO ↔ 名稱 / bbox（搜尋 + flyTo）
   └─ world-countries.geojson  # 高亮國界（簡化；可換 Natural Earth 110m）
```

## 換上真年鑑資料

把 `data/almanac.mock.json` 換成符合同一 schema 的真資料即可，`src/` 不需改：

```jsonc
{
  "JP": {
    "iso": "JP", "name_zh": "日本", "name_en": "Japan", "flag": "🇯🇵",
    "factbox": [ { "label": "首都", "value": "東京" } ],
    "sections": [
      { "type": "timeline", "title": "大事記", "events": [ { "date": "2024-01", "title": "…", "desc": "…" } ] },
      { "type": "article", "title": "概況", "body": "…" }
    ]
  }
}
```

## 國界高亮資料來源

兩個引擎現在用不同的邊界資料源（見 design.md 的決定紀錄）：

- **Mapbox**：直接用官方 `mapbox://mapbox.country-boundaries-v1` tileset（`iso_3166_1` 過濾），像素級貼合、涵蓋全球所有國家，不受 mock 資料範圍限制。
- **MapLibre**：用自帶 `data/world-countries.geojson`（`iso_a2` 過濾），因為 MapLibre 無法存取 Mapbox 的專有 tileset。目前只涵蓋 5 個 mock 國家（來源見檔案內 `_note` 欄位：`johan/world.geo.json`，衍生自 Natural Earth，公開領域）。要擴大涵蓋範圍就換成完整的 Natural Earth 110m（`ne_110m_admin_0_countries`，屬性 `ISO_A2` → `iso_a2`）。
