# Group Insight — Facebook Group Analyzer (Chrome extension)

Scrape, index and analyze the posts, comments and engagement of a Facebook
**group you belong to**. Turn on the extension, set your filters, and it
auto-scrolls the feed, captures every post it can read (with its permalink),
grabs the visible comments, and builds a local, searchable database you can
sort, rank and export.

Everything runs **on your machine**. No account, no server, no upload — the
data lives in your browser's local IndexedDB and never leaves it.

---

## What it does

- **Auto-scrape** the group feed with a polite, human-like scroll (configurable
  delay + random jitter, hard post cap).
- **Captures per post:** author (real name kept) & profile link, post text,
  **permalink**, reactions / comments / shares, approximate timestamp, media
  type (photo / video / link), extracted keywords, hashtags and a sentiment score.
- **Captures comments** that are visible/expanded on each post: author, text,
  likes, sentiment.
- **Dashboard** (opens in its own tab):
  - **Overview** — KPIs, an activity-over-time chart, and the current most-viral posts.
  - **Posts** — a sortable, searchable table of everything, click a row for the
    full post + its comments.
  - **Viral** — posts ranked by *engagement velocity* (engagement weighted by
    how fast it accumulated), not just raw totals.
  - **Topics** — keyword/topic aggregation with volume, engagement and average
    sentiment; click a keyword to filter the posts by it.
  - **Authors** — top contributors by posts and engagement.
  - **Comments** — top comments across the group by likes, with sentiment.
- **Filter** by free-text search, date range, minimum engagement, media type,
  and multiple sort orders — live, without re-scraping.
- **Export** posts or comments to **CSV** or **JSON** (respects your filters).
- **Multi-group aware** — data is kept per group; switch groups from the dashboard.

---

## Install (Load Unpacked)

The extension is unpacked source — no build step.

1. Download / copy the `facebook-group-analyzer/` folder to your computer.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `facebook-group-analyzer/` folder.
5. Pin **Group Insight** from the puzzle-piece menu for easy access.

Works in any Chromium browser (Chrome, Edge, Brave).

---

## Use it

1. Open a Facebook **group** you're a member of — the URL should look like
   `https://www.facebook.com/groups/<name-or-id>`.
2. Click the **Group Insight** icon.
3. (Optional) open **Filters & options** to set: max posts, date range, keyword,
   minimum engagement, scroll delay, and whether to capture comments / expand
   "See more".
4. Press **▶ Start scraping**. A small live panel appears bottom-right of the
   page showing progress; let it scroll. Press **Stop** any time.
5. Click **📊 Open dashboard** to explore, sort, search and export.

Tip for a deep dive on one group: raise **Max posts**, leave the tab focused,
and let it run. You can stop and resume — new posts merge into the same
database (duplicates are de-duped by their permalink id).

---

## How it works (architecture)

```
content script (facebook.com)          background worker            extension pages
─────────────────────────────          ─────────────────           ────────────────
scraper.js  ──auto-scroll, expand──►    DB_BATCH / DB_PUT   ──►      popup  (control)
extractors.js  parse DOM → records ──►  writes to IndexedDB ◄──read  dashboard (analysis)
analyzer.js  enrich (scores, NLP)       (extension origin)
```

- `src/lib/db.js` — IndexedDB layer with indexes on group, time, reactions,
  comments, engagement and viral score. Records are **merged** on re-scrape so
  richer data (fuller text, higher counts) wins.
- `src/lib/analyzer.js` — offline text/engagement analysis: tokenizer + stopword
  removal, lexicon sentiment, keyword & hashtag extraction, engagement and viral
  scoring, topic/timeline/author aggregation. No network calls.
- `src/content/extractors.js` — turns Facebook's obfuscated DOM into structured
  records using **stable semantic signals** (`role="article"`, `role="feed"`,
  `dir="auto"`, permalink href patterns, aria-labels) rather than class names,
  which Facebook randomises.
- `src/content/scraper.js` — the scrape controller + in-page overlay.
- `src/background.js` — owns all DB writes (the content script's own IndexedDB
  belongs to facebook.com and would be invisible to the dashboard, so writes are
  routed here to the extension-origin database).

---

## Limitations (please read)

Facebook is a hostile scraping target: it randomises markup on every build,
lazy-renders and **recycles posts out of the DOM as you scroll**, and only shows
a few comments per post until you open it.

- **Timestamps are approximate.** Facebook shows relative times ("5h",
  "Yesterday") until you hover; the extension parses those, plus any absolute
  date it can find. Some posts will have no reliable timestamp, so date filters
  and the timeline can miss them.
- **Comments are shallow by default.** Only comments already visible/expanded in
  the feed are captured. For *all* comments on a post you'd need to open the post
  — not yet automated.
- **Counts can be off** on unusual post layouts (shared posts, reels, polls).
  Records that can't be parsed are skipped rather than crashing the run.
- **Feed order isn't strictly chronological**, so a date "from" filter is applied
  when storing, but scraping mainly stops on the post cap or the end of the feed.
- If Facebook ships a big redesign, the selectors in `extractors.js` may need a
  refresh. They're centralised there for exactly that reason.

---

## Privacy & responsible use

This tool was built for **research on a group you have joined**, and it is
designed to keep everything local:

- No data is sent anywhere — it's stored only in your browser's IndexedDB.
- No external requests, analytics, or third-party libraries.
- **Clear this group** (in the popup) or **Export** and delete at any time.

You're responsible for how you use scraped data. Respect the group's and its
members' expectations, applicable laws (e.g. data-protection rules on personal
data), and Facebook's Terms of Service — automated collection can violate them.
Use it on data you're entitled to access, keep it to your own research, and
don't redistribute members' personal information.

---

## File map

```
facebook-group-analyzer/
├── manifest.json            # MV3 manifest
├── icons/                   # generated PNG icons
├── src/
│   ├── background.js        # service worker — DB writer + dashboard opener
│   ├── lib/
│   │   ├── db.js            # IndexedDB layer (indexes, merge-upsert)
│   │   └── analyzer.js      # offline NLP + scoring + aggregation
│   ├── content/
│   │   ├── extractors.js    # DOM → structured records
│   │   ├── scraper.js       # scroll/expand controller + overlay
│   │   └── overlay.css      # in-page status panel
│   ├── popup/               # toolbar control panel
│   └── dashboard/           # full analysis workspace
```
