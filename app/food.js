// 吃饭页：今天三餐、今晚要做、做饭模式、下一趟采购清单。数据直接用厨房账本的（同一个库）。
import { store, saveDoc } from "../store.js";
import { SLOTS, DAY, SPECIAL } from "../data.js";
import { week, thisWeek, entryN, dayN, offOf, dayKindOf, tonightTodo, entryFor } from "../menu.js";
import { buildShop, nextTrip, invLeft } from "../shop.js";
import { today, addDays, dow, money, mondayOf } from "../util.js";

const WEEK = "日一二三四五六", DAYS = ["周一","周二","周三","周四","周五","周六","周日"];
const CHECK = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5 5.6 10.4 11.5 3.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const r0 = Math.round, r1 = n => Math.round(n*10)/10;
const mmss = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
const fmtG = g => g >= 1000 ? `${r1(g/1000)} kg` : `${g < 10 ? r1(g) : Math.ceil(g/5)*5} g`;
function amt(i, k){
  if (i.cnt){ const c = Math.round(i.cnt*k*2)/2; return `${c} ${i.unit || "个"}`; }
  const g = (i.g || 0)*k; if (!g) return "少许";
  return (g < 10 ? r1(g) : r0(g)) + " g";
}

let root = null, seg = "today", onPage = false, popKey = null, dayOff = 0, swapEl = null, swapK = null;
const toastFn = m => { const t = document.getElementById("toast"); if (!t) return; t.querySelector(".t").textContent = m; t.querySelector("button").hidden = true; t.classList.add("on"); clearTimeout(toastFn._t); toastFn._t = setTimeout(() => t.classList.remove("on"), 2200); };
const ck = { r:null, n:1, i:0, left:0, end:0, raf:0, extra:"" };
let cookEl = null, wl = null;

const ready = () => store.recipes.length > 0 && store.docs.menu;

function draw(){
  if (!root) return;
  const t = today(), di = dow(t), now = new Date();
  let h = `<section class="page food">
    <div class="top"><i></i><span>${now.getMonth()+1}.${now.getDate()}　周${WEEK[now.getDay()]}</span><span class="r">${ready() ? (dayKindOf(thisWeek(), di) === "不排" ? "今天不排" : dayKindOf(thisWeek(), di) + "日") : ""}</span></div>
    <div class="seg" role="tablist">
      <button role="tab" data-act="seg" data-v="today" aria-selected="${seg === "today"}">三餐</button>
      <button role="tab" data-act="seg" data-v="shop" aria-selected="${seg === "shop"}">采购</button>
    </div>`;
  if (!ready()) h += `<p class="soon">正在拿菜单…</p>`;
  else h += seg === "today" ? todayHtml(addDays(t, dayOff)) : shopHtml();
  h += `</section>`;
  root.innerHTML = h;
  if (popKey){ const el = root.querySelector(`[data-key="${popKey}"] .tick`); if (el){ el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); } popKey = null; }
}

function todayHtml(t){
  const di = dow(t), key = mondayOf(t), w = week(key), word = dayOff ? "明天" : "今天";
  let h = `<div class="dayrow"><span class="tg"><button data-act="dayoff" data-v="0" aria-pressed="${!dayOff}">今天</button><button data-act="dayoff" data-v="1" aria-pressed="${!!dayOff}">明天</button></span><span class="hintr">点一顿可以换</span></div>`;
  if (!w) return h + `<p class="soon">${key === thisWeek() ? "这周" : "下周"}菜单还没排，在电脑上的厨房账本里排一下。</p>`;
  if (offOf(key, di)) return h + `<p class="soon">${word}不排，自己看着吃。</p>`;
  const d = w.days[di] || {};
  for (const s of SLOTS){
    if (s.opt && !d[s.k]) continue;
    const e = d[s.k], r = e && store.byId[e.r], n = entryN(e);
    const name = e?.custom ? e.custom.name : r ? r.name : "没排";
    const extra = [e?.rice ? `米饭 ${e.rice} g` : "", e?.bread ? `恰巴塔 ${e.bread} g` : ""].filter(Boolean).join("　");
    const sub = [n.kcal ? `${r0(n.kcal)} kcal　蛋白 ${r0(n.p)} g` : "", extra].filter(Boolean).join("　");
    h += `<button class="meal" data-act="meal" data-k="${s.k}">
      <span class="k">${s.name}</span><span class="m"><span class="one${name === "没排" ? " none" : ""}">${esc(name)}</span>${sub ? `<small class="one">${sub}</small>` : ""}</span><span class="go">›</span></button>`;
  }
  const { cook, prep, morning } = dayOff ? { cook:[], prep:[], morning:[] } : tonightTodo(t);
  const when = x => x === addDays(t, 1) ? "明天" : x === addDays(t, 2) ? "后天" : DAYS[dow(x)];
  const todo = [
    ...cook.map(x => ({ r:x.r, n:x.n, txt:`做好${when(x.eat)}起的午饭：${x.r.name}，${x.n} 份` })),
    ...prep.map(x => ({ r:x.r, n:1, txt:`${x.r.name}：${x.r.prep.t}` })),
    ...morning.map(x => ({ r:x.r, n:1, txt:`明早出门前　${x.r.name}：${x.r.prep.t}` }))
  ];
  if (todo.length){
    h += `<div class="lbl">今晚要做</div>` + todo.map(x => `<button class="prep" data-act="cook" data-id="${esc(x.r.id)}" data-n="${x.n || 1}"><i></i><span class="one">${esc(x.txt)}</span><span class="go">›</span></button>`).join("");
  }
  const dn = dayN(d);
  h += `<div class="sum">${word}合计　约 ${r0(dn.kcal)} / ${DAY.kcal} kcal　蛋白 ${r0(dn.p)} g</div>`;
  return h;
}

