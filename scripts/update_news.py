#!/usr/bin/env python3
"""
FuturisticBD Daily News Updater
Fetches real news from Google News RSS — NO API KEYS REQUIRED.
Runs in GitHub Actions every morning at 10 AM BST.
"""

import requests, json, os, base64, datetime, re, hashlib
import xml.etree.ElementTree as ET
from html import unescape

# ─── CONFIG ──────────────────────────────────────────────────────────────────
GH_USER  = "Futuristicbd"
GH_REPO  = "futuristicbd-newsroom"
# Served by Vite from the build output root at /news-data.json
GH_FILE  = "public/news-data.json"
SITE_URL = "https://futuristicbd-newsroom.vercel.app"

# ─── KEYWORD MAPS ────────────────────────────────────────────────────────────
PROMOTION_WORDS = [
    "appointed","appoints","named as","joins as","promoted to","new ceo","new cmo",
    "new cto","new md","new director","new chairman","takes over","steps down",
    "succeeds","elected","hired as","new managing director","new chief"
]
MARKETING_WORDS = [
    "marketing","advertising","campaign","brand","digital","social media","ads",
    "agency","creative","content","influencer","seo","ppc","reels","tiktok",
    "instagram","facebook","meta ads","google ads","ecommerce","e-commerce"
]
TREND_WORDS = [
    "ai ","artificial intelligence","chatgpt","generative","trend","new platform",
    "launches","unveils","innovation","future of","report","study","survey",
    "growth","market size","billion","startup","new tool","technology"
]
INDUSTRY_WORDS = [
    "economy","gdp","market","investment","trade","export","import","revenue",
    "business","industry","sector","finance","bank","fund","stock","growth rate"
]

def clean_html(text):
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:300]

def make_id(region, idx, date):
    prefix = "bd" if region == "bangladesh" else "gl"
    return f"{prefix}-{str(idx).zfill(3)}-{date}"

def detect_category(title, desc):
    t = (title + " " + desc).lower()
    if any(w in t for w in PROMOTION_WORDS):
        return "promotion"
    if any(w in t for w in MARKETING_WORDS):
        return "marketing"
    if any(w in t for w in TREND_WORDS):
        return "trend"
    return "industry"

def detect_promotion(title, desc):
    t = (title + " " + desc).lower()
    if not any(w in t for w in PROMOTION_WORDS):
        return False, None, None

    # Try to extract person name (word before/after "appointed" etc.)
    name = None
    patterns = [
        r"([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:appointed|named|joins|promoted)",
        r"(?:appoints|names|promotes)\s+([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)",
    ]
    for pat in patterns:
        m = re.search(pat, title + " " + desc)
        if m:
            name = m.group(1)
            break

    if not name:
        # Try extracting first capitalized word pair from title
        m = re.search(r"\b([A-Z][a-z]+ [A-Z][a-z]+)\b", title)
        name = m.group(1) if m else "the appointee"

    congrats = f"Congratulations to {name} on the new role — on behalf of FuturisticBD! 🎊"
    return True, name, congrats

def fetch_rss(query, max_items=12):
    """Fetch from Google News RSS — free, no key needed."""
    encoded = requests.utils.quote(query)
    url = f"https://news.google.com/rss/search?q={encoded}&hl=en&gl=US&ceid=US:en"
    try:
        r = requests.get(url, timeout=15,
                         headers={"User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)"})
        r.raise_for_status()
        root = ET.fromstring(r.content)
        items = []
        for item in root.findall(".//item")[:max_items]:
            t   = item.find("title")
            lnk = item.find("link")
            dsc = item.find("description")
            src = item.find("source")
            if t is None or lnk is None:
                continue
            title   = clean_html(t.text or "")
            link    = (lnk.text or "").strip()
            desc    = clean_html(dsc.text if dsc is not None else "")
            source  = (src.text or "Google News") if src is not None else "Google News"
            # Skip if title too short
            if len(title) < 15:
                continue
            items.append({"title": title, "url": link,
                          "desc": desc, "source": source})
        return items
    except Exception as e:
        print(f"  RSS error [{query[:40]}]: {e}")
        return []

def gather_all():
    print("📡 Fetching Google News RSS feeds...")
    feeds = {
        # ── Bangladesh ─────────────────────────────────────────────────────
        "bd_biz":   "Bangladesh business economy industry 2026",
        "bd_mktg":  "Bangladesh digital marketing advertising agency",
        "bd_appt":  "Bangladesh CEO CMO appointed director promoted chairman",
        "bd_tech":  "Bangladesh startup fintech ecommerce technology",
        "bd_econ":  "Bangladesh GDP trade investment export 2026",
        # ── Global ──────────────────────────────────────────────────────────
        "gl_mktg":  "global marketing advertising brand campaign 2026",
        "gl_ai":    "AI marketing Google Meta TikTok advertising technology",
        "gl_appt":  "CMO CEO appointed marketing agency global 2026",
        "gl_trend": "social media marketing trend influencer commerce 2026",
        "gl_indus": "advertising industry revenue report brand strategy 2026",
    }
    raw = {}
    for key, q in feeds.items():
        items = fetch_rss(q)
        raw[key] = items
        print(f"  {key}: {len(items)} items")
    return raw

