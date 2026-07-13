# world-almanic — AI agent instructions

## What
以 Mapbox / MapLibre 為底的世界年鑑國家速覽互動地圖。搜尋/網址選國 → 地圖 flyTo + 高亮 → 面板顯示混合型條目（factbox + 大事記 + 文章）。可 iframe 嵌入。

## Stack
純前端 static，原生 ES modules，無 bundler、無 build。Mapbox GL JS / MapLibre GL JS 由 CDN 載入。

## Entry
`index.html` → `src/main.js`（編排）。

## Run
`python3 -m http.server 8080`（需 static server，`fetch` 讀 JSON 會被 `file://` CORS 擋）。

## 核心架構
- **唯一資料 seam** 是 `src/data-adapter.js` 的 `getEntry(iso) → CountryEntry | null`。換真年鑑資料只改 `data/almanac.mock.json`，`src/` 不動。
- join key 一律 **ISO 3166-1 alpha-2**（大寫）。地圖高亮、搜尋、網址 `?country=`、GeoJSON `iso_a2` 全對齊此鍵。
- 地圖抽象 `src/map.js` 的 `MapEngine`：Mapbox / MapLibre 共用同一份 `world-countries.geojson` 做高亮，達引擎平權。

## 約束
- Mapbox token 絕不 hardcode；只從 `window.WORLD_ALMANAC_MAPBOX_TOKEN` 或 `?mbtoken=` 取得。預設引擎為 MapLibre（免 token）。
- 面板渲染一律 HTML-escape 資料值（`src/panel.js` 的 `esc`）。
- 缺欄位／空 sections／未知 ISO 一律略過或顯示提示，不得丟例外。

## Ignore
`node_modules/`, `dist/`
