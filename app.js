const STORE_KEY = "daily-forge-v1";
const SCHEMA_VERSION = 2;

const SECTIONS = [
  { id: "body", name: "Body" },
  { id: "spirit", name: "Spirit" },
  { id: "recovery", name: "Recovery" },
  { id: "clean", name: "Clean" },
  { id: "family", name: "Family" },
  { id: "sleep", name: "Sleep" }
];

const DEFAULT_ITEMS = [
  { id: "run", name: "Go for a run", detail: "Morning outdoor run", points: 10, section: "body" },
  { id: "sauna", name: "Sauna", detail: "", points: 6, section: "body" },
  { id: "lifting", name: "Midday weight lifting", detail: "", points: 10, section: "body" },
  { id: "red_light", name: "Red light therapy", detail: "", points: 5, section: "body" },
  { id: "walk_dog", name: "Walk the dog twice", detail: "", points: 3, section: "body" },
  { id: "morning_prayer", name: "Morning prayer", detail: "", points: 5, section: "spirit" },
  { id: "emmet_fox", name: "Emmet Fox reading", detail: "", points: 4, section: "spirit" },
  { id: "afternoon_meditation", name: "Afternoon meditation", detail: "", points: 6, section: "spirit" },
  { id: "spiritual_literature", name: "Spiritual literature (conscious contact with God)", detail: "", points: 7, section: "spirit" },
  { id: "spiritual_effort", name: "Meaningful effort to grow spiritual connection", detail: "", points: 8, section: "spirit" },
  { id: "aa_meeting", name: "AA meeting", detail: "", points: 10, section: "recovery" },
  { id: "call_sponsor", name: "Call sponsor", detail: "", points: 5, section: "recovery" },
  { id: "recovery_call", name: "Recovery call (other than sponsor)", detail: "", points: 5, section: "recovery" },
  { id: "nightly_inventory", name: "Nightly inventory", detail: "Step 10", points: 10, section: "recovery" },
  { id: "no_nicotine", name: "No nicotine", detail: "No ZYN or other nicotine", points: 5, section: "clean" },
  { id: "no_supplements", name: "No supplements or mood-altering supplements/drugs", detail: "None all day", points: 10, section: "clean" },
  { id: "no_junk", name: "No candy / junk food", detail: "", points: 8, section: "clean" },
  { id: "time_with_son", name: "Present time with son (no phone)", detail: "Phone down, present with Dawson", points: 8, section: "family" },
  { id: "play_with_dawson", name: "Play / read a book with Dawson", detail: "", points: 4, section: "family" },
  { id: "bed_early", name: "Bed before 10:20 PM", detail: "", points: 10, section: "sleep" },
  { id: "awake_6am", name: "Awake by 6 AM", detail: "", points: 10, section: "sleep" }
];

const LEGACY_DEFAULT_IDS = ["workout", "sauna", "spiritual", "recovery", "clean"];

const $ = (sel, root = document) => root.querySelector(sel);

let data;
let viewKey;
let lastToday;
let settingsOpen = false;
let shareOpen = false;
let shareBlob = null;
let iconImage = null;

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftKey(key, days) {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

function formatLong(key) {
  return parseKey(key).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function newId() {
  return "item_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function sectionIds() {
  return SECTIONS.map((s) => s.id);
}

function validSection(id) {
  return sectionIds().includes(id) ? id : "body";
}

function clampThreshold(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.8;
  return Math.min(1, Math.max(0.5, Math.round(n * 100) / 100));
}

function getThreshold() {
  return clampThreshold(data && data.settings && data.settings.streakThreshold);
}

function defaultData() {
  return {
    version: SCHEMA_VERSION,
    settings: { streakThreshold: 0.8 },
    items: DEFAULT_ITEMS.map((item) => ({ ...item })),
    collapsed: {},
    days: {}
  };
}

function isLegacyDefaults(items) {
  if (!Array.isArray(items) || items.length !== LEGACY_DEFAULT_IDS.length) return false;
  return items.every((item, i) => item && item.id === LEGACY_DEFAULT_IDS[i]);
}

function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;
  const name = String(item.name || "").trim();
  if (!name) return null;
  const points = Math.max(0, Math.round(Number(item.points) || 0));
  return {
    id: String(item.id || newId()),
    name,
    detail: String(item.detail || ""),
    points,
    section: validSection(item.section)
  };
}

function cleanDays(rawDays) {
  const out = {};
  if (!rawDays || typeof rawDays !== "object") return out;
  for (const [k, v] of Object.entries(rawDays)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== "object") continue;
    out[k] = {
      checks: v.checks && typeof v.checks === "object" ? { ...v.checks } : {}
    };
  }
  return out;
}

