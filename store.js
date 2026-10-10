// 数据层：有 Supabase 就存云端并实时同步，没有就存在浏览器里
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const DOC_IDS = ["ledger", "menu", "shop"];
const LS = "kitchen:v1";
const ME = Math.random().toString(36).slice(2, 10);

export const store = {
  mode: "local",          // "cloud" | "local"
  status: "连接中…",
  docs: {},               // ledger / menu / shop
  recipes: [],
  byId: {},
  _sb: null,
  _listeners: [],
  _timers: {},
  _written: {},
  _recipeSeed: [],
};

function emit(what) { for (const f of store._listeners) try { f(what); } catch (e) { console.error(e); } }
export function onChange(fn) { store._listeners.push(fn); }
function setStatus(s, cls = "") { store.status = s; store.statusCls = cls; emit("status"); }

function indexRecipes() {
  store.recipes = store.recipes.filter(r => !r.hidden).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(b.name, "zh"));
  store.byId = Object.fromEntries(store.recipes.map(r => [r.id, r]));
}
const clone = o => JSON.parse(JSON.stringify(o));

async function fetchJSON(p) { const r = await fetch(p, { cache: "no-cache" }); if (!r.ok) throw new Error(p + " " + r.status); return r.json(); }

export async function initStore() {
  const [seedRecipes, seedDocs] = await Promise.all([fetchJSON(new URL("seed-recipes.json", import.meta.url)), fetchJSON(new URL("seed-docs.json", import.meta.url))]);
  store._recipeSeed = seedRecipes;
  if (SUPABASE_URL && SUPABASE_KEY) {
    try { await initCloud(seedRecipes, seedDocs); return; }
    catch (e) { console.error(e); setStatus("云端连不上，先存在这台设备", "bad"); }
  }
  initLocal(seedRecipes, seedDocs);
}

/* ---------- 本地模式 ---------- */
function initLocal(seedRecipes, seedDocs) {
  store.mode = "local";
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) {}
  store.docs = {};
  for (const id of DOC_IDS) store.docs[id] = saved?.docs?.[id] ?? clone(seedDocs[id] || {});
  const edits = saved?.recipes || {};
  const all = new Map(seedRecipes.map(r => [r.id, r]));
  for (const [id, r] of Object.entries(edits)) all.set(id, r);
  store.recipes = [...all.values()];
  indexRecipes();
  if (store.status === "连接中…") setStatus("只存在这台设备", "bad");
}
function saveLocal() {
  try {
    const seedIds = new Map(store._recipeSeed.map(r => [r.id, JSON.stringify(r)]));
    const recipes = {};
    for (const r of store._allRecipes || store.recipes) if (seedIds.get(r.id) !== JSON.stringify(r)) recipes[r.id] = r;
    localStorage.setItem(LS, JSON.stringify({ docs: store.docs, recipes }));
  } catch (e) {}
}

/* ---------- 云端模式 ---------- */
async function initCloud(seedRecipes, seedDocs) {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  store._sb = sb;
  store.mode = "cloud";

  const [d, r] = await Promise.all([sb.from("docs").select("id,data"), sb.from("recipes").select("id,data")]);
  if (d.error) throw d.error;
  if (r.error) throw r.error;

  const have = Object.fromEntries(d.data.map(x => [x.id, x.data]));
  const missing = [];
  for (const id of DOC_IDS) {
    if (have[id]) store.docs[id] = have[id];
    else { store.docs[id] = clone(seedDocs[id] || {}); missing.push({ id, data: store.docs[id] }); }
  }
  if (missing.length) await sb.from("docs").upsert(missing);

  // 食谱：云端没有的、或者我更新过版本号的，从种子文件补进去
  const cloud = new Map(r.data.map(x => [x.id, { ...x.data, id: x.id }]));
  const up = [];
  for (const s of seedRecipes) {
    const c = cloud.get(s.id);
    // 子俊在网站里「拿掉」过的菜，更新版本时也保持拿掉
    if (!c || (s.v || 0) > (c.v || 0)) { const x = c?.hidden ? { ...s, hidden: true } : s; cloud.set(s.id, x); up.push({ id: s.id, data: x }); }
  }
  for (let i = 0; i < up.length; i += 50) await sb.from("recipes").upsert(up.slice(i, i + 50));
  store.recipes = [...cloud.values()];
  indexRecipes();

  sb.channel("kitchen")
    .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, p => {
      const row = p.new; if (!row?.id || !row.data) return;
      if (row.data._w && row.data._w === store._written[row.id]) return;
      store.docs[row.id] = row.data; emit(row.id);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "recipes" }, p => {
      const row = p.new; if (!row?.id || !row.data) return;
      const i = store.recipes.findIndex(x => x.id === row.id);
      const rec = { ...row.data, id: row.id };
      if (i >= 0) store.recipes[i] = rec; else store.recipes.push(rec);
      indexRecipes(); emit("recipes");
    })
    .subscribe(s => { if (s === "SUBSCRIBED") setStatus("已同步", "ok"); });

  // 切回页面时再拉一次，防止实时连接断过
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pull(); });
  setStatus("已同步", "ok");
  dailyBackup();
}

