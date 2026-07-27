/*
 * background.js — MV3 service worker.
 *
 * Owns all writes to the extension-origin IndexedDB. This matters: a content
 * script's `indexedDB` points at the HOST PAGE's origin (facebook.com), which
 * the dashboard (extension origin) can't read. So the scraper ships enriched
 * records here via messages, and this worker persists them into the shared
 * extension database that the popup and dashboard read directly.
 */
importScripts("src/lib/db.js", "src/lib/analyzer.js");

const db = self.FGA.db;
const DASHBOARD_URL = "src/dashboard/dashboard.html";

function openDashboard() {
  const url = chrome.runtime.getURL(DASHBOARD_URL);
  chrome.tabs.query({}, (tabs) => {
    const existing = tabs.find((t) => t.url && t.url.startsWith(url));
    if (existing) {
      chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) chrome.windows.update(existing.windowId, { focused: true });
    } else {
      chrome.tabs.create({ url });
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case "OPEN_DASHBOARD":
      openDashboard();
      sendResponse({ ok: true });
      return true;

    // Persist a batch of posts and/or comments produced by the scraper.
    case "DB_BATCH":
      (async () => {
        try {
          const posts = msg.posts && msg.posts.length ? await db.putMany("posts", msg.posts) : 0;
          const comments = msg.comments && msg.comments.length ? await db.putMany("comments", msg.comments) : 0;
          sendResponse({ ok: true, posts, comments });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true; // async response

    // Generic single-store write (sessions, etc.).
    case "DB_PUT":
      (async () => {
        try {
          const n = await db.putMany(msg.store, msg.records || []);
          sendResponse({ ok: true, count: n });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true;

    default:
      return false;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("fga_settings", (r) => {
    if (!r.fga_settings) {
      chrome.storage.local.set({
        fga_settings: {
          maxPosts: 300,
          scrollDelay: 1400,
          scrapeComments: true,
          expandSeeMore: true
        }
      });
    }
  });
});