function shopHtml(){
  const nt = nextTrip(), key = nt.key, k = nt.trip.k;
  if (!week(key)) return `<p class="soon">${key === thisWeek() ? "这周" : "下周"}菜单还没排，排好才有清单。</p>`;
  const r = buildShop(key, k), sh = store.docs.shop, pre = `${key}:${k}:`;
  sh.bought ||= {}; sh.pantry ||= {};
  const date = addDays(key, nt.trip.day), t = today();
  const when = date === t ? "今天" : date === addDays(t, 1) ? "明天" : DAYS[dow(date)];
  const days = nt.trip.days.map(x => DAYS[x]).join("、");
  const rc = sh.receipts?.[`${key}:${k}`];
  const left = r.buy.filter(x => !sh.bought[pre + x.n]).length;
  let h = `<div class="shop-h"><span class="one">${when}去　买${days}吃的</span><span>${rc ? `已记账 ${money(rc.total)}` : `约 ${money(r.pay + r.stockPay)}`}</span></div>
    <div class="shop-s">${left ? `还剩 ${left} 样` : r.buy.length ? "都买齐了" : "这趟不用买新鲜的"}</div>`;
  const row = (x, stock) => {
    const kk = pre + x.n, has = stock && sh.pantry[x.n], on = !!sh.bought[kk] || has;
    const q = has ? "家里有" : x.cnt ? `${Math.ceil(x.cnt)} ${x.unit || "个"}` : fmtG(x.g);
    return `<div class="item${on ? " done" : ""}" data-key="${esc(kk)}"><button class="nm one" data-act="buy" data-k="${esc(kk)}">${esc(x.n)}</button><span class="q">${q}</span>${stock ? `<button class="hv" data-act="have" data-n="${esc(x.n)}">${has ? "要买" : "家里有"}</button>` : ""}<button class="tick" data-act="buy" data-k="${esc(kk)}" aria-label="买了${esc(x.n)}">${CHECK}</button></div>`;
  };
  for (const g of r.groups) h += `<div class="lbl">${esc(g.name)}</div>` + g.items.map(x => row(x, false)).join("");
  if (r.stock.length){
    const need = r.stockNeed.map(x => x.n);
    const list = r.stock.filter(x => need.includes(x.n) || sh.pantry[x.n]);
    if (list.length) h += `<div class="lbl">囤货和调料</div>` + list.map(x => row(x, true)).join("");
  }
  if (r.have.length) h += `<div class="lbl">家里有，这趟不用买</div>` + r.have.map(x => `<div class="item have"><span class="nm one">${esc(x.n)}</span><span class="q">${fmtG(x.g)}</span></div>`).join("");
  if (!rc) h += `<p class="hint">买完把小票拍给我，我来记账、记库存。</p>`;
  return h;
}

/* ---------- 做饭模式 ---------- */
function ensureCook(){
  if (cookEl) return;
  cookEl = document.createElement("div");
  cookEl.className = "cook"; cookEl.hidden = true;
  document.querySelector(".app").appendChild(cookEl);
  cookEl.addEventListener("click", onCookClick);
}
async function wake(on){
  try {
    if (on && !wl && navigator.wakeLock){ wl = await navigator.wakeLock.request("screen"); wl.addEventListener("release", () => { wl = null; }); }
    if (!on && wl){ wl.release(); wl = null; }
  } catch(e) {}
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && cookEl && !cookEl.hidden) wake(true); });

