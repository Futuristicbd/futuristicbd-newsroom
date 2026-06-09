#!/usr/bin/env python3
"""FuturisticBD Daily News Updater — runs in GitHub Actions every morning."""

import anthropic, requests, json, os, base64, datetime
import xml.etree.ElementTree as ET

def fetch_rss(query, n=12):
    url = f"https://news.google.com/rss/search?q={requests.utils.quote(query)}&hl=en&gl=US&ceid=US:en"
    try:
        r = requests.get(url, timeout=12, headers={"User-Agent": "Mozilla/5.0"})
        root = ET.fromstring(r.content)
        items = []
        for item in root.findall(".//item")[:n]:
            t  = item.find("title")
            lk = item.find("link")
            ds = item.find("description")
            sr = item.find("source")
            if t is not None and lk is not None:
                desc = (ds.text or "") if ds is not None else ""
                desc = desc.replace("<b>","").replace("</b>","").replace("&nbsp;"," ")
                items.append({
                    "title": t.text or "",
                    "url":   lk.text or "",
                    "desc":  desc[:250],
                    "src":   sr.text if sr is not None else ""
                })
        return items
    except Exception as e:
        print(f"  RSS error [{query[:30]}]: {e}")
        return []

def gather():
    print("Fetching RSS feeds...")
    queries = {
        "BD Business":      "Bangladesh business industry marketing 2026",
        "BD Digital Mktg":  "Bangladesh digital marketing social media 2026",
        "BD Appointments":  "Bangladesh CEO CMO appointed promoted director 2026",
        "BD Economy":       "Bangladesh economy startup ecommerce fintech 2026",
        "Global Marketing": "global marketing advertising CMO brand 2026",
        "Global AI Mktg":   "AI marketing Meta Google TikTok advertising 2026",
        "Global Appts":     "CMO CEO appointment marketing agency appointed 2026",
        "Global Trends":    "marketing trend social commerce influencer 2026",
    }
    out = {}
    for k, q in queries.items():
        out[k] = fetch_rss(q)
        print(f"  {k}: {len(out[k])} items")
    return out

def curate(raw, today, client):
    print("Curating with Claude AI...")
    blob = ""
    for cat, items in raw.items():
        blob += f"\n=== {cat} ===\n"
        for i, it in enumerate(items, 1):
            blob += f"{i}. {it['title']}\n   URL: {it['url']}\n   Source: {it['src']}\n   {it['desc']}\n\n"

    prompt = f"""Today is {today}. You are the news curator for FuturisticBD, a marketing agency in Bangladesh.

From the RSS items below select the BEST 20 and return them as a JSON array only (no other text).

Rules:
- 10 Bangladesh items (region: "bangladesh"), 10 Global items (region: "global")
- category: "industry" | "marketing" | "promotion" | "trend"
- For senior appointments (CEO/CMO/MD/VP/Chairman/Director): isPromotion=true, fill promotionPerson and congratsMessage="Congratulations to [Name] on [role] — on behalf of FuturisticBD! 🎊"
- Use REAL URLs from the RSS data where available
- IDs: bd-001 to bd-010, gl-001 to gl-010, all with date {today}

JSON object shape:
{{"id":"bd-001-{today}","date":"{today}","region":"bangladesh","category":"industry","headline":"...","summary":"2-3 clear sentences","source":"Name","sourceUrl":"https://...","isPromotion":false,"promotionPerson":null,"congratsMessage":null,"tags":["tag1","tag2"]}}

RAW RSS DATA:
{blob[:12000]}

Return ONLY the JSON array."""

    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8000,
        messages=[{"role":"user","content":prompt}]
    )
    text = resp.content[0].text.strip()
    start = text.find("[")
    end   = text.rfind("]") + 1
    items = json.loads(text[start:end])
    print(f"  Curated {len(items)} items")
    return items

def push(items, today):
    token  = os.environ["GITHUB_TOKEN"]
    owner  = "Futuristicbd"
    repo   = "futuristicbd-newsroom"
    hdrs   = {"Authorization":f"Bearer {token}","Accept":"application/vnd.github+json"}

    print("Fetching current news-data.json...")
    r = requests.get(f"https://api.github.com/repos/{owner}/{repo}/contents/news-data.json", headers=hdrs)
    r.raise_for_status()
    cur  = r.json()
    sha  = cur["sha"]
    old_data = json.loads(base64.b64decode(cur["content"].replace("\n","")).decode())
    old_news = [n for n in old_data.get("news",[]) if n["date"] != today]

    tz = datetime.timezone(datetime.timedelta(hours=6))
    updated = {
        "meta": {
            "siteName":    "FuturisticBD Newsroom",
            "lastUpdated": datetime.datetime.now(tz).isoformat(),
            "totalEntries": len(items) + len(old_news)
        },
        "news": items + old_news
    }

    b64 = base64.b64encode(json.dumps(updated, ensure_ascii=False, indent=2).encode()).decode()
    print("Pushing to GitHub...")
    pr = requests.put(
        f"https://api.github.com/repos/{owner}/{repo}/contents/news-data.json",
        headers=hdrs,
        json={"message":f"Daily news update: {today}","content":b64,"sha":sha}
    )
    if pr.status_code in (200,201):
        sha12 = pr.json().get("commit",{}).get("sha","")[:12]
        print(f"✅ Pushed! commit={sha12} — Vercel redeploys in ~30s")
        print(f"   https://futuristicbd-newsroom.vercel.app")
    else:
        raise RuntimeError(f"Push failed {pr.status_code}: {pr.text[:300]}")

def main():
    print("="*52)
    print("  FuturisticBD Daily News Updater")
    today = datetime.date.today().isoformat()
    print(f"  Date: {today}")
    print("="*52)
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    raw    = gather()
    items  = curate(raw, today, client)
    push(items, today)
    print("\nDone! 🗞️")

if __name__ == "__main__":
    main()
