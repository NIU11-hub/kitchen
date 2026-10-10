// 训练页：热身、热身组、逐组打勾、改次数重量、换动作、组间计时、上次成绩、自动加重
import { PLAN, START, BY_DAY, PICK } from "./plan.js";
import { docs, saveDoc } from "./db.js";

const pad = n => String(n).padStart(2,"0");
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const WEEK = "日一二三四五六";
const CHECK = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5 5.6 10.4 11.5 3.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const round = (v, step) => step ? Math.round(v/step)*step : v;
const num = w => Number.isInteger(w) ? String(w) : w.toFixed(1);
const fmtW = w => w === 0 ? "自重" : `${num(w)} kg`;
const mmss = s => `${Math.floor(s/60)}:${pad(Math.floor(s%60))}`;
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- 周期 ---------- */
function weekInfo(d){
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const [y,m,dd] = START.split("-").map(Number), b = Date.UTC(y, m-1, dd);
  const days = Math.floor((a-b)/864e5);
  if (days < 0) return { before:true, wk:0, deload:false };
  const wk = Math.floor(days/7) % 4 + 1;
  return { wk, deload: wk === 4 };
}

/* ---------- 历史和目标 ---------- */
function perf(x){
  const done = x.sets.filter(s => s.done);
  const w = done.length ? Math.min(...done.map(s => s.w)) : x.t.w;
  return { w, done:done.length, reps:done.map(s => s.r), full: done.length >= x.t.s && done.every(s => s.r >= x.t.r) };
}
function hist(exId, today, withDeload){
  return Object.values(docs.train.log)
    .filter(e => e.date < today && e.ex?.[exId] && !e.ex[exId].swap && (withDeload || !e.ex[exId].t.deload) && perf(e.ex[exId]).done > 0)
    .sort((a,b) => a.date < b.date ? 1 : -1)
    .map(e => ({ date:e.date, x:e.ex[exId] }));
}
function target(ex, today, wi){
  const h = hist(ex.id, today, false);
  let w = ex.w, r = ex.r, s = ex.s;
  const est = !ex.bw && !ex.main && h.length === 0;
  if (h.length){
    const a = perf(h[0].x);
    r = h[0].x.t.r;
    if (ex.bw){ w = 0; if (a.full) r = Math.min(r + 1, 12); }
    else if (a.full) w = a.w + ex.step;
    else {
      w = a.w;
      if (h[1]){ const b = perf(h[1].x); if (!b.full && b.w === a.w) w = Math.max(ex.step, a.w - ex.drop); }
    }
  }
  if (!ex.bw) w = round(w, ex.step);
  if (wi.deload){ if (!ex.bw) w = round(w*0.9, ex.step); s = s - 1; }
  return { w, r, s, est, deload:wi.deload };
}
function lastLine(ex, today){
  const h = hist(ex.id, today, true);
  if (!h.length) return "";
  const x = h[0].x, a = perf(x);
  return a.full ? `上次 ${fmtW(a.w)} × ${x.t.r} × ${a.done}，全做满` : `上次 ${fmtW(a.w)}：${a.reps.join("、")}`;
}
const virt = t => ({ t:{ w:t.w, r:t.r, s:t.s, deload:t.deload }, sets:Array.from({length:t.s}, () => ({ w:t.w, r:t.r, done:false })), wd:{} });

/* ---------- 组间计时 ---------- */
let timerEl = null, tEnd = 0, tDur = 0, tRaf = 0, tLabel = "", tRunning = false, ac = null, wl = null, onPage = false;
function ensureTimer(){
  if (timerEl) return;
  timerEl = document.createElement("div");
  timerEl.className = "timer"; timerEl.hidden = true;
  timerEl.innerHTML = `<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="bg" cx="22" cy="22" r="19"/><circle class="fg" cx="22" cy="22" r="19"/></svg><div class="tt"><b>0:00</b><small></small></div><button type="button">跳过</button>`;
  document.querySelector(".app").insertBefore(timerEl, document.getElementById("bar"));
  timerEl.querySelector("button").onclick = stopTimer;
  const C = 2*Math.PI*19; timerEl.querySelector(".fg").style.strokeDasharray = C;
}
function primeAudio(){
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch(e) {}
}
function beep(){
  if (!ac) return;
  try {
    const t0 = ac.currentTime;
    for (const d of [0, .28]){
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 880; o.type = "sine";
      g.gain.setValueAtTime(.0001, t0+d); g.gain.exponentialRampToValueAtTime(.18, t0+d+.02); g.gain.exponentialRampToValueAtTime(.0001, t0+d+.2);
      o.connect(g).connect(ac.destination); o.start(t0+d); o.stop(t0+d+.22);
    }
  } catch(e) {}
}
async function wake(){
  try { if (!wl && navigator.wakeLock) { wl = await navigator.wakeLock.request("screen"); wl.addEventListener("release", () => { wl = null; }); } } catch(e) {}
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && onPage && tRunning) wake(); });