async function pull() {
  if (store.mode !== "cloud") return;
  const d = await store._sb.from("docs").select("id,data");
  if (d.error) return;
  let changed = false;
  for (const x of d.data) {
    if (!DOC_IDS.includes(x.id)) continue;
    if (JSON.stringify(x.data) !== JSON.stringify(store.docs[x.id])) { store.docs[x.id] = x.data; changed = true; }
  }
  if (changed) emit("all");
}

export function saveDoc(id) {
  if (store.mode === "local") { saveLocal(); return; }
  clearTimeout(store._timers[id]);
  setStatus("同步中…");
  store._timers[id] = setTimeout(async () => {
    const w = ME + ":" + Date.now();
    store.docs[id]._w = w; store._written[id] = w;
    const { error } = await store._sb.from("docs").upsert({ id, data: store.docs[id], updated_at: new Date().toISOString() });
    setStatus(error ? "没同步上，刷新一下再试" : "已同步", error ? "bad" : "ok");
  }, 500);
}

export async function saveRecipe(r) {
  r.v = r.v || 1;
  const i = store.recipes.findIndex(x => x.id === r.id);
  if (i >= 0) store.recipes[i] = r; else store.recipes.push(r);
  store._allRecipes = [...store.recipes];
  indexRecipes();
  if (store.mode === "local") { saveLocal(); return true; }
  const { error } = await store._sb.from("recipes").upsert({ id: r.id, data: r, updated_at: new Date().toISOString() });
  if (error) { setStatus("食谱没存上：" + error.message, "bad"); return false; }
  return true;
}
export async function hideRecipe(id) {
  const r = store.byId[id]; if (!r) return;
  const copy = { ...r, hidden: true };
  if (store.mode === "cloud") await store._sb.from("recipes").upsert({ id, data: copy, updated_at: new Date().toISOString() });
  store._allRecipes = store.recipes.map(x => x.id === id ? copy : x);
  store.recipes = store.recipes.filter(x => x.id !== id);
  indexRecipes();
  if (store.mode === "local") saveLocal();
}

/* ---------- 备份 ---------- */
function today() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
async function dailyBackup() {
  try {
    const day = today();
    const { data } = await store._sb.from("backups").select("id").eq("day", day).limit(1);
    if (data && data.length) return;
    await store._sb.from("backups").insert({ day, data: { docs: store.docs } });
  } catch (e) {}
}
export async function listBackups() {
  if (store.mode !== "cloud") return [];
  const { data } = await store._sb.from("backups").select("id,day,created_at").order("day", { ascending: false }).limit(60);
  return data || [];
}
export async function restoreBackup(id) {
  const { data, error } = await store._sb.from("backups").select("data").eq("id", id).single();
  if (error || !data?.data?.docs) return false;
  for (const k of DOC_IDS) if (data.data.docs[k]) { store.docs[k] = data.data.docs[k]; saveDoc(k); }
  emit("all");
  return true;
}
export function exportAll() { return JSON.stringify({ docs: store.docs, recipes: store.recipes }, null, 1); }
export function importDocs(obj) {
  if (!obj?.docs) return false;
  for (const k of DOC_IDS) if (obj.docs[k]) { store.docs[k] = obj.docs[k]; saveDoc(k); }
  emit("all");
  return true;
}
