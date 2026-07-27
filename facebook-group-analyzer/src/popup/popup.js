/* popup.js — control panel wiring. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let tabId = null;

  const el = {
    notOnGroup: $("notOnGroup"),
    controls: $("controls"),
    groupBadge: $("groupBadge"),
    pPosts: $("pPosts"),
    pComments: $("pComments"),
    pScrolls: $("pScrolls"),
    status: $("status"),
    startBtn: $("startBtn"),
    stopBtn: $("stopBtn"),
    dashBtn: $("dashBtn"),
    filters: $("filters"),
    maxPosts: $("maxPosts"),
    dateFrom: $("dateFrom"),
    dateTo: $("dateTo"),
    keyword: $("keyword"),
    minEngagement: $("minEngagement"),
    scrollDelay: $("scrollDelay"),
    delayVal: $("delayVal"),
    scrapeComments: $("scrapeComments"),
    expandSeeMore: $("expandSeeMore"),
    dbInfo: $("dbInfo"),
    clearGroup: $("clearGroup")
  };

  let currentGroup = null;

  function sendToTab(message) {
    return new Promise((resolve) => {
      if (tabId == null) return resolve(null);
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        if (chrome.runtime.lastError) return resolve(null);
        resolve(resp);
      });
    });
  }

  async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab ? tab.id : null;
    const onGroup = tab && /https:\/\/(www|web)\.facebook\.com\/groups\//.test(tab.url || "");

    // Load saved settings.
    const { fga_settings } = await chrome.storage.local.get("fga_settings");
    if (fga_settings) applySettings(fga_settings);
    el.delayVal.textContent = (Number(el.scrollDelay.value) / 1000).toFixed(1);

    if (!onGroup) {
      el.notOnGroup.classList.remove("hidden");
      el.controls.classList.add("hidden");
      refreshDbInfo();
      return;
    }

    // Ping content script to confirm injection & get group name.
    const ping = await sendToTab({ type: "PING" });
    el.controls.classList.remove("hidden");
    el.notOnGroup.classList.add("hidden");
    if (ping && ping.group) {
      currentGroup = ping.group;
      el.groupBadge.textContent = ping.group.groupName || ping.group.groupId;
    } else {
      el.groupBadge.textContent = "Group detected — reload page if controls fail";
    }

    // Reflect current running status.
    const status = await sendToTab({ type: "GET_STATUS" });
    if (status && status.progress) renderProgress(status.progress);
    const { fga_progress } = await chrome.storage.local.get("fga_progress");
    if (fga_progress) renderProgress(fga_progress);

    refreshDbInfo();
  }

  function applySettings(s) {
    if (s.maxPosts) el.maxPosts.value = s.maxPosts;
    if (s.scrollDelay) el.scrollDelay.value = s.scrollDelay;
    if (typeof s.scrapeComments === "boolean") el.scrapeComments.checked = s.scrapeComments;
    if (typeof s.expandSeeMore === "boolean") el.expandSeeMore.checked = s.expandSeeMore;
    if (s.keyword) el.keyword.value = s.keyword;
    if (s.minEngagement) el.minEngagement.value = s.minEngagement;
  }

  function collectOptions() {
    const toMs = (v) => (v ? new Date(v + "T00:00:00").getTime() : null);
    const dateToRaw = el.dateTo.value ? new Date(el.dateTo.value + "T23:59:59").getTime() : null;
    return {
      maxPosts: Math.max(10, parseInt(el.maxPosts.value, 10) || 300),
      scrollDelay: parseInt(el.scrollDelay.value, 10) || 1400,
      scrapeComments: el.scrapeComments.checked,
      expandSeeMore: el.expandSeeMore.checked,
      dateFrom: toMs(el.dateFrom.value),
      dateTo: dateToRaw,
      keyword: el.keyword.value.trim(),
      minEngagement: Math.max(0, parseInt(el.minEngagement.value, 10) || 0)
    };
  }

  function persistSettings() {
    const o = collectOptions();
    chrome.storage.local.set({
      fga_settings: {
        maxPosts: o.maxPosts,
        scrollDelay: o.scrollDelay,
        scrapeComments: o.scrapeComments,
        expandSeeMore: o.expandSeeMore,
        keyword: o.keyword,
        minEngagement: o.minEngagement
      }
    });
  }

  function renderProgress(p) {
    el.pPosts.textContent = p.stored || 0;
    el.pComments.textContent = p.comments || 0;
    el.pScrolls.textContent = p.scrolls || 0;
    el.status.textContent = p.status || (p.running ? "Scraping…" : "Idle");
    el.startBtn.classList.toggle("hidden", !!p.running);
    el.stopBtn.classList.toggle("hidden", !p.running);
    if (p.groupName) el.groupBadge.textContent = p.groupName;
  }

  async function refreshDbInfo() {
    try {
      const posts = await FGA.db.count("posts");
      const comments = await FGA.db.count("comments");
      el.dbInfo.textContent = `${posts} posts · ${comments} comments stored`;
    } catch (e) {
      el.dbInfo.textContent = "local DB ready";
    }
  }

  // ---- events -------------------------------------------------------------

  el.startBtn.addEventListener("click", async () => {
    persistSettings();
    const options = collectOptions();
    el.status.textContent = "Starting…";
    const resp = await sendToTab({ type: "START_SCRAPE", options });
    if (!resp) {
      el.status.textContent = "Couldn't reach the page. Reload the Facebook tab and retry.";
    } else if (resp.progress) {
      renderProgress(resp.progress);
    }
  });

  el.stopBtn.addEventListener("click", async () => {
    const resp = await sendToTab({ type: "STOP_SCRAPE" });
    if (resp && resp.progress) renderProgress(resp.progress);
  });

  el.dashBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    window.close();
  });

  el.scrollDelay.addEventListener("input", () => {
    el.delayVal.textContent = (Number(el.scrollDelay.value) / 1000).toFixed(1);
  });

  el.clearGroup.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!currentGroup) {
      alert("Open the group first.");
      return;
    }
    if (!confirm(`Delete all stored posts & comments for "${currentGroup.groupName}"? This cannot be undone.`)) return;
    await FGA.db.clearGroup(currentGroup.groupId);
    await refreshDbInfo();
    el.status.textContent = "Cleared this group's data.";
  });

  // Live updates while the popup is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.fga_progress) {
      renderProgress(changes.fga_progress.newValue || {});
      refreshDbInfo();
    }
  });

  init();
})();