function startTimer(sec, label){
  ensureTimer(); cancelAnimationFrame(tRaf);
  tDur = sec; tEnd = performance.now() + sec*1000; tLabel = label; tRunning = true;
  timerEl.hidden = !onPage; timerEl.classList.remove("end");
  const C = 2*Math.PI*19, fg = timerEl.querySelector(".fg"), b = timerEl.querySelector("b"), sm = timerEl.querySelector("small");
  sm.textContent = `下一个：${label}`;
  const step = () => {
    const left = Math.max(0, (tEnd - performance.now())/1000);
    b.textContent = mmss(Math.ceil(left)); fg.style.strokeDashoffset = C*(1 - left/tDur);
    if (left > 0) tRaf = requestAnimationFrame(step);
    else { tRunning = false; b.textContent = "好了"; sm.textContent = tLabel; timerEl.classList.add("end"); beep(); }
  };
  step();
}
function stopTimer(){ cancelAnimationFrame(tRaf); tRunning = false; if (timerEl) timerEl.hidden = true; }

/* ---------- 页面 ---------- */
let root = null, sel = null, picking = false, openIdx = null, editing = null, showAlt = {}, popKey = null, viewDay = null;

const dayNow = () => new Date();
function sid(){ return sel || BY_DAY[dayNow().getDay()]; }
function sess(create){
  const today = dkey(dayNow()), k = `${today}|${sid()}`;
  let e = docs.train.log[k];
  if (!e && create) e = docs.train.log[k] = { date:today, sid:sid(), wu:{}, ex:{}, cardio:false };
  return e;
}
function getX(ex, create){
  const now = dayNow(), today = dkey(now), e = sess(create);
  if (e?.ex?.[ex.id]) return e.ex[ex.id];
  const x = virt(target(ex, today, weekInfo(now)));
  if (create) e.ex[ex.id] = x;
  return x;
}
const dims = x => x.swap || x.t;

