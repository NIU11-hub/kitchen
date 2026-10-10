// Claude 给的提醒：Claude 写进 app/reminders.json 推上来，首页出现一行，点开一键交给 iPhone 的快捷指令「素日提醒」加进提醒事项。
// reminders.json 的格式：{ "items": [ { "id": "r1", "t": "交签证材料", "at": "2026-10-14 09:00" } ] }
import { docs, saveDoc } from "./db.js";

const SHORTCUT = "素日提醒";
const WEEK = "日一二三四五六";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
let items = [], sheet = null, onChange = () => {};

const added = () => docs.remind.added ||= {};
const when = s => { const d = new Date(s.replace(" ", "T")); return isNaN(d) ? null : d; };
const label = d => `${d.getMonth()+1}.${d.getDate()} 周${WEEK[d.getDay()]} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;

export function pending(){
  const now = Date.now();
  return items.filter(x => !added()[x.id] && (!when(x.at) || when(x.at).getTime() > now - 3600e3));
}

export async function loadReminders(cb){
  if (cb) onChange = cb;
  try {
    const r = await fetch(new URL("reminders.json", import.meta.url), { cache:"no-cache" });
    if (!r.ok) return;
    const j = await r.json();
    items = (j.items || []).filter(x => x.id && x.t);
    onChange();
  } catch(e) {}
}

// 首页那一行（只数还没加的）
export function remindLine(){
  const n = pending().length;
  return n ? `<button class="rline" data-remind="open"><i></i><span class="one">Claude 给你 ${n} 条提醒</span><em aria-hidden="true">›</em></button>` : "";
}

function line(x){
  const d = when(x.at);
  return `${x.t}|${d ? `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}` : ""}`;
}
function send(list){
  if (!list.length) return;
  const text = line(list[0]);
  added()[list[0].id] = Date.now();
  saveDoc("remind");
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT)}&input=text&text=${encodeURIComponent(text)}`;
  drawSheet(); onChange();
}

function ensureSheet(){
  if (sheet) return;
  sheet = document.createElement("div");
  sheet.className = "sheet"; sheet.hidden = true;
  document.querySelector(".app").appendChild(sheet);
  sheet.addEventListener("click", ev => {
    if (ev.target === sheet) return close();
    const b = ev.target.closest("[data-r]"); if (!b) return;
    const a = b.dataset.r;
    if (a === "x") return close();
    if (a === "one") return send(items.filter(x => x.id === b.dataset.id));
  });
}
function close(){ if (sheet) sheet.hidden = true; }
function drawSheet(){
  const list = pending(), now = Date.now();
  const recent = items.filter(x => added()[x.id] && now - added()[x.id] < 864e5);
  const row = (x, again) => { const d = when(x.at); return `<div class="ritem${again ? " did" : ""}"><span class="rt one">${esc(x.t)}</span><span class="rw">${d ? label(d) : ""}</span><button data-r="one" data-id="${esc(x.id)}">${again ? "再加一次" : "加"}</button></div>`; };
  sheet.innerHTML = `<div class="panel" role="dialog" aria-label="Claude 给的提醒">
    <div class="ph"><span>Claude 给的提醒</span><button data-r="x">收起</button></div>
    ${list.map(x => row(x, false)).join("")}
    ${recent.length ? `<div class="rsub">刚加过的，没加上可以再点一次</div>` + recent.map(x => row(x, true)).join("") : ""}
    ${!list.length && !recent.length ? `<p class="hint">没有新的提醒。</p>` : ""}
    <p class="ftip">点了会跳到「快捷指令」，加好以后切回素日就行</p>
  </div>`;
}
export function openReminders(){ ensureSheet(); sheet.hidden = false; drawSheet(); }
