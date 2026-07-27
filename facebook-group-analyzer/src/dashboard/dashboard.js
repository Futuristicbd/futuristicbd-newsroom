/* dashboard.js — offline analysis workspace over the locally stored data. */
(function () {
  "use strict";
  const { db, analyzer } = FGA;
  const $ = (s) => document.querySelector(s);

  const store = {
    allPosts: [],
    allComments: [],
    sessions: [],
    groupId: null,
    tab: "overview"
  };

  // ---- helpers ------------------------------------------------------------

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function nf(n) {
    n = n || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(n);
  }
  function fmtDate(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  function fmtDateTime(ts) {
    if (!ts) return "unknown time";
    return new Date(ts).toLocaleString();
  }
  function sentimentPill(s) {
    if (s > 0.15) return '<span class="pill pos">＋</span>';
    if (s < -0.15) return '<span class="pill neg">－</span>';
    return '<span class="pill neu">◦</span>';
  }

  // ---- data loading -------------------------------------------------------

  async function loadAll() {
    store.allPosts = await db.getAll("posts");
    store.allComments = await db.getAll("comments");
    store.sessions = await db.getAll("sessions");
    populateGroups();
  }

  function populateGroups() {
    const groups = new Map();
    for (const p of store.allPosts) {
      if (!groups.has(p.groupId)) groups.set(p.groupId, p.groupName || p.groupId);
    }
    const sel = $("#groupSelect");
    const prev = store.groupId;
    sel.innerHTML = "";
    if (groups.size === 0) {
      sel.innerHTML = '<option value="">No data yet</option>';
      store.groupId = null;
      return;
    }
    for (const [id, name] of groups) {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = name;
      sel.appendChild(o);
    }
    store.groupId = groups.has(prev) ? prev : groups.keys().next().value;
    sel.value = store.groupId;
  }

  function groupPosts() {
    return store.allPosts.filter((p) => p.groupId === store.groupId);
  }
  function groupComments() {
    return store.allComments.filter((p) => p.groupId === store.groupId);
  }

  // ---- filtering + sorting ------------------------------------------------

  function getFilters() {
    const from = $("#fFrom").value ? new Date($("#fFrom").value + "T00:00:00").getTime() : null;
    const to = $("#fTo").value ? new Date($("#fTo").value + "T23:59:59").getTime() : null;
    return {
      search: $("#fSearch").value.trim().toLowerCase(),
      from,
      to,
      minEng: parseInt($("#fMinEng").value, 10) || 0,
      media: $("#fMedia").value,
      sort: $("#fSort").value
    };
  }

  function applyFilters(posts) {
    const f = getFilters();
    let out = posts.filter((p) => {
      if (f.from && (!p.timestamp || p.timestamp < f.from)) return false;
      if (f.to && (!p.timestamp || p.timestamp > f.to)) return false;
      if (f.minEng && (p.engagementScore || 0) < f.minEng) return false;
      if (f.media === "photo" && !p.hasPhoto) return false;
      if (f.media === "video" && !p.hasVideo) return false;
      if (f.media === "link" && !p.hasLink) return false;
      if (f.media === "text" && (p.hasPhoto || p.hasVideo)) return false;
      if (f.search) {
        const hay = (p.text + " " + (p.authorName || "") + " " + (p.keywords || []).join(" ")).toLowerCase();
        if (!hay.includes(f.search)) return false;
      }
      return true;
    });
    const dir = f.sort.endsWith("_asc") ? 1 : -1;
    const key = f.sort.replace("_asc", "");
    out.sort((a, b) => dir * (((a[key] || 0) - (b[key] || 0)) < 0 ? -1 : ((a[key] || 0) - (b[key] || 0)) > 0 ? 1 : 0));
    return out;
  }

  // ---- rendering: tabs ----------------------------------------------------

  function render() {
    const posts = applyFilters(groupPosts());
    const view = $("#view");
    if (!store.groupId) {
      view.innerHTML =
        '<div class="empty"><h2>No data yet</h2><p>Open a Facebook group, click the Group Insight icon and press <b>Start scraping</b>. Come back here when it finishes.</p></div>';
      $("#footInfo").textContent = "";
      return;
    }
    const map = { overview: renderOverview, posts: renderPosts, viral: renderViral, topics: renderTopics, authors: renderAuthors, comments: renderComments };
    view.innerHTML = (map[store.tab] || renderOverview)(posts);
    $("#footInfo").textContent = `${posts.length} of ${groupPosts().length} posts shown · ${groupComments().length} comments`;
    wireRowHandlers();
  }

  function renderOverview(posts) {
    const totalReactions = posts.reduce((s, p) => s + (p.reactions || 0), 0);
    const totalComments = posts.reduce((s, p) => s + (p.commentCount || 0), 0);
    const totalShares = posts.reduce((s, p) => s + (p.shareCount || 0), 0);
    const avgEng = posts.length ? Math.round(posts.reduce((s, p) => s + (p.engagementScore || 0), 0) / posts.length) : 0;
    const withMedia = posts.filter((p) => p.hasPhoto || p.hasVideo).length;
    const avgSent = posts.length ? posts.reduce((s, p) => s + (p.sentiment || 0), 0) / posts.length : 0;

    const kpis = [
      [nf(posts.length), "posts"],
      [nf(totalReactions), "reactions"],
      [nf(totalComments), "comments"],
      [nf(totalShares), "shares"],
      [nf(avgEng), "avg engagement"],
      [Math.round((withMedia / (posts.length || 1)) * 100) + "%", "with media"],
      [(avgSent >= 0 ? "+" : "") + avgSent.toFixed(2), "avg sentiment"]
    ];
    const kpiHtml = kpis.map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("");

    // timeline
    const tl = analyzer.timeline(posts);
    const maxV = Math.max(1, ...tl.map((d) => d.posts));
    const bars = tl
      .map((d) => `<div class="bar" style="height:${Math.max(4, (d.posts / maxV) * 110)}px" data-label="${d.date}: ${d.posts} posts"></div>`)
      .join("");
    const tlHtml = tl.length
      ? `<div class="card"><h3>Activity over time</h3><div class="bars">${bars}</div><div class="bars-x"><span>${tl[0].date}</span><span>${tl[tl.length - 1].date}</span></div></div>`
      : "";

    // top posts by viral
    const top = [...posts].sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0)).slice(0, 5);
    const topHtml = `<div class="card"><h3>Most viral right now</h3>${miniPostList(top)}</div>`;

    const note = posts.some((p) => !p.timestamp)
      ? '<div class="card muted" style="font-size:12px">Some posts have no reliable timestamp (Facebook only shows relative times until hovered), so date filters and the timeline may miss them.</div>'
      : "";

    return `<div class="kpis">${kpiHtml}</div>${tlHtml}${topHtml}${note}`;
  }

  function miniPostList(posts) {
    if (!posts.length) return '<div class="muted">Nothing here.</div>';
    return (
      '<div class="tbl-wrap"><table><tbody>' +
      posts
        .map(
          (p, i) => `<tr data-id="${esc(p.id)}">
        <td class="rank">${i + 1}</td>
        <td class="post-text"><div class="txt">${esc(p.textPreview || p.text || "(no text)")}</div>
          <div class="muted" style="font-size:12px">${esc(p.authorName || "Unknown")} · ${fmtDate(p.timestamp)}</div></td>
        <td class="num">${nf(p.reactions)}👍 ${nf(p.commentCount)}💬 ${nf(p.shareCount)}↗</td>
        <td class="num">${nf(Math.round(p.viralScore || 0))}</td>
      </tr>`
        )
        .join("") +
      "</tbody></table></div>"
    );
  }

  function postTableRows(posts) {
    return posts
      .map(
        (p) => `<tr data-id="${esc(p.id)}">
      <td class="post-text">
        <div class="txt">${esc(p.text || "(no text)")}</div>
        <div class="chips">${(p.keywords || []).slice(0, 5).map((k) => `<span class="chip">${esc(k)}</span>`).join("")}</div>
      </td>
      <td>${esc(p.authorName || "Unknown")}</td>
      <td class="num">${fmtDate(p.timestamp)}</td>
      <td class="num">${nf(p.reactions)}</td>
      <td class="num">${nf(p.commentCount)}</td>
      <td class="num">${nf(p.shareCount)}</td>
      <td class="num">${nf(p.engagementScore)}</td>
      <td>${sentimentPill(p.sentiment)}</td>
      <td>${p.permalink ? `<a class="mini-link" href="${esc(p.permalink)}" target="_blank" rel="noopener">open ↗</a>` : "—"}</td>
    </tr>`
      )
      .join("");
  }

  function renderPosts(posts) {
    if (!posts.length) return '<div class="empty">No posts match the filters.</div>';
    return `<div class="card"><div class="tbl-wrap"><table>
      <thead><tr>
        <th>Post</th><th>Author</th><th>Date</th><th class="num">React</th><th class="num">Cmt</th>
        <th class="num">Share</th><th class="num">Eng.</th><th>Sent.</th><th>Link</th>
      </tr></thead>
      <tbody>${postTableRows(posts)}</tbody></table></div></div>`;
  }

  function renderViral(posts) {
    const ranked = [...posts].sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0)).slice(0, 100);
    if (!ranked.length) return '<div class="empty">No posts to rank.</div>';
    const rows = ranked
      .map(
        (p, i) => `<tr data-id="${esc(p.id)}">
      <td class="rank">${i + 1}</td>
      <td class="post-text"><div class="txt">${esc(p.textPreview || p.text)}</div>
        <div class="muted" style="font-size:12px">${esc(p.authorName || "Unknown")} · ${fmtDate(p.timestamp)}</div></td>
      <td class="num">${nf(p.reactions)}</td>
      <td class="num">${nf(p.commentCount)}</td>
      <td class="num">${nf(p.shareCount)}</td>
      <td class="num">${nf(p.engagementScore)}</td>
      <td class="num"><b>${nf(Math.round(p.viralScore || 0))}</b></td>
      <td>${p.permalink ? `<a class="mini-link" href="${esc(p.permalink)}" target="_blank" rel="noopener">↗</a>` : "—"}</td>
    </tr>`
      )
      .join("");
    return `<div class="card"><h3>Viral ranking <span class="muted" style="font-weight:400;font-size:12px">— engagement weighted by how fast it accumulated</span></h3>
      <div class="tbl-wrap"><table><thead><tr><th>#</th><th>Post</th><th class="num">React</th><th class="num">Cmt</th><th class="num">Share</th><th class="num">Eng.</th><th class="num">Viral</th><th>Link</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  }

  function renderTopics(posts) {
    const topics = analyzer.topicAggregate(posts, 60);
    if (!topics.length) return '<div class="empty">Not enough text to extract topics.</div>';
    const maxPosts = Math.max(...topics.map((t) => t.posts));
    const rows = topics
      .map(
        (t) => `<tr data-kw="${esc(t.keyword)}">
      <td><span class="chip">${esc(t.keyword)}</span></td>
      <td style="width:220px"><div class="bar" style="height:10px;width:${Math.max(6, (t.posts / maxPosts) * 200)}px;border-radius:5px"></div></td>
      <td class="num">${t.posts}</td>
      <td class="num">${nf(t.engagement)}</td>
      <td class="num">${nf(t.avgEngagement)}</td>
      <td>${sentimentPill(t.avgSentiment)} ${t.avgSentiment.toFixed(2)}</td>
    </tr>`
      )
      .join("");
    return `<div class="card"><h3>Topics &amp; keywords <span class="muted" style="font-weight:400;font-size:12px">— click a keyword to filter posts</span></h3>
      <div class="tbl-wrap"><table><thead><tr><th>Keyword</th><th>Volume</th><th class="num">Posts</th><th class="num">Total eng.</th><th class="num">Avg eng.</th><th>Avg sentiment</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  }

  function renderAuthors(posts) {
    const authors = analyzer.topAuthors(posts, 50);
    if (!authors.length) return '<div class="empty">No authors found.</div>';
    const rows = authors
      .map(
        (a, i) => `<tr>
      <td class="rank">${i + 1}</td>
      <td class="author-a">${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name)}</a>` : esc(a.name)}</td>
      <td class="num">${a.posts}</td>
      <td class="num">${nf(a.engagement)}</td>
      <td class="num">${nf(Math.round(a.engagement / a.posts))}</td>
    </tr>`
      )
      .join("");
    return `<div class="card"><h3>Top contributors</h3>
      <div class="tbl-wrap"><table><thead><tr><th>#</th><th>Author</th><th class="num">Posts</th><th class="num">Total eng.</th><th class="num">Avg eng./post</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  }

  function renderComments() {
    const comments = groupComments();
    if (!comments.length)
      return '<div class="empty">No comments stored. Enable “Scrape visible comments” before scraping — Facebook only loads a few per post until you open it.</div>';
    const top = [...comments].sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0)).slice(0, 200);
    const postById = new Map(groupPosts().map((p) => [p.id, p]));
    const rows = top
      .map((c) => {
        const p = postById.get(c.postId);
        return `<tr>
        <td class="post-text"><div class="txt">${esc(c.text)}</div></td>
        <td>${esc(c.authorName || "Unknown")}</td>
        <td class="num">${nf(c.likeCount)}</td>
        <td>${sentimentPill(c.sentiment)}</td>
        <td class="post-text"><div class="muted" style="font-size:12px" data-id="${esc(c.postId)}">${esc(p ? (p.textPreview || "").slice(0, 60) : "—")}</div></td>
      </tr>`;
      })
      .join("");
    return `<div class="card"><h3>Comments <span class="muted" style="font-weight:400;font-size:12px">— ${comments.length} stored, showing top 200 by likes</span></h3>
      <div class="tbl-wrap"><table><thead><tr><th>Comment</th><th>Author</th><th class="num">Likes</th><th>Sent.</th><th>On post</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  }

  // ---- post detail modal --------------------------------------------------

  function openPost(id) {
    const p = store.allPosts.find((x) => x.id === id);
    if (!p) return;
    const comments = store.allComments.filter((c) => c.postId === id).sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
    const cHtml = comments.length
      ? comments
          .map(
            (c) => `<div class="comment"><div>${esc(c.text)}</div>
        <div class="c-meta">${esc(c.authorName || "Unknown")} · ${nf(c.likeCount)} likes · ${c.timeText ? esc(c.timeText) : fmtDate(c.timestamp)} ${sentimentPill(c.sentiment)}</div></div>`
          )
          .join("")
      : '<div class="muted">No comments captured for this post.</div>';
    $("#modalBody").innerHTML = `
      <h2>${esc(p.authorName || "Unknown")} <span class="badge">${fmtDateTime(p.timestamp)}</span></h2>
      <p style="white-space:pre-wrap">${esc(p.text || "(no text)")}</p>
      <div class="chips">${(p.keywords || []).map((k) => `<span class="chip">${esc(k)}</span>`).join("")}</div>
      <p class="muted" style="margin-top:12px">
        ${nf(p.reactions)} reactions · ${nf(p.commentCount)} comments · ${nf(p.shareCount)} shares ·
        engagement ${nf(p.engagementScore)} · viral ${nf(Math.round(p.viralScore || 0))}
        ${p.permalink ? ` · <a href="${esc(p.permalink)}" target="_blank" rel="noopener">open on Facebook ↗</a>` : ""}
      </p>
      <h3 style="margin-top:16px">Comments (${comments.length})</h3>
      ${cHtml}`;
    $("#modal").classList.remove("hidden");
  }

  function wireRowHandlers() {
    $("#view").querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.style.cursor = "pointer";
      tr.addEventListener("click", (e) => {
        if (e.target.closest("a")) return; // let links work
        openPost(tr.getAttribute("data-id"));
      });
    });
    $("#view").querySelectorAll("tr[data-kw]").forEach((tr) => {
      tr.style.cursor = "pointer";
      tr.addEventListener("click", () => {
        $("#fSearch").value = tr.getAttribute("data-kw");
        setTab("posts");
      });
    });
  }

  // ---- export -------------------------------------------------------------

  function toCsv(rows, columns) {
    const head = columns.join(",");
    const body = rows
      .map((r) =>
        columns
          .map((c) => {
            let v = r[c];
            if (Array.isArray(v)) v = v.join(" | ");
            if (v == null) v = "";
            v = String(v).replace(/"/g, '""');
            return `"${v}"`;
          })
          .join(",")
      )
      .join("\n");
    return head + "\n" + body;
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function doExport(kind) {
    const gid = store.groupId;
    const name = (store.allPosts.find((p) => p.groupId === gid) || {}).groupName || gid || "group";
    const safe = String(name).replace(/[^\w-]+/g, "_").slice(0, 40);
    if (kind === "posts-csv") {
      const cols = ["id", "authorName", "authorProfileUrl", "timestamp", "timeText", "reactions", "commentCount", "shareCount", "engagementScore", "viralScore", "sentiment", "hasPhoto", "hasVideo", "hasLink", "keywords", "permalink", "text"];
      download(`${safe}_posts.csv`, toCsv(applyFilters(groupPosts()), cols), "text/csv");
    } else if (kind === "posts-json") {
      download(`${safe}_posts.json`, JSON.stringify(applyFilters(groupPosts()), null, 2), "application/json");
    } else if (kind === "comments-csv") {
      const cols = ["id", "postId", "authorName", "authorProfileUrl", "timestamp", "timeText", "likeCount", "sentiment", "text"];
      download(`${safe}_comments.csv`, toCsv(groupComments(), cols), "text/csv");
    } else if (kind === "comments-json") {
      download(`${safe}_comments.json`, JSON.stringify(groupComments(), null, 2), "application/json");
    }
  }

  // ---- wiring -------------------------------------------------------------

  function setTab(tab) {
    store.tab = tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    render();
  }

  function wire() {
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));
    $("#groupSelect").addEventListener("change", (e) => {
      store.groupId = e.target.value;
      render();
    });
    ["#fSearch", "#fFrom", "#fTo", "#fMinEng", "#fMedia", "#fSort"].forEach((s) => {
      const el = $(s);
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });
    $("#clearFilters").addEventListener("click", () => {
      ["#fSearch", "#fFrom", "#fTo"].forEach((s) => ($(s).value = ""));
      $("#fMinEng").value = 0;
      $("#fMedia").value = "";
      $("#fSort").value = "viralScore";
      render();
    });
    $("#refreshBtn").addEventListener("click", async () => {
      await loadAll();
      render();
    });
    $("#modalX").addEventListener("click", () => $("#modal").classList.add("hidden"));
    $("#modal").addEventListener("click", (e) => {
      if (e.target.id === "modal") $("#modal").classList.add("hidden");
    });
    // export menu
    $("#exportBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      $("#exportMenu").classList.toggle("open");
    });
    $("#exportMenu").querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        doExport(a.dataset.x);
        $("#exportMenu").classList.remove("open");
      })
    );
    document.addEventListener("click", () => $("#exportMenu").classList.remove("open"));

    // Live refresh when a scrape writes new progress.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.fga_progress) {
        // debounce-ish: reload counts only when a scrape finishes or every ~15 posts
        const p = changes.fga_progress.newValue;
        if (p && (!p.running || p.stored % 15 === 0)) {
          loadAll().then(render);
        }
      }
    });
  }

  async function boot() {
    wire();
    await loadAll();
    render();
  }
  boot();
})();
