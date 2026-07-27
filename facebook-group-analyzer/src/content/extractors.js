/*
 * extractors.js — turn Facebook's obfuscated DOM into structured records.
 *
 * Facebook randomises class names on every build, so nothing here keys off a
 * class. Instead we lean on stable, semantic signals: role="article" for
 * post/comment containers, role="feed" for the stream, dir="auto" for
 * user-authored text, href patterns for permalinks, and aria-labels/visible
 * text for counts and timestamps. Everything is best-effort: a field we can't
 * read comes back null rather than throwing, so one weird post never stops a
 * scrape.
 *
 * Attaches to globalThis.FGA.extract.
 */
(function (global) {
  "use strict";

  // ---- small utilities ----------------------------------------------------

  function parseCount(str) {
    if (str == null) return 0;
    const m = String(str).replace(/[,\s]/g, "").match(/([\d.]+)\s*([KMkm])?/);
    if (!m) return 0;
    let n = parseFloat(m[1]);
    if (isNaN(n)) return 0;
    const suffix = (m[2] || "").toLowerCase();
    if (suffix === "k") n *= 1e3;
    else if (suffix === "m") n *= 1e6;
    return Math.round(n);
  }

  const MONTHS = {
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
    may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8,
    sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11
  };
  const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  // Best-effort conversion of Facebook's relative/absolute time text to a ms
  // timestamp. Returns null if we truly can't tell.
  function parseRelativeTime(text, now = Date.now()) {
    if (!text) return null;
    const t = text.trim().toLowerCase();

    if (/^just now|^now$|^a few seconds/.test(t)) return now;

    // "5m", "5 mins", "2h", "3 hrs", "4d", "2w", "1y"
    let m = t.match(/(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|week|weeks|y|yr|year|years)\b/);
    if (m && !/\bat\b/.test(t)) {
      const n = parseInt(m[1], 10);
      const u = m[2][0];
      const unitMs = { m: 60e3, h: 3600e3, d: 86400e3, w: 604800e3, y: 31557600e3 }[u];
      if (unitMs) return now - n * unitMs;
    }

    if (/^yesterday/.test(t)) {
      const d = new Date(now - 86400e3);
      return applyClock(d, t).getTime();
    }
    if (/^today/.test(t)) return applyClock(new Date(now), t).getTime();

    // A full absolute string (Facebook's hover tooltip) often begins with a
    // weekday, e.g. "Saturday, 12 July 2025 at 10:30". Detect that and fall
    // through to the absolute month/day parse below instead of the "last
    // weekday" shortcut.
    const hasAbsolute = /\b20\d{2}\b/.test(t) || Object.keys(MONTHS).some((m) => t.includes(m));

    // Weekday name alone (within the last week), e.g. "Monday at 3:00 PM".
    for (let i = 0; i < WEEKDAYS.length && !hasAbsolute; i++) {
      if (t.startsWith(WEEKDAYS[i])) {
        const d = new Date(now);
        let diff = (d.getDay() - i + 7) % 7;
        if (diff === 0) diff = 7;
        d.setDate(d.getDate() - diff);
        return applyClock(d, t).getTime();
      }
    }

    // "12 july at 10:00", "july 12 at 10:00 am", "12 july 2023", "july 12, 2023"
    const dm = t.match(/(\d{1,2})\s+([a-z]+)/); // day month
    const md = t.match(/([a-z]+)\s+(\d{1,2})/); // month day
    let day = null, monName = null;
    if (dm && MONTHS[dm[2]] != null) { day = parseInt(dm[1], 10); monName = dm[2]; }
    else if (md && MONTHS[md[1]] != null) { monName = md[1]; day = parseInt(md[2], 10); }
    if (day != null && monName != null) {
      const yearM = t.match(/\b(20\d{2})\b/);
      const nowD = new Date(now);
      let year = yearM ? parseInt(yearM[1], 10) : nowD.getFullYear();
      let d = new Date(year, MONTHS[monName], day);
      // If no explicit year and the date is in the future, it was last year.
      if (!yearM && d.getTime() > now + 86400e3) d = new Date(year - 1, MONTHS[monName], day);
      return applyClock(d, t).getTime();
    }

    // ISO-ish or anything Date can parse directly.
    const parsed = Date.parse(text);
    return isNaN(parsed) ? null : parsed;
  }

  function applyClock(dateObj, text) {
    const c = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/);
    if (c) {
      let h = parseInt(c[1], 10);
      const min = parseInt(c[2], 10);
      const ap = c[3];
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      dateObj.setHours(h, min, 0, 0);
    }
    return dateObj;
  }

  // Deterministic id from arbitrary string (fallback when no permalink id).
  function hashId(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return "h" + (h >>> 0).toString(36);
  }

  // ---- group + feed -------------------------------------------------------

  function getGroupInfo() {
    const m = location.pathname.match(/\/groups\/([^/]+)/);
    const groupId = m ? m[1] : "unknown";
    let groupName = null;
    // Group name is usually the page <title> or the main H1.
    const h1 = document.querySelector('[role="main"] h1');
    if (h1 && h1.textContent.trim()) groupName = h1.textContent.trim();
    if (!groupName) {
      const t = document.title.replace(/\s*\|\s*Facebook.*$/i, "").trim();
      if (t) groupName = t;
    }
    return { groupId, groupName: groupName || groupId };
  }

  function closestArticle(el) {
    return el.closest('[role="article"]');
  }

  // Top-level posts: role="article" not nested inside another article.
  function findPostArticles(root = document) {
    const all = Array.from(root.querySelectorAll('[role="article"]'));
    return all.filter((a) => {
      const parentArticle = a.parentElement && a.parentElement.closest('[role="article"]');
      return !parentArticle;
    });
  }

  // Comments (and replies) inside a post = every nested article within it.
  // Replies are articles nested inside comment articles; we treat them all as
  // comments tied to the same post, which is what the analysis needs.
  function findCommentArticles(postArticle) {
    return Array.from(postArticle.querySelectorAll('[role="article"]')).filter(
      (a) => a !== postArticle
    );
  }

  // ---- field extractors ---------------------------------------------------

  // The permalink anchor is the one whose href points at this post. Prefer
  // /posts/ or /permalink/; that same anchor usually carries the timestamp.
  function extractPermalink(article, groupId) {
    const anchors = Array.from(article.querySelectorAll("a[href]"));
    const scored = anchors
      .map((a) => {
        const href = a.getAttribute("href") || "";
        let score = 0;
        if (/\/posts\//.test(href)) score = 5;
        else if (/\/permalink\//.test(href)) score = 5;
        else if (/multi_permalinks=/.test(href)) score = 4;
        else if (/\/groups\/[^/]+\/(posts|permalink)/.test(href)) score = 5;
        else if (/story_fbid=|fbid=/.test(href)) score = 3;
        else return null;
        // Prefer anchors that are short / timestamp-like (few chars of text).
        const txt = (a.textContent || "").trim();
        if (txt.length > 0 && txt.length < 30) score += 1;
        return { a, href, score };
      })
      .filter(Boolean)
      .sort((x, y) => y.score - x.score);
    if (!scored.length) return { permalink: null, anchor: null, postId: null };
    const best = scored[0];
    let href = best.href;
    if (href.startsWith("/")) href = "https://www.facebook.com" + href;
    // Normalise: strip tracking params but keep the id.
    let postId = null;
    let idm =
      href.match(/\/posts\/([^/?]+)/) ||
      href.match(/\/permalink\/([^/?]+)/) ||
      href.match(/multi_permalinks=([^&]+)/) ||
      href.match(/story_fbid=([^&]+)/) ||
      href.match(/fbid=([^&]+)/);
    if (idm) postId = idm[1];
    const clean = href.split("?")[0];
    return { permalink: clean.replace(/\/$/, ""), anchor: best.a, postId };
  }

  function extractAuthor(article) {
    // The header is the region before the post body. The author link points at
    // a profile/user and carries the display name in bold.
    const anchors = Array.from(article.querySelectorAll("a[href]"));
    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      const txt = (a.textContent || "").trim();
      if (!txt || txt.length > 60) continue;
      // Skip the permalink/timestamp anchors and reaction links.
      if (/\/posts\/|\/permalink\/|multi_permalinks=|story_fbid=/.test(href)) continue;
      if (/^\d/.test(txt) || /(comment|share|like|reply|·)/i.test(txt)) continue;
      const isProfile =
        /\/user\/|\/profile\.php\?id=|facebook\.com\/[^/?]+$|\/groups\/[^/]+\/user\//.test(href) ||
        a.querySelector("strong, b, h2, h3, span");
      if (isProfile) {
        let url = href.split("?")[0];
        if (url.startsWith("/")) url = "https://www.facebook.com" + url;
        if (href.includes("profile.php")) url = "https://www.facebook.com" + href.split("&")[0];
        return { authorName: txt, authorProfileUrl: url };
      }
    }
    return { authorName: null, authorProfileUrl: null };
  }

  // Post body: dir="auto" text blocks that belong to THIS article (not nested
  // comment articles), concatenated. Excludes the header name and UI chrome.
  function extractText(article) {
    const blocks = Array.from(article.querySelectorAll('[dir="auto"]'));
    const parts = [];
    for (const b of blocks) {
      // Only text that belongs directly to this post, not to a nested comment.
      if (b.closest('[role="article"]') !== article) continue;
      // Skip if it sits inside a link (author name, "See more" etc. handled below).
      const txt = (b.innerText || b.textContent || "").trim();
      if (!txt) continue;
      parts.push({ el: b, txt, len: txt.length });
    }
    if (!parts.length) return "";
    // Heuristic: the body is the longest contiguous text block(s). Take the
    // longest, then append any sibling blocks that are also substantial.
    parts.sort((a, b) => b.len - a.len);
    const primary = parts[0];
    // Merge blocks that are near the primary (same parent chain) to catch
    // multi-paragraph posts.
    const container = primary.el.parentElement;
    const merged = parts
      .filter((p) => container && container.contains(p.el))
      .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map((p) => p.txt);
    const text = (merged.length ? merged.join("\n") : primary.txt).trim();
    return text.replace(/\s*See more$/i, "").replace(/\s*See less$/i, "").trim();
  }

  // Engagement counts scraped from the social bar. We read the article's
  // visible text lines and the aria-labels of the reaction summary.
  function extractEngagement(article) {
    let reactions = 0, commentCount = 0, shareCount = 0;

    // Reactions: an element whose aria-label summarises reactions, or the small
    // count next to the reaction icons.
    const labelled = article.querySelectorAll('[aria-label]');
    for (const el of labelled) {
      const lab = el.getAttribute("aria-label") || "";
      let m = lab.match(/([\d.,]+[KMkm]?)\s+(reactions?|likes?)/);
      if (m) reactions = Math.max(reactions, parseCount(m[1]));
      m = lab.match(/([\d.,]+[KMkm]?)\s+comments?/i);
      if (m) commentCount = Math.max(commentCount, parseCount(m[1]));
      m = lab.match(/([\d.,]+[KMkm]?)\s+shares?/i);
      if (m) shareCount = Math.max(shareCount, parseCount(m[1]));
    }

    // Fallback: scan visible text for "N comments" / "N shares" and a lone
    // reaction number.
    const text = article.innerText || article.textContent || "";
    if (!commentCount) {
      const m = text.match(/([\d.,]+[KMkm]?)\s+comments?/i);
      if (m) commentCount = parseCount(m[1]);
    }
    if (!shareCount) {
      const m = text.match(/([\d.,]+[KMkm]?)\s+shares?/i);
      if (m) shareCount = parseCount(m[1]);
    }
    if (!reactions) {
      // The reaction total usually appears right before "comments"/"shares" as
      // a standalone number on the social-context row.
      const m = text.match(/(^|\n)\s*([\d.,]+[KMkm]?)\s*(\n|$)/);
      if (m) reactions = parseCount(m[2]);
    }
    return { reactions, commentCount, shareCount };
  }

  function extractTime(article, anchor) {
    // 1) aria-label / title on the permalink anchor (often the full date).
    const candidates = [];
    if (anchor) {
      candidates.push(anchor.getAttribute("aria-label"));
      candidates.push(anchor.getAttribute("title"));
      candidates.push(anchor.textContent);
      const abbr = anchor.querySelector("abbr, [data-tooltip-content], [title]");
      if (abbr) {
        candidates.push(abbr.getAttribute("data-tooltip-content"));
        candidates.push(abbr.getAttribute("title"));
        candidates.push(abbr.textContent);
      }
    }
    // 2) any element with a tooltip that looks like a date near the header.
    for (const el of article.querySelectorAll("[data-tooltip-content], abbr[title]")) {
      candidates.push(el.getAttribute("data-tooltip-content") || el.getAttribute("title"));
    }
    let timeText = null, timestamp = null;
    for (const c of candidates) {
      if (!c) continue;
      const cleaned = c.trim();
      if (!cleaned) continue;
      const ts = parseRelativeTime(cleaned);
      if (ts) {
        timeText = timeText || cleaned;
        timestamp = ts;
        // A full absolute string (has a month or a year) is authoritative.
        if (/20\d{2}|january|february|march|april|june|july|august|september|october|november|december/i.test(cleaned)) break;
      }
    }
    return { timeText, timestamp };
  }

  function extractMedia(article) {
    const media = [];
    let hasVideo = !!article.querySelector("video");
    let hasPhoto = false;
    let hasLink = false;
    // Content images (skip tiny avatars / emoji / profile pics).
    for (const img of article.querySelectorAll("img")) {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      const src = img.currentSrc || img.src || "";
      if (!src || src.startsWith("data:")) continue;
      if (w >= 130 && h >= 130) {
        hasPhoto = true;
        if (media.length < 8) media.push(src);
      }
    }
    // Outbound link card.
    for (const a of article.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      if (/l\.facebook\.com\/l\.php\?u=/.test(href) || (/^https?:\/\//.test(href) && !/facebook\.com/.test(href))) {
        hasLink = true;
        break;
      }
    }
    return { media, hasPhoto, hasVideo, hasLink };
  }

  // ---- top-level assembly -------------------------------------------------

  function extractPost(article, group) {
    const { permalink, anchor, postId } = extractPermalink(article, group.groupId);
    const author = extractAuthor(article);
    const text = extractText(article);
    const eng = extractEngagement(article);
    const time = extractTime(article, anchor);
    const mediaInfo = extractMedia(article);

    const id =
      postId ||
      hashId(
        group.groupId + "|" + (author.authorName || "") + "|" + (time.timeText || "") + "|" + text.slice(0, 120)
      );

    // Ignore obvious non-posts (empty shells with no text, no media, no author).
    if (!text && !author.authorName && !mediaInfo.hasPhoto && !mediaInfo.hasVideo) return null;

    return {
      id: String(id),
      groupId: group.groupId,
      groupName: group.groupName,
      permalink: permalink || (anchor ? anchor.href : null),
      authorName: author.authorName,
      authorProfileUrl: author.authorProfileUrl,
      text,
      textPreview: text.slice(0, 200),
      reactions: eng.reactions,
      commentCount: eng.commentCount,
      shareCount: eng.shareCount,
      timestamp: time.timestamp,
      timeText: time.timeText,
      media: mediaInfo.media,
      hasPhoto: mediaInfo.hasPhoto,
      hasVideo: mediaInfo.hasVideo,
      hasLink: mediaInfo.hasLink,
      scrapedAt: Date.now()
    };
  }

  function extractComment(commentArticle, post) {
    const author = extractAuthor(commentArticle);
    // Comment text: dir=auto blocks directly under this comment article.
    let text = "";
    for (const b of commentArticle.querySelectorAll('[dir="auto"]')) {
      if (b.closest('[role="article"]') !== commentArticle) continue;
      const t = (b.innerText || b.textContent || "").trim();
      if (t && t.length > text.length) text = t;
    }
    if (!text && !author.authorName) return null;
    // Like count on a comment.
    let likeCount = 0;
    const inner = commentArticle.innerText || commentArticle.textContent || "";
    const lm = inner.match(/([\d.,]+[KMkm]?)\s*(likes?)?\s*$/m);
    for (const el of commentArticle.querySelectorAll("[aria-label]")) {
      const m = (el.getAttribute("aria-label") || "").match(/([\d.,]+[KMkm]?)\s+(reactions?|likes?)/);
      if (m) likeCount = Math.max(likeCount, parseCount(m[1]));
    }
    // Timestamp anchor within the comment.
    const tAnchor = Array.from(commentArticle.querySelectorAll("a[href]")).find((a) =>
      /comment_id=|reply_comment_id=|\/posts\/|\/permalink\//.test(a.getAttribute("href") || "")
    );
    const time = extractTime(commentArticle, tAnchor);

    const id = hashId(post.id + "|" + (author.authorName || "") + "|" + text.slice(0, 120) + "|" + (time.timeText || ""));
    return {
      id,
      postId: post.id,
      groupId: post.groupId,
      authorName: author.authorName,
      authorProfileUrl: author.authorProfileUrl,
      text,
      timestamp: time.timestamp,
      timeText: time.timeText,
      likeCount,
      scrapedAt: Date.now()
    };
  }

  global.FGA = global.FGA || {};
  global.FGA.extract = {
    parseCount,
    parseRelativeTime,
    getGroupInfo,
    findPostArticles,
    findCommentArticles,
    extractPost,
    extractComment
  };
})(typeof self !== "undefined" ? self : this);