function migrate(parsed) {
  const base = defaultData();
  if (!parsed || typeof parsed !== "object") return base;

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const useDefaults = !rawItems.length || isLegacyDefaults(rawItems) || Number(parsed.version || 1) < 2 && isLegacyDefaults(rawItems);
  const items = useDefaults
    ? base.items
    : rawItems.map(normalizeItem).filter(Boolean);

  const settings = { streakThreshold: 0.8 };
  if (parsed.settings && parsed.settings.streakThreshold != null) {
    settings.streakThreshold = clampThreshold(parsed.settings.streakThreshold);
  } else if (parsed.streakThreshold != null) {
    settings.streakThreshold = clampThreshold(parsed.streakThreshold);
  }

  const collapsed = parsed.collapsed && typeof parsed.collapsed === "object" ? { ...parsed.collapsed } : {};

  return {
    version: SCHEMA_VERSION,
    settings,
    items: items.length ? items : base.items,
    collapsed,
    days: cleanDays(parsed.days)
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultData();
    return migrate(JSON.parse(raw));
  } catch {
    return defaultData();
  }
}

function save() {
  data.version = SCHEMA_VERSION;
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

function ensureDay(key) {
  if (!data.days[key]) data.days[key] = { checks: {} };
  if (!data.days[key].checks) data.days[key].checks = {};
  return data.days[key];
}

function scoreFor(key) {
  const day = data.days[key] || { checks: {} };
  let earned = 0;
  let max = 0;
  for (const item of data.items) {
    const pts = Number(item.points) || 0;
    max += pts;
    if (day.checks[item.id]) earned += pts;
  }
  return { earned, max, pct: max > 0 ? earned / max : 0 };
}

function sectionScore(key, sectionId) {
  const day = data.days[key] || { checks: {} };
  let earned = 0;
  let max = 0;
  for (const item of data.items) {
    if (item.section !== sectionId) continue;
    const pts = Number(item.points) || 0;
    max += pts;
    if (day.checks[item.id]) earned += pts;
  }
  return { earned, max };
}

function pruneDay(key) {
  const day = data.days[key];
  if (!day) return;
  const any = Object.values(day.checks || {}).some(Boolean);
  if (!any) delete data.days[key];
}

function meetsThreshold(key) {
  const { earned, max } = scoreFor(key);
  return max > 0 && earned / max >= getThreshold() - 1e-12;
}

function hasEntry(key) {
  const day = data.days[key];
  if (!day) return false;
  return Object.values(day.checks || {}).some(Boolean);
}

function currentStreak() {
  let cursor = dateKey();
  if (!meetsThreshold(cursor)) cursor = shiftKey(cursor, -1);
  let count = 0;
  while (meetsThreshold(cursor)) {
    count += 1;
    cursor = shiftKey(cursor, -1);
  }
  return count;
}

function bestStreak() {
  const keys = Object.keys(data.days).sort();
  if (!keys.length) return currentStreak();
  const start = parseKey(keys[0]);
  const end = parseKey(dateKey());
  let best = 0;
  let run = 0;
  for (let d = new Date(start.getTime()); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
    const k = dateKey(d);
    if (k === dateKey() && !meetsThreshold(k)) break;
    if (meetsThreshold(k)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return Math.max(best, currentStreak());
}

function scoreLabel(earned, max) {
  if (max <= 0) return "Ready";
  const pct = earned / max;
  if (pct < 0.2) return "Cold";
  if (pct < 0.4) return "Spark";
  if (pct < 0.6) return "Kindling";
  if (pct < 0.8) return "Heating";
  if (pct < 0.9) return "Glowing";
  return "Forged";
}

function percentText(earned, max) {
  if (max <= 0) return "0%";
  return `${Math.round((earned / max) * 100)}%`;
}

function shareTextFor(key) {
  const { earned, max } = scoreFor(key);
  const label = scoreLabel(earned, max);
  const streak = currentStreak();
  const base = `Daily Forge — ${earned}/${max} · ${label}`;
  if (streak > 0) return `${base} · 🔥${streak}-day streak`;
  return base;
}

function maybeRollover() {
  const today = dateKey();
  if (today === lastToday) return;
  const wasViewingToday = viewKey === lastToday;
  lastToday = today;
  if (wasViewingToday || !viewKey) viewKey = today;
  render();
}

function toggleItem(id) {
  const day = ensureDay(viewKey);
  day.checks[id] = !day.checks[id];
  pruneDay(viewKey);
  save();
  render();
}

function toggleSection(id) {
  data.collapsed[id] = !data.collapsed[id];
  save();
  render();
}

function onScroll() {
  const sticky = $("#sticky");
  if (!sticky) return;
  sticky.classList.toggle("compact", window.scrollY > 36);
}

function render(opts = {}) {
  const today = dateKey();
  const viewingToday = viewKey === today;
  const { earned, max, pct } = scoreFor(viewKey);
  const label = scoreLabel(earned, max);

  $("#dateTitle").textContent = viewingToday ? formatLong(today) : formatLong(viewKey);
  $("#compactDate").textContent = viewingToday ? formatLong(today) : formatLong(viewKey);
  $("#backToday").classList.toggle("hidden", viewingToday);

  $("#frac").innerHTML = `${earned}<span> / ${max}</span>`;
  const ring = $("#ring");
  const fill = $("#ringFill");
  const C = 2 * Math.PI * 58;
  fill.style.strokeDasharray = `${C}`;
  fill.style.strokeDashoffset = String(C * (1 - pct));
  ring.classList.toggle("complete", pct >= 0.9 && max > 0);

  const lab = $("#scoreLabel");
  lab.textContent = label;
  lab.classList.toggle("forged", label === "Forged");
  lab.classList.toggle("cold", label === "Cold");
  $("#scorePct").textContent = percentText(earned, max);

  $("#streakNow").textContent = String(currentStreak());
  $("#streakBest").textContent = String(bestStreak());

  renderStrip(today);
  renderList();
  if (settingsOpen && !opts.skipSettings) renderSettings();
}

function renderStrip(today) {
  const root = $("#strip");
  root.innerHTML = "";
  for (let i = 6; i >= 0; i -= 1) {
    const key = shiftKey(today, -i);
    const d = parseKey(key);
    const { earned, max } = scoreFor(key);
    const qualifies = meetsThreshold(key);
    const entry = hasEntry(key);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.key = key;
    if (key === today) btn.classList.add("today");
    if (key === viewKey) btn.classList.add("selected");
    if (qualifies) btn.classList.add("qualifies");
    else if (entry) btn.classList.add("partial");
    else btn.classList.add("empty");
    const pip = !entry && key !== today ? "—" : percentText(earned, max);
    btn.innerHTML = `
      <span class="dow">${d.toLocaleDateString(undefined, { weekday: "short" })}</span>
      <span class="dom">${d.getDate()}</span>
      <span class="pip">${pip}</span>
    `;
    btn.setAttribute("aria-label", `${formatLong(key)}, ${pip}`);
    btn.addEventListener("click", () => {
      viewKey = key;
      render();
    });
    root.appendChild(btn);
  }
}

function renderList() {
  const root = $("#list");
  root.innerHTML = "";
  const day = data.days[viewKey] || { checks: {} };
  for (const section of SECTIONS) {
    const items = data.items.filter((item) => item.section === section.id);
    if (!items.length) continue;
    const { earned, max } = sectionScore(viewKey, section.id);
    const wrap = document.createElement("section");
    wrap.className = "section" + (data.collapsed[section.id] ? " collapsed" : "");
    wrap.dataset.section = section.id;

    const head = document.createElement("button");
    head.type = "button";
    head.className = "section-head";
    head.setAttribute("aria-expanded", data.collapsed[section.id] ? "false" : "true");
    head.innerHTML = `
      <span class="left"><span class="chev"></span><h3>${escapeHtml(section.name)}</h3></span>
      <span class="sec-score">${earned}/${max}</span>
    `;
    head.addEventListener("click", () => toggleSection(section.id));
    wrap.appendChild(head);

    const box = document.createElement("div");
    box.className = "section-items";
    for (const item of items) {
      box.appendChild(itemCard(item, Boolean(day.checks[item.id])));
    }
    wrap.appendChild(box);
    root.appendChild(wrap);
  }

  const unknown = data.items.filter((item) => !sectionIds().includes(item.section));
  if (unknown.length) {
    const wrap = document.createElement("section");
    wrap.className = "section";
    wrap.innerHTML = `<button type="button" class="section-head"><span class="left"><span class="chev"></span><h3>Other</h3></span></button>`;
    const box = document.createElement("div");
    box.className = "section-items";
    for (const item of unknown) box.appendChild(itemCard(item, Boolean(day.checks[item.id])));
    wrap.appendChild(box);
    root.appendChild(wrap);
  }
}

function itemCard(item, on) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "card" + (on ? " on" : "");
  btn.dataset.id = item.id;
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  const detail = item.detail ? `<div class="detail">${escapeHtml(item.detail)}</div>` : "";
  const pts = Number(item.points) || 0;
  btn.innerHTML = `
    <span class="check" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12.5l5 5 9-10"/>
      </svg>
    </span>
    <span class="copy">
      <div class="name">${escapeHtml(item.name)}</div>
      ${detail}
    </span>
    <span class="pts">${pts} pt${pts === 1 ? "" : "s"}</span>
  `;
  btn.addEventListener("click", () => toggleItem(item.id));
  return btn;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openPanel(overlayId, sheetId, on) {
  const overlay = $(overlayId);
  const sheet = $(sheetId);
  if (on) {
    overlay.hidden = false;
    overlay.classList.add("open");
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
  } else {
    overlay.classList.remove("open");
    overlay.hidden = true;
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
  }
}

function openSettings() {
  settingsOpen = true;
  openPanel("#overlay", "#sheet", true);
  renderSettings();
}

function closeSettings() {
  settingsOpen = false;
  openPanel("#overlay", "#sheet", false);
}

function renderSettings() {
  const range = $("#thresholdRange");
  const val = $("#thresholdValue");
  const pct = Math.round(getThreshold() * 100);
  range.value = String(pct);
  val.textContent = `${pct}%`;

  const root = $("#itemEditors");
  root.innerHTML = "";
  data.items.forEach((item, index) => {
    const wrap = document.createElement("div");
    wrap.className = "setting-item";
    const opts = SECTIONS.map((s) =>
      `<option value="${s.id}" ${item.section === s.id ? "selected" : ""}>${s.name}</option>`
    ).join("");
    wrap.innerHTML = `
      <label>Name
        <input type="text" data-field="name" data-index="${index}" value="${escapeHtml(item.name)}" maxlength="80">
      </label>
      <label>Detail
        <input type="text" data-field="detail" data-index="${index}" value="${escapeHtml(item.detail)}" maxlength="140">
      </label>
      <label>Section
        <select data-field="section" data-index="${index}">${opts}</select>
      </label>
      <div class="row-2">
        <label>Points
          <input type="number" data-field="points" data-index="${index}" min="0" max="50" step="1" value="${Number(item.points) || 0}">
        </label>
        <button type="button" class="btn danger" data-remove="${index}" ${data.items.length <= 1 ? "disabled" : ""}>Remove</button>
      </div>
    `;
    root.appendChild(wrap);
  });
}

function onSettingInput(e) {
  const fieldEl = e.target.closest("input, select");
  if (!fieldEl || fieldEl.dataset.index == null) return;
  const index = Number(fieldEl.dataset.index);
  const item = data.items[index];
  if (!item) return;
  const field = fieldEl.dataset.field;
  if (field === "name") item.name = fieldEl.value;
  if (field === "detail") item.detail = fieldEl.value;
  if (field === "section") item.section = validSection(fieldEl.value);
  if (field === "points") item.points = Math.max(0, Math.round(Number(fieldEl.value) || 0));
  save();
  render({ skipSettings: field !== "section" });
}

function addItem() {
  data.items.push({ id: newId(), name: "New item", detail: "", points: 1, section: "body" });
  save();
  render();
}

function removeItem(index) {
  if (data.items.length <= 1) return;
  data.items.splice(index, 1);
  pruneDay(viewKey);
  save();
  render();
}

function setThresholdFromUi() {
  const pct = Number($("#thresholdRange").value);
  data.settings.streakThreshold = clampThreshold(pct / 100);
  $("#thresholdValue").textContent = `${Math.round(data.settings.streakThreshold * 100)}%`;
  save();
  render({ skipSettings: true });
}

function exportJson() {
  const payload = {
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: data.settings,
    items: data.items,
    collapsed: data.collapsed,
    days: data.days
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `daily-forge-backup-${dateKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Backup downloaded");
}

function importJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = migrate(JSON.parse(String(reader.result || "")));
      if (!parsed.items.length) {
        toast("That file is not a valid Daily Forge backup");
        return;
      }
      if (!confirm("Replace your current checklist and history with this backup?")) return;
      data = parsed;
      save();
      viewKey = dateKey();
      render();
      toast("Backup restored");
    } catch {
      toast("Could not read that backup");
    }
  };
  reader.readAsText(file);
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

function loadIcon() {
  if (iconImage) return Promise.resolve(iconImage);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      iconImage = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = new URL("icon-512.png", document.baseURI).href;
  });
}

function shareText() {
  return shareTextFor(viewKey);
}

async function renderShareCard(includeChecklist) {
  await loadIcon();
  const { earned, max, pct } = scoreFor(viewKey);
  const label = scoreLabel(earned, max);
  const streak = currentStreak();
  const best = bestStreak();
  const date = formatLong(viewKey);

  const W = 1080;
  const list = includeChecklist ? buildChecklistLayout() : [];
  const listHeight = includeChecklist ? 80 + list.totalHeight : 0;
  const H = includeChecklist ? Math.max(1680, 980 + listHeight) : 1350;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0c0b0a";
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 280, 40, W / 2, 260, 820);
  glow.addColorStop(0, "rgba(200, 70, 12, 0.55)");
  glow.addColorStop(0.35, "rgba(90, 28, 6, 0.28)");
  glow.addColorStop(1, "rgba(12, 11, 10, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255, 210, 122, 0.38)";
  ctx.lineWidth = 5;
  roundRectPath(ctx, 40, 40, W - 80, H - 80, 48);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 122, 26, 0.12)";
  ctx.lineWidth = 2;
  roundRectPath(ctx, 52, 52, W - 104, H - 104, 40);
  ctx.stroke();

  if (iconImage) {
    const s = 96;
    ctx.save();
    roundedClip(ctx, W / 2 - s / 2, 96, s, s, 22);
    ctx.drawImage(iconImage, W / 2 - s / 2, 96, s, s);
    ctx.restore();
  }

  ctx.fillStyle = "#ffd27a";
  ctx.font = "800 34px system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "14px";
  ctx.fillText("DAILY FORGE", W / 2, 246);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "#f3e6d4";
  ctx.font = "600 36px system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  ctx.fillText(date, W / 2, 306);

  const cx = W / 2;
  const cy = 560;
  const radius = 210;
  ctx.lineWidth = 32;
  ctx.strokeStyle = "#2a221b";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (pct > 0) {
    const grad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    grad.addColorStop(0, "#ffd27a");
    grad.addColorStop(0.5, "#ffb049");
    grad.addColorStop(1, "#ff7a1a");
    ctx.strokeStyle = grad;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, pct));
    ctx.stroke();
  }

  ctx.fillStyle = "#f3e6d4";
  ctx.font = "800 92px system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  ctx.fillText(String(earned), cx, cy + 4);
  ctx.fillStyle = "#9a8b78";
  ctx.font = "700 36px system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  ctx.fillText(`/ ${max}`, cx, cy + 54);

  ctx.fillStyle = label === "Forged" ? "#ffd27a" : label === "Cold" ? "#6d6358" : "#ffb049";
  ctx.font = "800 42px system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.letterSpacing = "10px";
  const labelText = label.toUpperCase();
  const labelW = ctx.measureText(labelText).width;
  ctx.letterSpacing = "0px";
  ctx.font = "800 36px system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  const pctStr = percentText(earned, max);
  const pctW = ctx.measureText(pctStr).width;
  const gap = 40;
  const startX = cx - (labelW + gap + pctW) / 2;
  ctx.font = "800 42px system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  ctx.letterSpacing = "10px";
  ctx.fillText(labelText, startX, 860);
  ctx.letterSpacing = "0px";
  ctx.font = "800 36px system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  ctx.fillStyle = "#9a8b78";
  ctx.fillText(pctStr, startX + labelW + gap, 858);
  ctx.textAlign = "center";

  ctx.fillStyle = "#f3e6d4";
  ctx.font = "700 36px system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  const streakLine = streak > 0
    ? `🔥  ${streak}-day streak     Best ${best}`
    : `Streak 0     Best ${best}`;
  ctx.fillText(streakLine, cx, 930);

  if (includeChecklist) {
    drawChecklist(ctx, list, 100, 1000, W - 200);
  } else {
    ctx.fillStyle = "#6d6358";
    ctx.font = "600 24px system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
    ctx.fillText("Keep showing up.", cx, H - 90);
  }

  return canvas;
}

function buildChecklistLayout() {
  const rows = [];
  let totalHeight = 0;
  const day = data.days[viewKey] || { checks: {} };
  for (const section of SECTIONS) {
    const items = data.items.filter((item) => item.section === section.id);
    if (!items.length) continue;
    rows.push({ type: "h", text: section.name.toUpperCase(), h: 48 });
    totalHeight += 48;
    for (const item of items) {
      rows.push({ type: "i", text: item.name, on: Boolean(day.checks[item.id]), pts: item.points, h: 44 });
      totalHeight += 44;
    }
    totalHeight += 10;
  }
  return Object.assign(rows, { totalHeight });
}

function drawChecklist(ctx, rows, x, y, width) {
  ctx.textAlign = "left";
  let yy = y;
  for (const row of rows) {
    if (row.type === "h") {
      ctx.fillStyle = "#ffd27a";
      ctx.font = "800 22px system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
      ctx.letterSpacing = "6px";
      ctx.fillText(row.text, x, yy + 30);
      ctx.letterSpacing = "0px";
    } else {
      const boxY = yy + 10;
      ctx.strokeStyle = row.on ? "#ff7a1a" : "#5a4a3a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + 14, boxY + 12, 12, 0, Math.PI * 2);
      if (row.on) {
        ctx.fillStyle = "#ff7a1a";
        ctx.fill();
        ctx.strokeStyle = "#ffb049";
        ctx.stroke();
        ctx.strokeStyle = "#2a1206";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 7, boxY + 13);
        ctx.lineTo(x + 13, boxY + 19);
        ctx.lineTo(x + 22, boxY + 6);
        ctx.stroke();
      } else {
        ctx.stroke();
      }
      ctx.fillStyle = row.on ? "#f3e6d4" : "#9a8b78";
      ctx.font = "600 26px system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
      ctx.fillText(row.text, x + 40, yy + 30);
      ctx.fillStyle = "#6d6358";
      ctx.font = "700 20px system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(String(row.pts), x + width, yy + 30);
      ctx.textAlign = "left";
    }
    yy += row.h;
  }
  ctx.textAlign = "center";
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function roundedClip(ctx, x, y, w, h, r) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
}

async function refreshSharePreview() {
  const include = $("#includeChecklist").checked;
  const canvas = await renderShareCard(include);
  shareBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const url = URL.createObjectURL(shareBlob);
  const img = $("#sharePreview");
  const prev = img.getAttribute("data-url");
  if (prev) URL.revokeObjectURL(prev);
  img.src = url;
  img.setAttribute("data-url", url);
  $("#shareTextPreview").textContent = shareText();
  return canvas;
}

async function openShare() {
  shareOpen = true;
  $("#includeChecklist").checked = false;
  openPanel("#shareOverlay", "#shareSheet", true);
  try {
    await refreshSharePreview();
  } catch (err) {
    toast("Could not build the score card");
  }
}

function closeShare() {
  shareOpen = false;
  openPanel("#shareOverlay", "#shareSheet", false);
}

function filenameForShare() {
  return `daily-forge-${viewKey}.png`;
}

async function shareNow() {
  if (!shareBlob) await refreshSharePreview();
  const text = shareText();
  const file = new File([shareBlob], filenameForShare(), { type: "image/png" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text, title: "Daily Forge" });
      toast("Shared");
      return;
    }
    if (navigator.share) {
      await navigator.share({ text, title: "Daily Forge" });
      downloadBlob(shareBlob, filenameForShare());
      toast("Shared text — image downloaded");
      return;
    }
  } catch (err) {
    if (err && err.name === "AbortError") return;
  }
  downloadBlob(shareBlob, filenameForShare());
  const copied = await copyText(text);
  toast(copied ? "Image downloaded, text copied" : "Image downloaded");
}

function downloadShare() {
  if (!shareBlob) return;
  downloadBlob(shareBlob, filenameForShare());
  toast("Image downloaded");
}

async function copyShareText() {
  const ok = await copyText(shareText());
  toast(ok ? "Text copied" : "Could not copy text");
}

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* fall through */ }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

function init() {
  data = load();
  save();
  lastToday = dateKey();
  viewKey = lastToday;
  render();
  loadIcon();

  $("#settingsBtn").addEventListener("click", openSettings);
  $("#closeSettings").addEventListener("click", closeSettings);
  $("#overlay").addEventListener("click", closeSettings);
  $("#shareBtn").addEventListener("click", openShare);
  $("#closeShare").addEventListener("click", closeShare);
  $("#shareOverlay").addEventListener("click", closeShare);
  $("#includeChecklist").addEventListener("change", () => {
    refreshSharePreview();
  });
  $("#shareConfirm").addEventListener("click", shareNow);
  $("#shareDownload").addEventListener("click", downloadShare);
  $("#shareCopy").addEventListener("click", copyShareText);
  $("#backToday").addEventListener("click", () => {
    viewKey = dateKey();
    render();
  });
  $("#addItem").addEventListener("click", addItem);
  $("#itemEditors").addEventListener("change", onSettingInput);
  $("#itemEditors").addEventListener("input", onSettingInput);
  $("#itemEditors").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    removeItem(Number(btn.dataset.remove));
  });
  $("#thresholdRange").addEventListener("input", setThresholdFromUi);
  $("#exportBtn").addEventListener("click", exportJson);
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    importJson(file);
    e.target.value = "";
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", maybeRollover);
  setInterval(maybeRollover, 15000);
  window.addEventListener("focus", maybeRollover);

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);

window.DailyForge = {
  scoreFor,
  scoreLabel,
  shareText,
  renderShareCard,
  meetsThreshold,
  getThreshold,
  migrate,
  currentStreak,
  bestStreak
};
