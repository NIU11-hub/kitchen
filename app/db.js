// 数据：先存手机里，再同步到和厨房账本同一个 Supabase（docs 表，id 是 body / train）
import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";

const IDS = ["body", "train"];
const DEFAULTS = { body: { weights:{} }, train: { log:{} } };
const key = id => "suri:" + id;
const load = id => { try { return JSON.parse(localStorage.getItem(key(id))); } catch(e) { return null; } };
const keep = id => { try { localStorage.setItem(key(id), JSON.stringify(docs[id])); } catch(e) {} };

export const docs = {};
for (const id of IDS) docs[id] = Object.assign(structuredClone(DEFAULTS[id]), load(id) || {});

let sb = null, onError = () => {}, onLoad = () => {};
const dirty = {}, timers = {};
export function setHandlers(h){ onError = h.error || onError; onLoad = h.load || onLoad; }

export async function initDB(){
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth:{ persistSession:false } });
    const { data, error } = await sb.from("docs").select("id,data").in("id", IDS);
    if (error) throw error;
    for (const row of data){
      if (dirty[row.id]) continue;          // 手机上刚改过的，以手机为准，下面会推上去
      docs[row.id] = Object.assign(structuredClone(DEFAULTS[row.id]), row.data || {});
      keep(row.id);
    }
    for (const id of IDS) if (dirty[id]) push(id);
    onLoad();
  } catch(e) { console.error(e); }
}

async function push(id){
  if (!sb) return;
  const { error } = await sb.from("docs").upsert({ id, data:docs[id], updated_at:new Date().toISOString() });
  if (error) onError(); else dirty[id] = false;
}

export function saveDoc(id, delay = 0){
  dirty[id] = true; keep(id);
  clearTimeout(timers[id]);
  timers[id] = setTimeout(() => push(id), delay);
}

// 切到后台前把没推上去的推一下
document.addEventListener("visibilitychange", () => {
  if (document.hidden) for (const id of IDS) if (dirty[id]) { clearTimeout(timers[id]); push(id); }
});
