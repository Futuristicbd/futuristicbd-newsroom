/*
 * analyzer.js — pure, offline text & engagement analysis.
 * No network calls: everything runs locally so the group's data never leaves
 * the machine. Attaches to globalThis.FGA.analyzer.
 */
(function (global) {
  "use strict";

  // A compact multilingual-ish stopword set (English + common Bangla-romanized
  // and social filler). Extend freely.
  const STOPWORDS = new Set(
    (
      "a an the and or but if then else of to in on for with without at by from up down " +
      "is are was were be been being have has had do does did will would shall should can " +
      "could may might must this that these those i you he she it we they me him her them us " +
      "my your his its our their mine yours what which who whom whose when where why how all " +
      "any both each few more most other some such no nor not only own same so than too very " +
      "just about into over after before again further once here there out off above below " +
      "am pm re via amp nbsp http https www com like share comment post group please thanks " +
      "thank get got know need want see also new one two get well much many lot going go get " +
      "amar ami tumi apni eta ota kore korte hobe ache ken kotha khub onek ei sei koto na hoy"
    ).split(/\s+/)
  );

  const POSITIVE = new Set(
    ("good great awesome amazing love loved excellent best happy nice wonderful helpful " +
      "thanks thank grateful perfect beautiful fantastic superb brilliant recommend recommended " +
      "win winner success successful congrats congratulations enjoy enjoyed positive support " +
      "supported solved works working easy clear useful valuable")
      .split(/\s+/)
  );
  const NEGATIVE = new Set(
    ("bad worst hate hated terrible awful poor sad angry disappointed disappointing problem " +
      "problems issue issues broken fail failed failure wrong scam fake spam annoying useless " +
      "waste worse difficult hard confusing confused error errors bug bugs slow crash crashed " +
      "refund complaint complain avoid warning fraud")
      .split(/\s+/)
  );

  function tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^\p{L}\p{N}#]+/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  }

  // Lexicon sentiment in [-1, 1].
  function sentiment(text) {
    const toks = tokenize(text);
    if (!toks.length) return 0;
    let s = 0;
    for (const t of toks) {
      const base = t.replace(/^#/, "");
      if (POSITIVE.has(base)) s += 1;
      else if (NEGATIVE.has(base)) s -= 1;
    }
    return Math.max(-1, Math.min(1, s / Math.sqrt(toks.length)));
  }

  function keywords(text, limit = 8) {
    const freq = new Map();
    for (const t of tokenize(text)) freq.set(t, (freq.get(t) || 0) + 1);
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([w]) => w);
  }

  function hashtags(text) {
    if (!text) return [];
    return (text.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.toLowerCase());
  }

  // Weighted engagement. Comments and shares indicate stronger participation
  // than a one-click reaction, so they are weighted higher.
  function engagementScore(p) {
    const r = p.reactions || 0;
    const c = p.commentCount || 0;
    const s = p.shareCount || 0;
    return r + c * 2 + s * 3;
  }

  // Viral score = engagement per hour since posting, so a post that gathered
  // 200 reactions in 2 hours outranks one that took a week. Falls back to raw
  // engagement when the timestamp is unknown.
  function viralScore(p, now = Date.now()) {
    const eng = p.engagementScore != null ? p.engagementScore : engagementScore(p);
    if (!p.timestamp) return eng;
    const hours = Math.max(1, (now - p.timestamp) / 3600000);
    // Dampen with log so brand-new posts don't dominate purely on age.
    return +(eng / Math.log2(hours + 2)).toFixed(2);
  }

  // Enrich a raw scraped post in place with derived analysis fields.
  function enrichPost(p) {
    p.engagementScore = engagementScore(p);
    p.viralScore = viralScore(p);
    p.keywords = keywords(p.text, 10);
    p.hashtags = hashtags(p.text);
    p.sentiment = sentiment(p.text);
    return p;
  }

  function enrichComment(c) {
    c.sentiment = sentiment(c.text);
    c.keywords = keywords(c.text, 5);
    return c;
  }

  // Aggregate topic table across many posts: keyword -> {count, posts,
  // totalEngagement, avgSentiment}.
  function topicAggregate(posts, limit = 40) {
    const map = new Map();
    for (const p of posts) {
      const seen = new Set(p.keywords || keywords(p.text, 10));
      for (const kw of seen) {
        if (!map.has(kw)) map.set(kw, { keyword: kw, posts: 0, engagement: 0, sentiment: 0 });
        const e = map.get(kw);
        e.posts += 1;
        e.engagement += p.engagementScore || 0;
        e.sentiment += p.sentiment || 0;
      }
    }
    return [...map.values()]
      .map((e) => ({
        keyword: e.keyword,
        posts: e.posts,
        engagement: e.engagement,
        avgEngagement: Math.round(e.engagement / e.posts),
        avgSentiment: +(e.sentiment / e.posts).toFixed(2)
      }))
      .sort((a, b) => b.posts - a.posts || b.engagement - a.engagement)
      .slice(0, limit);
  }

  // Simple activity histogram by day (YYYY-MM-DD -> count & engagement).
  function timeline(posts) {
    const map = new Map();
    for (const p of posts) {
      if (!p.timestamp) continue;
      const d = new Date(p.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, { date: key, posts: 0, engagement: 0 });
      const e = map.get(key);
      e.posts += 1;
      e.engagement += p.engagementScore || 0;
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  // Top contributors by post count / engagement.
  function topAuthors(posts, limit = 20) {
    const map = new Map();
    for (const p of posts) {
      const name = p.authorName || "Unknown";
      if (!map.has(name)) map.set(name, { name, url: p.authorProfileUrl, posts: 0, engagement: 0 });
      const e = map.get(name);
      e.posts += 1;
      e.engagement += p.engagementScore || 0;
    }
    return [...map.values()]
      .sort((a, b) => b.engagement - a.engagement || b.posts - a.posts)
      .slice(0, limit);
  }

  global.FGA = global.FGA || {};
  global.FGA.analyzer = {
    tokenize,
    sentiment,
    keywords,
    hashtags,
    engagementScore,
    viralScore,
    enrichPost,
    enrichComment,
    topicAggregate,
    timeline,
    topAuthors
  };
})(typeof self !== "undefined" ? self : this);
