/* DSE Tracker — a lightweight Dhaka Stock Exchange dashboard.
 * Uses illustrative sample data (see data.js) with a simulated live tick so
 * the dashboard feels alive without needing a paid market-data feed. */

(function () {
  "use strict";

  const HISTORY_POINTS = 40;   // points in each intraday sparkline
  const TICK_MS = 3000;        // how often prices nudge

  // ---- State ----
  let stocks = [];
  let indices = [];
  let sortKey = "pct";
  let sortDir = -1; // -1 desc, 1 asc
  let searchTerm = "";
  let sectorFilter = "all";
  let watchlist = loadWatchlist();
  let openSymbol = null;

  // ---- Helpers ----
  const $ = (sel) => document.querySelector(sel);
  const money = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const compact = (n) => {
    if (n >= 1e7) return (n / 1e7).toFixed(2) + " Cr";
    if (n >= 1e5) return (n / 1e5).toFixed(2) + " L";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return String(n);
  };
  const cls = (chg) => (chg > 0 ? "up" : chg < 0 ? "down" : "flat");
  const arrow = (chg) => (chg > 0 ? "▲" : chg < 0 ? "▼" : "•");

  function rand(min, max) { return Math.random() * (max - min) + min; }

  // Build an intraday series ending at `last`, wandering around `prevClose`.
  function buildSeries(prevClose, last) {
    const pts = [prevClose];
    for (let i = 1; i < HISTORY_POINTS - 1; i++) {
      const prev = pts[i - 1];
      const drift = (last - prevClose) / HISTORY_POINTS;
      pts.push(Math.max(0.5, prev + drift + rand(-1, 1) * prevClose * 0.006));
    }
    pts.push(last);
    return pts;
  }

  // ---- Init data ----
  function initData() {
    stocks = DSE_STOCKS.map((s) => {
      const changePct = rand(-4.5, 4.8);
      const ltp = +(s.prevClose * (1 + changePct / 100)).toFixed(2);
      const volume = Math.round(rand(20_000, 4_500_000));
      return {
        ...s,
        ltp,
        volume,
        series: buildSeries(s.prevClose, ltp),
        dayHigh: +(Math.max(ltp, s.prevClose) * rand(1.0, 1.03)).toFixed(2),
        dayLow: +(Math.min(ltp, s.prevClose) * rand(0.97, 1.0)).toFixed(2),
        open: +(s.prevClose * rand(0.99, 1.01)).toFixed(2),
      };
    });

    indices = DSE_INDICES.map((ix) => {
      const changePct = rand(-1.6, 1.8);
      const value = +(ix.prevClose * (1 + changePct / 100)).toFixed(2);
      return { ...ix, value };
    });
  }

  // ---- Derived getters ----
  const change = (s) => +(s.ltp - s.prevClose).toFixed(2);
  const pct = (s) => +(((s.ltp - s.prevClose) / s.prevClose) * 100).toFixed(2);

  // ---- Rendering ----
  function renderIndices() {
    $("#indices").innerHTML = indices.map((ix) => {
      const chg = +(ix.value - ix.prevClose).toFixed(2);
      const p = +((chg / ix.prevClose) * 100).toFixed(2);
      return `
        <div class="index-card">
          <div class="code">${ix.code} · ${ix.name}</div>
          <div class="value">${money(ix.value)}</div>
          <div class="delta ${cls(chg)}">${arrow(chg)} ${money(Math.abs(chg))} (${p >= 0 ? "+" : ""}${p}%)</div>
        </div>`;
    }).join("");
  }

  function renderBreadth() {
    let adv = 0, dec = 0, unch = 0, turnover = 0;
    stocks.forEach((s) => {
      const c = change(s);
      if (c > 0) adv++; else if (c < 0) dec++; else unch++;
      turnover += s.ltp * s.volume;
    });
    const items = [
      { k: "Advancing", v: `<span class="up">${adv}</span>` },
      { k: "Declining", v: `<span class="down">${dec}</span>` },
      { k: "Unchanged", v: `<span class="flat">${unch}</span>` },
      { k: "Turnover (৳)", v: compact(Math.round(turnover)) },
    ];
    $("#breadth").innerHTML = items.map((i) => `
      <div class="breadth-item"><div class="k">${i.k}</div><div class="v">${i.v}</div></div>
    `).join("");
  }

  function moverRow(s) {
    const p = pct(s);
    return `
      <li data-symbol="${s.symbol}">
        <div>
          <div class="m-sym">${s.symbol}</div>
          <div class="m-name">${s.name}</div>
        </div>
        <div class="m-right">
          <div class="m-ltp">৳${money(s.ltp)}</div>
          <div class="m-pct ${cls(p)}">${p >= 0 ? "+" : ""}${p}%</div>
        </div>
      </li>`;
  }

  function renderMovers() {
    const sorted = [...stocks].sort((a, b) => pct(b) - pct(a));
    $("#gainers").innerHTML = sorted.slice(0, 5).map(moverRow).join("");
    $("#losers").innerHTML = sorted.slice(-5).reverse().map(moverRow).join("");
  }

  function renderSectorFilter() {
    const sectors = ["all", ...Array.from(new Set(stocks.map((s) => s.sector))).sort()];
    $("#sectorFilter").innerHTML = sectors
      .map((s) => `<option value="${s}">${s === "all" ? "All sectors" : s}</option>`)
      .join("");
    $("#sectorFilter").value = sectorFilter;
  }

  function getValue(s, key) {
    switch (key) {
      case "symbol": return s.symbol;
      case "name": return s.name;
      case "ltp": return s.ltp;
      case "change": return change(s);
      case "pct": return pct(s);
      case "volume": return s.volume;
      default: return 0;
    }
  }

  function renderTable(flashMap) {
    const term = searchTerm.trim().toLowerCase();
    let rows = stocks.filter((s) => {
      const matchesTerm = !term || s.symbol.toLowerCase().includes(term) || s.name.toLowerCase().includes(term);
      const matchesSector = sectorFilter === "all" || s.sector === sectorFilter;
      return matchesTerm && matchesSector;
    });

    rows.sort((a, b) => {
      const va = getValue(a, sortKey), vb = getValue(b, sortKey);
      if (typeof va === "string") return va.localeCompare(vb) * sortDir;
      return (va - vb) * sortDir;
    });

    $("#stockBody").innerHTML = rows.map((s) => {
      const c = change(s), p = pct(s);
      const starred = watchlist.has(s.symbol);
      const flash = flashMap && flashMap[s.symbol];
      return `
        <tr data-symbol="${s.symbol}" class="${flash ? (flash > 0 ? "tick-up" : "tick-down") : ""}">
          <td class="col-star"><button class="star ${starred ? "active" : ""}" data-star="${s.symbol}" aria-label="Watchlist">${starred ? "★" : "☆"}</button></td>
          <td class="t-sym">${s.symbol}</td>
          <td class="t-name hide-sm">${s.name}</td>
          <td class="num">${money(s.ltp)}</td>
          <td class="num ${cls(c)}">${c >= 0 ? "+" : ""}${money(c)}</td>
          <td class="num ${cls(p)}">${p >= 0 ? "+" : ""}${p}%</td>
          <td class="num hide-sm">${compact(s.volume)}</td>
        </tr>`;
    }).join("");

    document.querySelectorAll("th.sortable").forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.sort === sortKey) th.classList.add(sortDir === 1 ? "sorted-asc" : "sorted-desc");
    });
  }

  function renderMarketStatus() {
    // DSE trades 10:00–14:30 Bangladesh time (UTC+6), Sunday–Thursday.
    const now = new Date();
    const bd = new Date(now.getTime() + (now.getTimezoneOffset() + 360) * 60000);
    const day = bd.getDay(); // 0 Sun .. 6 Sat
    const mins = bd.getHours() * 60 + bd.getMinutes();
    const isWeekday = day >= 0 && day <= 4; // Sun–Thu
    const open = isWeekday && mins >= 600 && mins <= 870;
    const el = $("#marketStatus");
    el.classList.toggle("open", open);
    el.classList.toggle("closed", !open);
    el.querySelector(".label").textContent = open ? "Market Open" : "Market Closed";
  }

  function renderAll(flashMap) {
    renderIndices();
    renderBreadth();
    renderMovers();
    renderTable(flashMap);
    renderMarketStatus();
    $("#lastUpdated").textContent = new Date().toLocaleTimeString("en-GB");
    if (openSymbol) renderModal(openSymbol);
  }

  // ---- Sparkline / chart ----
  function drawChart(canvas, series, up) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.height;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const min = Math.min(...series), max = Math.max(...series);
    const pad = 10;
    const range = max - min || 1;
    const x = (i) => pad + (i / (series.length - 1)) * (w - pad * 2);
    const y = (v) => h - pad - ((v - min) / range) * (h - pad * 2);
    const color = up ? "#12a06a" : "#e0465e";

    // area fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, up ? "rgba(18,160,106,0.22)" : "rgba(224,70,94,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    ctx.moveTo(x(0), y(series[0]));
    series.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(x(series.length - 1), h - pad);
    ctx.lineTo(x(0), h - pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    ctx.moveTo(x(0), y(series[0]));
    series.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  // ---- Modal ----
  function renderModal(symbol) {
    const s = stocks.find((x) => x.symbol === symbol);
    if (!s) return;
    const c = change(s), p = pct(s);
    $("#modalSymbol").textContent = s.symbol;
    $("#modalName").textContent = s.name;
    $("#modalSector").textContent = s.sector;
    $("#modalLtp").textContent = "৳" + money(s.ltp);
    const chgEl = $("#modalChg");
    chgEl.textContent = `${c >= 0 ? "+" : ""}${money(c)} (${p >= 0 ? "+" : ""}${p}%)`;
    chgEl.className = "chg " + cls(c);

    const stats = [
      ["Open", "৳" + money(s.open)],
      ["Prev Close", "৳" + money(s.prevClose)],
      ["Day High", "৳" + money(s.dayHigh)],
      ["Day Low", "৳" + money(s.dayLow)],
      ["Volume", compact(s.volume)],
      ["Turnover", "৳" + compact(Math.round(s.ltp * s.volume))],
      ["Sector", s.sector],
      ["Symbol", s.symbol],
    ];
    $("#modalStats").innerHTML = stats.map(([k, v]) =>
      `<div class="cell"><div class="k">${k}</div><div class="v">${v}</div></div>`
    ).join("");

    drawChart($("#modalChart"), s.series, c >= 0);
  }

  function openModal(symbol) {
    openSymbol = symbol;
    $("#modalOverlay").hidden = false;
    renderModal(symbol);
  }
  function closeModal() {
    openSymbol = null;
    $("#modalOverlay").hidden = true;
  }

  // ---- Live simulation ----
  function tick() {
    const flashMap = {};
    stocks.forEach((s) => {
      // Small random walk, gently mean-reverting toward prevClose.
      const pull = (s.prevClose - s.ltp) * 0.02;
      const delta = pull + rand(-1, 1) * s.prevClose * 0.004;
      const next = Math.max(0.5, +(s.ltp + delta).toFixed(2));
      flashMap[s.symbol] = next - s.ltp;
      s.ltp = next;
      s.volume += Math.round(rand(0, 12_000));
      s.series.push(next);
      if (s.series.length > HISTORY_POINTS) s.series.shift();
      s.dayHigh = Math.max(s.dayHigh, next);
      s.dayLow = Math.min(s.dayLow, next);
    });
    indices.forEach((ix) => {
      ix.value = +(ix.value + rand(-1, 1) * ix.prevClose * 0.0009).toFixed(2);
    });
    renderAll(flashMap);
  }

  // ---- Persistence ----
  function loadWatchlist() {
    try { return new Set(JSON.parse(localStorage.getItem("dse_watchlist") || "[]")); }
    catch { return new Set(); }
  }
  function saveWatchlist() {
    localStorage.setItem("dse_watchlist", JSON.stringify([...watchlist]));
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    $("#themeToggle").textContent = theme === "dark" ? "☀" : "☾";
    localStorage.setItem("dse_theme", theme);
  }

  // ---- Events ----
  function wireEvents() {
    $("#search").addEventListener("input", (e) => { searchTerm = e.target.value; renderTable(); });
    $("#sectorFilter").addEventListener("change", (e) => { sectorFilter = e.target.value; renderTable(); });

    document.querySelectorAll("th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (sortKey === key) sortDir *= -1;
        else { sortKey = key; sortDir = key === "symbol" || key === "name" ? 1 : -1; }
        renderTable();
      });
    });

    $("#stockBody").addEventListener("click", (e) => {
      const star = e.target.closest("[data-star]");
      if (star) {
        e.stopPropagation();
        const sym = star.dataset.star;
        if (watchlist.has(sym)) watchlist.delete(sym); else watchlist.add(sym);
        saveWatchlist();
        renderTable();
        return;
      }
      const row = e.target.closest("tr[data-symbol]");
      if (row) openModal(row.dataset.symbol);
    });

    document.querySelectorAll(".mover-list").forEach((ul) => {
      ul.addEventListener("click", (e) => {
        const li = e.target.closest("li[data-symbol]");
        if (li) openModal(li.dataset.symbol);
      });
    });

    $("#modalClose").addEventListener("click", closeModal);
    $("#modalOverlay").addEventListener("click", (e) => {
      if (e.target === $("#modalOverlay")) closeModal();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

    $("#themeToggle").addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }

  // ---- Boot ----
  function boot() {
    const savedTheme = localStorage.getItem("dse_theme")
      || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(savedTheme);
    initData();
    renderSectorFilter();
    wireEvents();
    renderAll();
    setInterval(tick, TICK_MS);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
