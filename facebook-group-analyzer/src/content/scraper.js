/*
 * scraper.js — the content-script controller.
 *
 * Drives the scrape: auto-scrolls the virtualised group feed, expands "See
 * more" / "View more comments", extracts each post BEFORE Facebook recycles it
 * out of the DOM, enriches and stores it, and reports live progress to an
 * in-page overlay and to the popup/dashboard via chrome.storage.
 *
 * Politeness: a configurable delay + jitter between scroll steps, and a hard
 * post cap, so this behaves like an attentive human reader rather than a
 * hammering bot. All data is written to a local IndexedDB — nothing is sent
 * anywhere off the machine.
 */
(function () {
  "use strict";

  const FGA = self.FGA;
  const { analyzer, extract } = FGA;

  // Persistence goes through the background service worker, which writes to the
  // EXTENSION-origin IndexedDB. A content script's own indexedDB belongs to
  // facebook.com and would be invisible to the dashboard.
  function sendBg(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (resp) => {
          if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
          resolve(resp || { ok: false });
        });
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  const DEFAULTS = {
    maxPosts: 300,
    scrollDelay: 1400, // ms between scroll steps
    jitter: 700, // added random 0..jitter
    maxIdleRounds: 6, // stop after this many scrolls with no new posts
    scrapeComments: true,
    expandSeeMore: true,
    maxCommentExpandsPerRound: 4,
    dateFrom: null, // ms — skip storing posts older than this
    dateTo: null, // ms — skip storing posts newer than this
    minEngagement: 0,
    keyword: "" // only store posts whose text matches (case-insensitive)
  };

  const state = {
    running: false,
    options: null,
    group: null,
    sessionId: null,
    seen: new Set(),
    stored: 0,
    comments: 0,
    scrolls: 0,
    startedAt: 0,
    lastError: null
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- progress broadcasting ----------------------------------------------

  function progress(extra) {
    const p = {
      running: state.running,
      groupId: state.group ? state.group.groupId : null,
      groupName: state.group ? state.group.groupName : null,
      stored: state.stored,
      comments: state.comments,
      scrolls: state.scrolls,
      startedAt: state.startedAt,
      lastError: state.lastError,
      updatedAt: Date.now(),
      ...extra
    };
    try {
      chrome.storage.local.set({ fga_progress: p });
    } catch (e) {}
    updateOverlay(p);
    return p;
  }

  // ---- in-page overlay ----------------------------------------------------

  let overlayEl = null;
  function ensureOverlay() {
    if (overlayEl && document.body.contains(overlayEl)) return overlayEl;
    overlayEl = document.createElement("div");
    overlayEl.id = "fga-overlay";
    overlayEl.innerHTML = `
      <div class="fga-head">
        <span class="fga-dot"></span>
        <strong>Group Insight</strong>
        <button class="fga-x" title="Hide">×</button>
      </div>
      <div class="fga-body">
        <div class="fga-line"><span id="fga-group">—</span></div>
        <div class="fga-stats">
          <div><b id="fga-posts">0</b><small>posts</small></div>
          <div><b id="fga-comments">0</b><small>comments</small></div>
          <div><b id="fga-scrolls">0</b><small>scrolls</small></div>
        </div>
        <div class="fga-actions">
          <button id="fga-stop" class="fga-btn fga-stop">Stop</button>
          <button id="fga-dash" class="fga-btn">Dashboard</button>
        </div>
        <div class="fga-status" id="fga-status">Idle</div>
      </div>`;
    document.body.appendChild(overlayEl);
    overlayEl.querySelector(".fga-x").addEventListener("click", () => (overlayEl.style.display = "none"));
    overlayEl.querySelector("#fga-stop").addEventListener("click", stop);
    overlayEl.querySelector("#fga-dash").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    });
    return overlayEl;
  }

  function updateOverlay(p) {
    if (!overlayEl) return;
    overlayEl.style.display = "block";
    const set = (id, v) => {
      const el = overlayEl.querySelector(id);
      if (el) el.textContent = v;
    };
    set("#fga-group", p.groupName || "—");
    set("#fga-posts", p.stored);
    set("#fga-comments", p.comments);
    set("#fga-scrolls", p.scrolls);
    set("#fga-status", p.status || (p.running ? "Scraping…" : "Done"));
    overlayEl.querySelector(".fga-dot").classList.toggle("live", !!p.running);
    const stopBtn = overlayEl.querySelector("#fga-stop");
    if (stopBtn) stopBtn.textContent = p.running ? "Stop" : "Closed";
  }

  // ---- DOM expansion helpers ----------------------------------------------

  const SEE_MORE_RE = /^(see more|আরও দেখুন|see more…)$/i;
  const MORE_COMMENTS_RE = /(view|show|previous).{0,20}(comment|repl)|more comment|আরও কমেন্ট/i;

  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight * 1.2 && r.bottom > -window.innerHeight * 0.2 && r.width > 0;
  }

  function clickButtons(matcher, limit) {
    let clicked = 0;
    const nodes = document.querySelectorAll('div[role="button"], span[role="button"], a[role="button"]');
    for (const n of nodes) {
      if (clicked >= limit) break;
      const txt = (n.textContent || "").trim();
      if (!txt) continue;
      if (matcher(txt) && inViewport(n)) {
        try {
          n.click();
          clicked++;
        } catch (e) {}
      }
    }
    return clicked;
  }

  function expandSeeMore() {
    return clickButtons((t) => SEE_MORE_RE.test(t), 12);
  }
  function expandComments(limit) {
    return clickButtons((t) => MORE_COMMENTS_RE.test(t), limit);
  }

  // ---- filtering ----------------------------------------------------------

  function passesFilters(post, o) {
    if (o.dateFrom && post.timestamp && post.timestamp < o.dateFrom) return false;
    if (o.dateTo && post.timestamp && post.timestamp > o.dateTo) return false;
    if (o.minEngagement && (post.engagementScore || 0) < o.minEngagement) return false;
    if (o.keyword) {
      const k = o.keyword.toLowerCase();
      if (!(post.text || "").toLowerCase().includes(k)) return false;
    }
    return true;
  }

  // ---- main loop ----------------------------------------------------------

  async function harvestVisible() {
    const articles = extract.findPostArticles();
    const postBatch = [];
    const commentBatch = [];
    let newCount = 0;

    for (const art of articles) {
      if (!state.running) break;
      let post;
      try {
        post = extract.extractPost(art, state.group);
      } catch (e) {
        continue;
      }
      if (!post || state.seen.has(post.id)) continue;
      state.seen.add(post.id);

      analyzer.enrichPost(post);
      if (!passesFilters(post, state.options)) continue;
      post.sessionId = state.sessionId;
      postBatch.push(post);
      newCount++;

      if (state.options.scrapeComments) {
        try {
          const commentEls = extract.findCommentArticles(art);
          for (const cEl of commentEls) {
            const c = extract.extractComment(cEl, post);
            if (!c) continue;
            analyzer.enrichComment(c);
            c.sessionId = state.sessionId;
            commentBatch.push(c);
          }
        } catch (e) {
          state.lastError = String(e);
        }
      }

      if (state.stored + postBatch.length >= state.options.maxPosts) break;
    }

    if (postBatch.length || commentBatch.length) {
      const resp = await sendBg({ type: "DB_BATCH", posts: postBatch, comments: commentBatch });
      if (resp && resp.ok) {
        state.stored += postBatch.length;
        state.comments += commentBatch.length;
      } else {
        state.lastError = (resp && resp.error) || "storage failed";
      }
    }
    return newCount;
  }

  async function run(options) {
    if (state.running) return progress({ status: "Already running" });
    state.options = Object.assign({}, DEFAULTS, options || {});
    state.group = extract.getGroupInfo();
    state.running = true;
    state.seen = new Set();
    state.stored = 0;
    state.comments = 0;
    state.scrolls = 0;
    state.lastError = null;
    state.startedAt = Date.now();
    state.sessionId = state.group.groupId + ":" + state.startedAt;

    ensureOverlay();
    progress({ status: "Starting…" });

    // Record the session.
    await sendBg({
      type: "DB_PUT",
      store: "sessions",
      records: [
        {
          id: state.sessionId,
          groupId: state.group.groupId,
          groupName: state.group.groupName,
          startedAt: state.startedAt,
          options: state.options
        }
      ]
    });

    let idle = 0;
    try {
      while (state.running && state.stored < state.options.maxPosts && idle < state.options.maxIdleRounds) {
        if (state.options.expandSeeMore) expandSeeMore();
        if (state.options.scrapeComments) expandComments(state.options.maxCommentExpandsPerRound);
        // Give expansions a moment to render before reading.
        await sleep(350);

        const newCount = await harvestVisible();
        idle = newCount > 0 ? 0 : idle + 1;
        progress({ status: newCount > 0 ? "Scraping…" : `No new posts (${idle}/${state.options.maxIdleRounds})` });

        // Scroll roughly one viewport to load the next batch.
        window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "smooth" });
        state.scrolls++;
        await sleep(state.options.scrollDelay + Math.random() * state.options.jitter);
      }
    } catch (e) {
      state.lastError = String(e && e.stack ? e.stack : e);
    }

    const reason = !state.running
      ? "Stopped"
      : state.stored >= state.options.maxPosts
      ? "Reached post limit"
      : "End of feed";
    state.running = false;

    await sendBg({
      type: "DB_PUT",
      store: "sessions",
      records: [
        {
          id: state.sessionId,
          groupId: state.group.groupId,
          groupName: state.group.groupName,
          startedAt: state.startedAt,
          finishedAt: Date.now(),
          posts: state.stored,
          comments: state.comments,
          reason,
          options: state.options
        }
      ]
    });

    return progress({ status: "Done — " + reason });
  }

  function stop() {
    if (!state.running) return progress({ status: "Idle" });
    state.running = false;
    return progress({ status: "Stopping…" });
  }

  // ---- message handling ---------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case "PING":
        sendResponse({ ok: true, onGroup: /\/groups\//.test(location.pathname), group: extract.getGroupInfo() });
        return true;
      case "START_SCRAPE":
        run(msg.options).then((p) => sendResponse({ ok: true, progress: p }));
        return true; // async
      case "STOP_SCRAPE":
        sendResponse({ ok: true, progress: stop() });
        return true;
      case "GET_STATUS":
        sendResponse({
          ok: true,
          progress: {
            running: state.running,
            stored: state.stored,
            comments: state.comments,
            scrolls: state.scrolls,
            groupName: state.group ? state.group.groupName : null,
            groupId: state.group ? state.group.groupId : extract.getGroupInfo().groupId
          }
        });
        return true;
      default:
        return;
    }
  });

  // Announce readiness (helps the popup detect an injected tab).
  try {
    chrome.storage.local.set({ fga_content_ready: { url: location.href, at: Date.now() } });
  } catch (e) {}
})();