function openCook(id, n){
  const r = store.byId[id]; if (!r) return;
  ensureCook();
  Object.assign(ck, { r, n:+n || 1, i:0, left:r.steps[0]?.timer || 0, end:0 });
  cancelAnimationFrame(ck.raf);
  cookEl.hidden = false; drawCook(); wake(true);
}
function closeCook(){ cancelAnimationFrame(ck.raf); ck.end = 0; if (cookEl) cookEl.hidden = true; wake(false); }

function fill(r, text, k){
  return esc(text).replace(/\{(\d+)\}/g, (m, n) => { const i = r.ing[+n]; return i ? `<b>${esc(i.n)} ${amt(i, k)}</b>` : m; });
}
function drawCook(){
  const r = ck.r, k = ck.n / (r.base || 1), s = r.steps[ck.i], last = ck.i === r.steps.length - 1;
  const running = ck.end > 0;
  cookEl.innerHTML = `
    <button class="x" data-act="close">收起</button>
    <div class="cscroll">
      <div class="ttl">${esc(r.name)}</div>
      <div class="metarow"><span class="meta">${r.mins ? `${r.mins} 分钟` : ""}</span>
        <span class="serv"><button data-act="n-" aria-label="少做一份">−</button><b>${ck.n} 份</b><button data-act="n+" aria-label="多做一份">＋</button></span></div>
      <div class="ings">${r.ing.map(i => `<span class="one"><b>${esc(i.n)}</b>　${amt(i, k)}</span>`).join("")}</div>
      <div class="step">
        <span class="k">第 ${ck.i+1} 步 / 共 ${r.steps.length} 步</span>
        <p>${fill(r, s.t, k)}</p>
        ${s.timer ? `<button class="st${running ? " run" : ""}" data-act="timer">${running ? `还剩 ${mmss(Math.ceil(ck.left))}　点一下停` : ck.left <= 0 ? "时间到，再计一次" : ck.left < s.timer ? `继续　${mmss(Math.ceil(ck.left))}` : `计时 ${mmss(s.timer)}`}</button>` : ""}
      </div>
    </div>
    <div class="nav"><button data-act="prev"${ck.i === 0 ? " disabled" : ""}>上一步</button><span class="dots">${r.steps.map((_,j) => `<i class="${j === ck.i ? "on" : ""}"></i>`).join("")}</span><button data-act="next">${last ? "做好了" : "下一步"}</button></div>`;
}
let ac = null;
function beep(){
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ac.currentTime;
    for (const d of [0, .28, .56]){
      const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880;
      g.gain.setValueAtTime(.0001, t0+d); g.gain.exponentialRampToValueAtTime(.18, t0+d+.02); g.gain.exponentialRampToValueAtTime(.0001, t0+d+.2);
      o.connect(g).connect(ac.destination); o.start(t0+d); o.stop(t0+d+.22);
    }
  } catch(e) {}
}
function tick(){
  ck.left = Math.max(0, (ck.end - performance.now())/1000);
  const b = cookEl.querySelector(".st");
  if (ck.left > 0){ if (b) b.textContent = `还剩 ${mmss(Math.ceil(ck.left))}　点一下停`; ck.raf = requestAnimationFrame(tick); }
  else { ck.end = 0; drawCook(); beep(); }
}
function onCookClick(ev){
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act, r = ck.r;
  if (a === "close") return closeCook();
  if (a === "n-" || a === "n+"){ ck.n = Math.max(1, Math.min(8, ck.n + (a === "n+" ? 1 : -1))); return drawCook(); }
  if (a === "timer"){
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch(e) {}
    if (ck.end){ cancelAnimationFrame(ck.raf); ck.end = 0; return drawCook(); }
    if (ck.left <= 0) ck.left = r.steps[ck.i].timer;
    ck.end = performance.now() + ck.left*1000; drawCook(); tick(); return;
  }
  if (a === "prev" || a === "next"){
    if (a === "next" && ck.i === r.steps.length - 1) return closeCook();
    cancelAnimationFrame(ck.raf); ck.end = 0;
    ck.i += a === "next" ? 1 : -1; ck.left = r.steps[ck.i].timer || 0; drawCook();
    cookEl.querySelector(".cscroll").scrollTop = cookEl.querySelector(".step").offsetTop - 20;
  }
}