def build_news_items(raw, today):
    print("✂️  Building structured news items...")

    # ── Deduplicate by URL ───────────────────────────────────────────────────
    seen_urls = set()
    bd_items, gl_items = [], []

    def process(items, region):
        target = bd_items if region == "bangladesh" else gl_items
        for it in items:
            url = it["url"].strip()
            if not url or url in seen_urls:
                continue
            if len(target) >= 10:
                break
            seen_urls.add(url)
            title = it["title"]
            desc  = it["desc"]
            cat   = detect_category(title, desc)
            is_promo, person, congrats = detect_promotion(title, desc)
            if is_promo:
                cat = "promotion"
            idx  = len(target) + 1
            target.append({
                "id":              make_id(region, idx, today),
                "date":            today,
                "region":          region,
                "category":        cat,
                "headline":        title[:120],
                "summary":         desc[:350] if desc else title,
                "source":          it["source"],
                "sourceUrl":       url,
                "isPromotion":     is_promo,
                "promotionPerson": person,
                "congratsMessage": congrats,
                "tags":            extract_tags(title, cat)
            })

    # Bangladesh feeds first
    for key in ["bd_appt","bd_mktg","bd_biz","bd_tech","bd_econ"]:
        process(raw.get(key, []), "bangladesh")

    # Global feeds
    for key in ["gl_appt","gl_mktg","gl_ai","gl_trend","gl_indus"]:
        process(raw.get(key, []), "global")

    # Pad to 10 if short (repeat from remaining)
    def pad(lst, region):
        remaining = [it for it in (raw.get("bd_biz",[]) if region=="bangladesh"
                                   else raw.get("gl_indus",[])) if it["url"] not in seen_urls]
        for it in remaining:
            if len(lst) >= 10:
                break
            url = it["url"]
            if url in seen_urls: continue
            seen_urls.add(url)
            cat = detect_category(it["title"], it["desc"])
            is_promo, person, congrats = detect_promotion(it["title"], it["desc"])
            idx = len(lst) + 1
            lst.append({
                "id": make_id(region, idx, today), "date": today, "region": region,
                "category": "promotion" if is_promo else cat,
                "headline": it["title"][:120],
                "summary":  it["desc"][:350] if it["desc"] else it["title"],
                "source":   it["source"], "sourceUrl": url,
                "isPromotion": is_promo, "promotionPerson": person,
                "congratsMessage": congrats, "tags": extract_tags(it["title"], cat)
            })

    pad(bd_items, "bangladesh")
    pad(gl_items, "global")

    all_items = bd_items[:10] + gl_items[:10]
    print(f"  Bangladesh: {len(bd_items)} | Global: {len(gl_items)} | Total: {len(all_items)}")
    return all_items

def extract_tags(title, category):
    """Extract 2-3 relevant tags from the headline."""
    tags = [category]
    words = title.lower().split()
    keywords = {
        "bangladesh","marketing","ai","digital","brand","google","meta","tiktok",
        "advertising","ecommerce","startup","fintech","economy","investment",
        "cmo","ceo","md","appointed","trend","social"
    }
    for w in words:
        w_clean = re.sub(r"[^a-z]", "", w)
        if w_clean in keywords and w_clean not in tags:
            tags.append(w_clean)
        if len(tags) >= 3:
            break
    return tags

def push_to_github(items, today):
    token = os.environ["GITHUB_TOKEN"]
    hdrs  = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json"
    }
    api = f"https://api.github.com/repos/{GH_USER}/{GH_REPO}/contents/{GH_FILE}"

    print(f"📂 Fetching current {GH_FILE}...")
    r = requests.get(api, headers=hdrs)
    r.raise_for_status()
    cur  = r.json()
    sha  = cur["sha"]
    old_data = json.loads(base64.b64decode(cur["content"].replace("\n","")).decode())
    # Keep news from previous days (archive)
    old_news = [n for n in old_data.get("news",[]) if n.get("date") != today]

    tz = datetime.timezone(datetime.timedelta(hours=6))
    updated = {
        "meta": {
            "siteName":    "FuturisticBD Newsroom",
            "lastUpdated": datetime.datetime.now(tz).isoformat(),
            "totalEntries": len(items) + len(old_news)
        },
        "news": items + old_news
    }

    b64 = base64.b64encode(
        json.dumps(updated, ensure_ascii=False, indent=2).encode("utf-8")
    ).decode("ascii")

    print(f"🚀 Pushing {len(items)} new items to GitHub...")
    pr = requests.put(api, headers=hdrs,
                      json={"message": f"Daily news update: {today}",
                            "content": b64, "sha": sha})
    if pr.status_code in (200, 201):
        commit = pr.json().get("commit",{}).get("sha","")[:12]
        print(f"✅ Pushed! commit={commit}")
        print(f"   Vercel auto-redeploys → {SITE_URL}")
    else:
        raise RuntimeError(f"Push failed {pr.status_code}: {pr.text[:300]}")

def main():
    print("="*55)
    print("  FuturisticBD Daily News Updater (RSS Edition)")
    today = datetime.date.today().isoformat()
    print(f"  Date: {today}")
    print("  No API keys required — powered by Google News RSS")
    print("="*55)

    raw   = gather_all()
    items = build_news_items(raw, today)
    push_to_github(items, today)

    print(f"\n🎉 Done! {len(items)} stories published.")
    promos = [i for i in items if i["isPromotion"]]
    if promos:
        print(f"🎊 {len(promos)} promotion(s):")
        for p in promos:
            print(f"   • {p['promotionPerson']} — {p['headline'][:60]}")

if __name__ == "__main__":
    main()