function draw(){
  const now = dayNow(), today = dkey(now), wi = weekInfo(now);
  if (viewDay !== today){ viewDay = today; sel = null; openIdx = null; editing = null; showAlt = {}; }
  const id = sid(), P = PLAN[id], e = sess(false);
  const wk = wi.before ? "周一开始第 1 周" : wi.deload ? "第 4 周　减量周" : `第 ${wi.wk} 周 / 共 4 周`;
  let h = `<section class="page train">
    <div class="top"><i></i><span>${now.getMonth()+1}.${now.getDate()}　周${WEEK[now.getDay()]}</span><span class="r">${wk}</span></div>
    <div class="ttl">${P.name}</div>
    <div class="metarow"><span class="meta">${P.ex ? `约 ${P.mins} 分钟　${P.ex.length} 个动作` : id === "rest" ? "今天不练" : "做完打个勾"}</span><button class="link" data-act="pick">${picking ? "收起" : "练别的 ›"}</button></div>`;
  if (picking) h += `<div class="chips">${PICK.map(k => `<button data-act="sel" data-sid="${k}"${k === id ? ' aria-pressed="true"' : ""}>${PLAN[k].name}</button>`).join("")}</div>`;

  if (P.cardio){
    h += `<div class="lbl">今天</div><div class="wus"><button class="warmup${e?.cardio ? " done" : ""}" data-act="cardio" data-key="cardio"><span class="one">${P.cardio}</span><span class="tick">${CHECK}</span></button></div>`;
  } else if (!P.ex){
    const tomorrow = PLAN[BY_DAY[(now.getDay()+1) % 7]].name;
    h += `<p class="soon">今天休息，吃好睡好。明天${tomorrow}。</p>`;
  } else {
    h += `<div class="lbl">热身</div><div class="wus">${P.warm.map((t,i) => `<button class="warmup${e?.wu?.[i] ? " done" : ""}" data-act="wu" data-i="${i}" data-key="wu${i}"><span class="one">${t}</span><span class="tick">${CHECK}</span></button>`).join("")}</div>`;
    h += `<div class="lbl">动作</div>`;
    const xs = P.ex.map(ex => getX(ex, false));
    if (openIdx === null){ openIdx = xs.findIndex(x => x.sets.filter(s => s.done).length < dims(x).s); }
    P.ex.forEach((ex, i) => {
      const x = xs[i], d = dims(x), done = x.sets.filter(s => s.done).length, fin = done >= d.s;
      const est = !x.swap && !ex.main && !ex.bw && hist(ex.id, today, true).length === 0;
      const sub = x.swap ? "今天换成了这个，不算进度" : lastLine(ex, today);
      h += `<div class="ex${fin ? " fin" : ""}">
        <button class="exh" data-act="open" data-i="${i}">
          <span class="n one">${x.swap ? x.swap.n : ex.n}</span>
          <span class="s">${fmtW(d.w)} × ${d.r} × ${d.s}${est ? '<em class="est">估</em>' : ""}</span>
        </button>${sub ? `<div class="last one">${sub}</div>` : ""}`;
      if (openIdx === i){
        h += `<div class="exb">`;
        if (ex.main && !x.swap){
          const ramp = ex.ramp.map(([p,r]) => [p === 0 ? 20 : round(d.w*p, 2.5), r]).filter(([w]) => w < d.w);
          if (ramp.length){
            h += `<div class="sub">热身组</div>` + ramp.map(([w,r],j) => `<div class="set warm${x.wd?.[j] ? " done" : ""}"><span class="w">${fmtW(w)} × ${r}</span><button class="tick" data-act="wset" data-i="${i}" data-j="${j}" data-key="w${i}-${j}" aria-label="完成">${CHECK}</button></div>`).join("");
            h += `<div class="sub">正式组</div>`;
          }
        }
        x.sets.forEach((s, j) => {
          const ed = editing && editing.i === i && editing.j === j;
          h += `<div class="set${s.done ? " done" : ""}"><button class="w" data-act="edit" data-i="${i}" data-j="${j}">${fmtW(s.w)} × ${s.r}<span class="pen">${ed ? "收起" : "改"}</span></button><button class="tick" data-act="set" data-i="${i}" data-j="${j}" data-key="s${i}-${j}" aria-label="完成">${CHECK}</button></div>`;
          if (ed) h += `<div class="ed">
            <span>重量</span><button data-act="w-" data-i="${i}" data-j="${j}" aria-label="减重量">−</button><b>${fmtW(s.w)}</b><button data-act="w+" data-i="${i}" data-j="${j}" aria-label="加重量">＋</button>
            <span>次数</span><button data-act="r-" data-i="${i}" data-j="${j}" aria-label="减次数">−</button><b>${s.r}</b><button data-act="r+" data-i="${i}" data-j="${j}" aria-label="加次数">＋</button></div>`;
        });
        if (showAlt[i]){
          h += `<div class="alt"><span class="h">换成</span>${ex.alt.map((a,k) => `<button data-act="alt" data-i="${i}" data-k="${k}"><span class="one">${a[0]}</span><span>${fmtW(a[1])} × ${a[2]} × ${a[3]}</span></button>`).join("")}${x.swap ? `<button data-act="unswap" data-i="${i}"><span class="one">换回${ex.n}</span><span></span></button>` : ""}</div>`;
        } else h += `<button class="link swapbtn" data-act="showalt" data-i="${i}">换动作 ›</button>`;
        h += `</div>`;
      }
      h += `</div>`;
    });
    const all = xs.every(x => x.sets.filter(s => s.done).length >= dims(x).s);
    if (all) h += `<p class="soon">今天练完了。蛋白粉兑牛奶，别忘了。</p>`;
  }
  h += `</section>`;
  root.innerHTML = h;
  if (popKey){ const el = root.querySelector(`[data-key="${popKey}"]`); const t = el?.classList.contains("tick") ? el : el?.querySelector(".tick"); if (t){ t.classList.remove("pop"); void t.offsetWidth; t.classList.add("pop"); } popKey = null; }
}