/* ---------- 换一顿 ---------- */
const slotOf = k => SLOTS.find(s => s.k === k);
function cellNow(create){
  const t = addDays(today(), dayOff), key = mondayOf(t), w = week(key, create);
  return w ? { t, d: w.days[dow(t)] || (w.days[dow(t)] = {}) } : null;
}
function ensureSwap(){
  if (swapEl) return;
  swapEl = document.createElement("div");
  swapEl.className = "sheet"; swapEl.hidden = true;
  document.querySelector(".app").appendChild(swapEl);
  swapEl.addEventListener("click", onSwap);
}
function openSwap(k){ swapK = k; ensureSwap(); swapEl.hidden = false; drawSwap(); }
function closeSwap(){ if (swapEl) swapEl.hidden = true; }
function drawSwap(){
  const c = cellNow(false); if (!c) return closeSwap();
  const s = slotOf(swapK), e = c.d[swapK], r = e && !e.custom && store.byId[e.r];
  const cur = e?.custom ? e.custom.name : r ? r.name : "没排";
  // 常排在这一顿的菜，家里有料的排前面
  const cand = store.recipes.filter(x => x.slot === s.name && x.id !== r?.id)
    .map(x => ({ x, n: entryN(entryFor(x, swapK, {})), home: (x.ing || []).filter(i => invLeft(i.n, c.t) > 0).length }))
    .sort((a, b) => b.home - a.home || (a.x.order ?? 999) - (b.x.order ?? 999));
  swapEl.innerHTML = `<div class="panel swap" role="dialog" aria-label="换${s.name}">
    <div class="ph"><span class="one">${dayOff ? "明天" : "今天"}${s.name}　${esc(cur)}</span><button data-s="x">收起</button></div>
    ${r && r.steps?.length ? `<button class="sw-go" data-s="cook" data-id="${esc(r.id)}">开始做 ›</button>` : ""}
    <div class="sw-list">
      <div class="rsub">换成</div>
      ${cand.map(o => `<button class="sw" data-s="r" data-id="${esc(o.x.id)}"><span class="one">${esc(o.x.name)}</span><span class="sw-n">${o.home ? `<em>家里有料</em>` : ""}${r0(o.n.kcal)} kcal　蛋白 ${r0(o.n.p)} g</span></button>`).join("") || `<p class="hint">没有别的${s.name}可换。</p>`}
      ${s.opt ? "" : `<div class="rsub">不做了</div>${["mealdeal","eatout","custom"].map(k2 => `<button class="sw" data-s="sp" data-v="${k2}"><span class="one">${esc(SPECIAL[k2].label)}</span><span class="sw-n">约 ${r0(SPECIAL[k2].presets[0].kcal)} kcal</span></button>`).join("")}`}
      ${e ? `<button class="sw clear" data-s="clear"><span>清空这一顿</span></button>` : ""}
    </div>
  </div>`;
}
function onSwap(ev){
  if (ev.target === swapEl) return closeSwap();
  const b = ev.target.closest("[data-s]"); if (!b) return;
  const a = b.dataset.s;
  if (a === "x") return closeSwap();
  if (a === "cook"){ closeSwap(); return openCook(b.dataset.id, 1); }
  const c = cellNow(true), k = swapK, prev = c.d[k] || {};
  if (prev.custom?.paid){ toastFn("这一顿已经记过账，先在电脑上撤销再换"); return; }
  if (a === "clear") delete c.d[k];
  else if (a === "sp"){ const kind = b.dataset.v; c.d[k] = { custom: { kind, ...SPECIAL[kind].presets[0] }, rice: 0, lock: true }; }
  else if (a === "r"){ const r = store.byId[b.dataset.id]; if (!r) return; c.d[k] = entryFor(r, k, { lock: true }); }
  saveDoc("menu"); closeSwap(); draw();
  toastFn(a === "clear" ? "清空了" : "换好了，采购清单会跟着变");
}

/* ---------- 点击 ---------- */
function onClick(ev){
  const b = ev.target.closest("[data-act]"); if (!b || !root.contains(b)) return;
  const a = b.dataset.act;
  if (a === "seg"){ seg = b.dataset.v; draw(); root.scrollTop = 0; return; }
  if (a === "cook") return openCook(b.dataset.id, b.dataset.n);
  if (a === "dayoff"){ dayOff = +b.dataset.v; draw(); return; }
  if (a === "meal") return openSwap(b.dataset.k);
  if (a === "buy"){
    const sh = store.docs.shop; sh.bought ||= {}; const k = b.dataset.k;
    if (sh.bought[k]) delete sh.bought[k]; else { sh.bought[k] = 1; popKey = k; }
    saveDoc("shop"); draw(); return;
  }
  if (a === "have"){
    const sh = store.docs.shop; sh.pantry ||= {}; const n = b.dataset.n;
    if (sh.pantry[n]) delete sh.pantry[n]; else sh.pantry[n] = 1;
    saveDoc("shop"); draw(); return;
  }
}

export function renderFood(view){ onPage = true; root = view; root.onclick = onClick; draw(); }
export function leaveFood(){ onPage = false; if (root && root.onclick === onClick) root.onclick = null; closeCook(); closeSwap(); }
export function redrawFood(){ if (onPage) draw(); }
