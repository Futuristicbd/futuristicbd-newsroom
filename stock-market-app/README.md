# DSE Tracker

A lightweight, single-page dashboard for the **Dhaka Stock Exchange (DSE)**, Bangladesh.
No build step, no dependencies — just open `index.html`.

![Status](https://img.shields.io/badge/data-sample%2Fdemo-orange)

## Features

- **Headline indices** — DSEX, DS30, and DSES with live-style change and %.
- **Market breadth** — advancing / declining / unchanged counts and total turnover (৳).
- **Top gainers & losers** — the five biggest movers on each side.
- **Searchable, sortable stock table** — filter by symbol/company or sector; sort any column.
- **Stock detail** — click any stock for an intraday chart, day range, open, prev close, volume and turnover.
- **Watchlist** — star stocks; saved in your browser (localStorage).
- **Dark / light theme** — remembers your choice.
- **Simulated live ticks** — prices update every few seconds so the board feels live.

## Data

Prices are **illustrative sample data** in Bangladeshi Taka (৳) and update via a simulated
random walk. They are **not** live market prices and nothing here is investment advice.
To use real data, replace the tick logic in `app.js` with fetches to a DSE market-data
feed and map the response onto the same stock objects.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure |
| `styles.css` | Styling + light/dark themes |
| `data.js`    | Sample DSE stocks and indices |
| `app.js`     | Rendering, sorting, search, watchlist, chart, live simulation |

## Run locally

Just open the file:

```bash
open index.html        # macOS
# or serve it:
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Deploy

It's a static site, so any static host works:

- **GitHub Pages** — push this folder to a repo and enable Pages (Settings → Pages → deploy from branch). If the app lives in a subfolder, set the Pages source to that folder or move these files to the repo root.
- **Vercel / Netlify** — point the project at this folder; no build command needed (output directory = this folder).