function onClick(ev){
  const b = ev.target.closest("[data-act]"); if (!b || !root.contains(b)) return;
  const act = b.dataset.act, i = +b.dataset.i, j = +b.dataset.j;
  const P = PLAN[sid()], ex = P.ex?.[i];
  let save = false;
  switch (act){
    case "pick": picking = !picking; break;
    case "sel": sel = b.dataset.sid; picking = false; openIdx = null; editing = null; showAlt = {}; break;
    case "cardio": { const e = sess(true); e.cardio = !e.cardio; save = true; popKey = "cardio"; break; }
    case "wu": { const e = sess(true); e.wu[i] = !e.wu[i]; save = true; popKey = "wu"+i; break; }
    case "open": openIdx = openIdx === i ? -1 : i; editing = null; break;
    case "wset": { const x = getX(ex, true); x.wd ||= {}; x.wd[j] = !x.wd[j]; save = true; popKey = `w${i}-${j}`; primeAudio(); wake(); break; }
    case "set": {
      const x = getX(ex, true), s = x.sets[j]; s.done = !s.done; save = true; popKey = `s${i}-${j}`;
      editing = null; primeAudio(); wake();
      if (s.done){
        const d = dims(x), left = x.sets.findIndex(z => !z.done), name = x.swap ? x.swap.n : ex.n;
        if (left >= 0) startTimer(ex.rest, `${name}　第 ${left+1} 组`);
        else {
          const xs = P.ex.map(e2 => getX(e2, false));
          const nx = xs.findIndex((z, k) => k > i && z.sets.filter(q => q.done).length < dims(z).s);
          if (nx >= 0){ startTimer(ex.rest, (xs[nx].swap ? xs[nx].swap.n : P.ex[nx].n)); setTimeout(() => { openIdx = nx; draw(); }, 450); }
          else stopTimer();
        }
        void d;
      }
      break;
    }
    case "edit": editing = editing && editing.i === i && editing.j === j ? null : { i, j }; break;
    case "w+": case "w-": {
      const x = getX(ex, true), st = (x.swap ? 2.5 : ex.step) || 2.5, s = x.sets[j];
      const nw = Math.max(0, round(s.w + (act === "w+" ? st : -st), st));
      for (let k = j; k < x.sets.length; k++) if (k === j || !x.sets[k].done) x.sets[k].w = nw;
      save = true; break;
    }
    case "r+": case "r-": { const x = getX(ex, true), s = x.sets[j]; s.r = Math.max(0, s.r + (act === "r+" ? 1 : -1)); save = true; break; }
    case "showalt": showAlt[i] = true; break;
    case "alt": {
      const x = getX(ex, true), a = ex.alt[+b.dataset.k];
      x.swap = { n:a[0], w:a[1], r:a[2], s:a[3] };
      x.sets = Array.from({length:a[3]}, () => ({ w:a[1], r:a[2], done:false })); x.wd = {};
      showAlt[i] = false; editing = null; save = true; break;
    }
    case "unswap": {
      const x = getX(ex, true); x.swap = null;
      x.sets = Array.from({length:x.t.s}, () => ({ w:x.t.w, r:x.t.r, done:false })); showAlt[i] = false; save = true; break;
    }
  }
  if (save) saveDoc("train", 800);
  draw();
}

export function renderTrain(view){
  onPage = true;
  root = view; root.onclick = onClick;
  draw();
  if (timerEl) timerEl.hidden = !(tRunning || timerEl.classList.contains("end"));
}
export function leaveTrain(){
  onPage = false;
  if (root && root.onclick === onClick) root.onclick = null;
  if (timerEl) timerEl.hidden = true;
  if (wl){ try { wl.release(); } catch(e) {} wl = null; }
}
export function redrawTrain(){ if (onPage) draw(); }
