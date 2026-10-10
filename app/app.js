// 素日：手机上的个人 App。现在做好的是首页和底栏，训练 / 吃饭 / 记账三页接着做。
import { docs, saveDoc, initDB, setHandlers } from "./db.js";
import { renderTrain, leaveTrain, redrawTrain } from "./train.js";
import { loadReminders, remindLine, openReminders } from "./remind.js";
import { renderFood, leaveFood, redrawFood } from "./food.js";
import { renderMoney, leaveMoney, redrawMoney } from "./money.js";
import { initStore, onChange } from "../store.js";
import { applyInbox, migrateLedger } from "../ledger.js";
import { migrateMenu, migrateWeek } from "../menu.js";
import { ui } from "../ui.js";
import { QUOTES } from "./quotes.js";

const $ = s => document.querySelector(s);
const LS = {
  get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
const pad = n => String(n).padStart(2,"0");
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const WEEK = "日一二三四五六";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

function toast(msg, undo){
  const t = $("#toast"), b = t.querySelector("button");
  t.querySelector(".t").textContent = msg; b.hidden = !undo; t.classList.add("on");
  b.onclick = () => { t.classList.remove("on"); b.onclick = null; if (undo) undo(); };
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), undo ? 6000 : 2200);
}

/* ================= 天气 ================= */
const HOME = { lat:50.9097, lon:-1.4044, place:"南安普顿" };
const WX_KEY = "suri:wx", POS_KEY = "suri:pos";

const CODE = c => {
  if (c <= 1) return "晴";
  if (c === 2) return "多云";
  if (c === 3) return "阴";
  if (c === 45 || c === 48) return "有雾";
  if (c >= 51 && c <= 55) return "毛毛雨";
  if (c === 56 || c === 57 || c === 66 || c === 67) return "冻雨";
  if (c === 61) return "小雨";
  if (c === 63) return "中雨";
  if (c === 65) return "大雨";
  if (c === 71) return "小雪";
  if (c === 73) return "中雪";
  if (c === 75) return "大雪";
  if (c === 77) return "飘雪";
  if (c === 80 || c === 81) return "阵雨";
  if (c === 82) return "大阵雨";
  if (c === 85 || c === 86) return "阵雪";
  if (c >= 95) return "雷雨";
  return "多云";
};
const isRain = c => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
const isSnow = c => (c >= 71 && c <= 77) || c === 85 || c === 86;

function km(a, b){
  const R = 6371, r = x => x*Math.PI/180;
  const dLat = r(b.lat-a.lat), dLon = r(b.lon-a.lon);
  const h = Math.sin(dLat/2)**2 + Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

function getPos(){
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      p => res({ lat:p.coords.latitude, lon:p.coords.longitude }),
      () => res(null),
      { timeout:8000, maximumAge:30*60*1000 }
    );
  });
}

async function fetchWx(lat, lon){
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`
    + `&current=temperature_2m,weather_code,wind_speed_10m,is_day`
    + `&hourly=temperature_2m,weather_code,precipitation_probability`
    + `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max`
    + `&timezone=auto&forecast_days=1`;
  const r = await fetch(u);
  if (!r.ok) throw new Error("weather " + r.status);
  return r.json();
}

async function placeName(lat, lon){
  if (km({lat,lon}, HOME) < 15) return HOME.place;
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`);
    const j = await r.json();
    let n = j.city || j.locality || j.principalSubdivision || "";
    return n.replace(/市$/, "");
  } catch(e) { return ""; }
}

// 穿衣：一句大概的话，不重复天气本身
function wearText(w){
  const hi = Math.round(w.daily.temperature_2m_max[0]), lo = Math.round(w.daily.temperature_2m_min[0]);
  const wind = w.current.wind_speed_10m, code = w.current.weather_code;
  const parts = [];
  if (wind >= 30) parts.push("风大");
  if (hi >= 24) parts.push("短袖就行");
  else if (hi >= 19) parts.push("短袖或薄长袖");
  else if (hi >= 14) parts.push("长袖加件薄外套");
  else if (hi >= 9) parts.push("卫衣加外套");
  else if (hi >= 4) parts.push("厚外套，里面穿暖和点");
  else parts.push("羽绒服，围巾手套带上");
  if (hi >= 19 && hi - lo >= 7) parts.push("傍晚加件外套");
  // 什么时候会下雨
  const now = new Date(), hrs = w.hourly.time, pp = w.hourly.precipitation_probability, hc = w.hourly.weather_code;
  if (isRain(code)) parts.push("记得带伞");
  else {
    for (let i = 0; i < hrs.length; i++){
      const h = new Date(hrs[i]);
      if (h.getDate() !== now.getDate() || h.getHours() < now.getHours()) continue;
      if ((pp?.[i] ?? 0) >= 50 || isRain(hc[i])) { parts.push(h.getHours() <= now.getHours() ? "记得带伞" : `${h.getHours()} 点后可能下雨，带伞`); break; }
    }
  }
  if (isSnow(code)) parts.push("路滑慢点走");
  return parts.join("，") + "。";
}

function gymText(w){
  const now = new Date();
  if (now.getHours() >= 17) return "";
  const i = w.hourly.time.findIndex(t => t.endsWith("T16:00"));
  if (i < 0) return "";
  return `16:00 去健身那会儿 ${Math.round(w.hourly.temperature_2m[i])}°，${CODE(w.hourly.weather_code[i])}`;
}

function skyMode(w){
  const c = w.current.weather_code;
  if (isRain(c)) return "rain";
  if (c >= 2) return "cloud";
  return w.current.is_day ? "sun" : "night";
}

let wx = LS.get(WX_KEY);   // {t, lat, lon, place, data}

async function refreshWeather(force){
  const cachedPos = LS.get(POS_KEY);
  if (!force && wx && Date.now() - wx.t < 20*60*1000) return;
  let pos = await getPos();
  if (pos) LS.set(POS_KEY, pos); else pos = cachedPos || HOME;
  try {
    const sameSpot = wx && km(pos, wx) < 5;
    const [data, place] = await Promise.all([fetchWx(pos.lat, pos.lon), sameSpot && wx.place ? wx.place : placeName(pos.lat, pos.lon)]);
    wx = { t:Date.now(), lat:pos.lat, lon:pos.lon, place, data };
    LS.set(WX_KEY, wx);
    if (tab === "home") paintWeather(true);
  } catch(e) {
    if (!wx && tab === "home") { const l = $("#wline"); if (l) l.textContent = "天气没加载出来，过会儿再打开看看。"; }
  }
}

/* ================= 背景动画 ================= */
const sky = (() => {
  const cv = $("#sky"), ctx = cv.getContext("2d");
  let W = 0, H = 0;
  const size = () => { const d = Math.min(2, devicePixelRatio||1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W*d; cv.height = H*d; ctx.setTransform(d,0,0,d,0,0); };
  new ResizeObserver(size).observe(cv); size();
  const R = (a,b) => a + Math.random()*(b-a);
  const rgba = (hex,a) => { const n = parseInt(hex.slice(1),16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${Math.max(0,a)})`; };
  const P = { sun:"#E9D6B9", cloud:"#A29E95", rain:"#8F8B83", star:"#B7B2A8" };
  const drops = Array.from({length:80}, () => ({x:R(0,1),y:R(0,1),l:R(10,22),v:R(.55,.9)}));
  const motes = Array.from({length:16}, () => ({x:R(.3,1),y:R(0,.7),r:R(2,7),v:R(.004,.012),p:R(0,6.28)}));
  const stars = Array.from({length:22}, () => ({x:R(0,1),y:R(0,.45),r:R(.8,1.8),p:R(0,6.28)}));
  // 阴天的云雾：左右能无缝拼接的噪声纹理，两层不同速度往右流
  function fogTexture(w, h, seed){
    let s = seed; const rnd = () => (s = (s*16807) % 2147483647) / 2147483647;
    const oct = [[8,4,.55],[16,8,.3],[32,16,.15]].map(([gx,gy,amp]) => ({gx,gy,amp,v:Array.from({length:gx*(gy+1)},rnd)}));
    const sm = t => t*t*(3-2*t), [r,g,b] = [162,158,149];
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x2 = c.getContext("2d"), im = x2.createImageData(w,h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      let n = 0;
      for (const o of oct){
        const fx = x/w*o.gx, fy = y/h*o.gy, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx-x0), ty = sm(fy-y0);
        const at = (i,j) => o.v[j*o.gx + ((i % o.gx)+o.gx) % o.gx];
        const a = at(x0,y0)+(at(x0+1,y0)-at(x0,y0))*tx, bb = at(x0,y0+1)+(at(x0+1,y0+1)-at(x0,y0+1))*tx;
        n += (a+(bb-a)*ty)*o.amp;
      }
      const a = Math.min(1, Math.max(0, (n-.32)*2.6)) * Math.pow(Math.max(0, 1-y/h), 1.4);
      const k = (y*w+x)*4; im.data[k] = r; im.data[k+1] = g; im.data[k+2] = b; im.data[k+3] = a*255;
    }
    x2.putImageData(im,0,0); return c;
  }
  const fog1 = fogTexture(192, 96, 12345), fog2 = fogTexture(160, 80, 777);
  let o1 = 0, o2 = 0;
  const layer = (tex, off, wMul, hMul, alpha) => {
    const w = W*wMul, h = H*hMul, x = ((off*w) % w) - w;
    ctx.globalAlpha = alpha; ctx.drawImage(tex, x, 0, w, h); ctx.drawImage(tex, x+w, 0, w, h); ctx.globalAlpha = 1;
  };
  const mix = {sun:0, rain:0, cloud:0, night:0}, target = {sun:0, rain:0, cloud:0, night:0};
  let last = performance.now(), t = 0, running = false, visible = true;

  function frame(now){
    const dt = Math.min(.05,(now-last)/1000); last = now; t += dt;
    for (const k in mix) mix[k] += (target[k]-mix[k])*Math.min(1, dt*2.2);
    ctx.clearRect(0,0,W,H);
    if (mix.sun > .01){
      const r = W*1.05*(1+.04*Math.sin(t*.6)), g = ctx.createRadialGradient(W*.85,H*.08,0,W*.85,H*.08,r);
      g.addColorStop(0, rgba(P.sun,.7*mix.sun)); g.addColorStop(.45, rgba(P.sun,.22*mix.sun)); g.addColorStop(1, rgba(P.sun,0));
      ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
      for (const m of motes){ m.y -= m.v*dt*3; if (m.y < -.05){ m.y = .75; m.x = R(.3,1); }
        ctx.beginPath(); ctx.arc(m.x*W, m.y*H, m.r, 0, 6.283); ctx.fillStyle = rgba(P.sun,(.35+.35*Math.sin(t*1.2+m.p))*mix.sun); ctx.fill(); }
    }
    if (mix.night > .01){
      const w = ctx.createLinearGradient(0,0,0,H*.6); w.addColorStop(0, rgba(P.cloud,.12*mix.night)); w.addColorStop(1, rgba(P.cloud,0));
      ctx.fillStyle = w; ctx.fillRect(0,0,W,H);
      for (const s of stars){ ctx.beginPath(); ctx.arc(s.x*W, s.y*H, s.r, 0, 6.283); ctx.fillStyle = rgba(P.star,(.3+.3*Math.sin(t*.9+s.p))*mix.night); ctx.fill(); }
    }
    const cA = Math.min(1, mix.cloud + mix.rain*.8);
    if (cA > .01){
      const w = ctx.createLinearGradient(0,0,0,H*.65); w.addColorStop(0, rgba(P.cloud,.16*cA)); w.addColorStop(1, rgba(P.cloud,0));
      ctx.fillStyle = w; ctx.fillRect(0,0,W,H);
      o1 += dt*.012; o2 += dt*.02;
      layer(fog1, o1, 2.2, .72, .85*cA);
      layer(fog2, o2, 1.7, .56, .55*cA);
    }
    if (mix.rain > .01){
      ctx.strokeStyle = rgba(P.rain,.4*mix.rain); ctx.lineWidth = 1; ctx.lineCap = "round"; ctx.beginPath();
      for (const d of drops){ d.y += d.v*dt*1.1; if (d.y > 1.05){ d.y = -.05; d.x = R(0,1.1); } const x = d.x*W, y = d.y*H; ctx.moveTo(x,y); ctx.lineTo(x-d.l*.22, y+d.l); }
      ctx.stroke();
    }
    if (running && visible && !reduce) requestAnimationFrame(frame); else running = false;
  }
  function kick(){ if (!running){ running = true; last = performance.now(); requestAnimationFrame(frame); } }
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; if (visible) kick(); });
  return {
    set(mode, instant){ for (const k in target) target[k] = k === mode ? 1 : 0; if (instant || reduce) Object.assign(mix, target); kick(); },
    show(on){ cv.style.opacity = on ? 1 : 0; }
  };
})();

/* ================= 体重 ================= */
const W = () => docs.body.weights ||= {};

function avg7(){
  const now = new Date(); const vals = [];
  for (let i = 0; i < 7; i++){ const d = new Date(now); d.setDate(d.getDate()-i); const v = W()[dkey(d)]; if (v) vals.push(v); }
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
}

/* ================= 页面 ================= */
let tab = "home";
const view = $("#view");

function greet(h){
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 13) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}
function dayIndex(d){ return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026,0,1)) / 864e5); }

function renderHome(){
  const now = new Date();
  const q = QUOTES[((dayIndex(now) % QUOTES.length) + QUOTES.length) % QUOTES.length];
  view.innerHTML = `
    <section class="page home">
      <div class="top"><i></i><span>${now.getMonth()+1}.${now.getDate()}　周${WEEK[now.getDay()]}</span><span class="r" id="place">${wx?.place || ""}</span></div>
      <div class="hello">${greet(now.getHours())}，子俊。</div>
      <div class="fade" id="wx">
        <div class="t" id="temp"></div>
        <hr>
        <div class="line" id="wline">正在看天气…</div>
        <div class="gym" id="wgym"></div>
      </div>
      <div class="quote">${q}</div>
      <div id="rslot"></div>
      <div id="wslot"></div>
    </section>`;
  paintWeather(false);
  paintRemind();
  paintWeight();
}
function paintRemind(){ const s = $("#rslot"); if (s) s.innerHTML = remindLine(); }

function paintWeather(animate){
  if (!wx?.data) return;
  const w = wx.data;
  const apply = () => {
    $("#temp").textContent = `${Math.round(w.current.temperature_2m)}°`;
    $("#wline").textContent = `${CODE(w.current.weather_code)}，${Math.round(w.daily.temperature_2m_max[0])}° / ${Math.round(w.daily.temperature_2m_min[0])}°。${wearText(w)}`;
    const g = gymText(w); $("#wgym").textContent = g; $("#wgym").hidden = !g;
    $("#place").textContent = wx.place || "";
  };
  sky.set(skyMode(w), !animate);
  if (!animate || reduce) return apply();
  const box = $("#wx"); box.classList.add("out");
  setTimeout(() => { apply(); box.classList.remove("out"); }, 320);
}

function paintWeight(editing){
  const slot = $("#wslot"); if (!slot) return;
  const today = W()[dkey(new Date())];
  if (editing){
    slot.innerHTML = `<form class="wform" id="wf"><span>体重</span><input id="win" inputmode="decimal" autocomplete="off" placeholder="${today || avg7()?.toFixed(1) || "76.0"}" value="${today || ""}" aria-label="今天的体重，公斤"><span>kg</span><button type="button" id="wcancel">取消</button><button type="submit" class="ok">好</button></form>`;
    const inp = $("#win"); inp.focus();
    $("#wcancel").onclick = () => paintWeight();
    $("#wf").onsubmit = ev => {
      ev.preventDefault();
      const v = parseFloat(inp.value.replace(",", "."));
      if (!(v > 30 && v < 200)) { toast("输一个 30 到 200 之间的数"); return; }
      W()[dkey(new Date())] = Math.round(v*10)/10;
      paintWeight(); saveDoc("body"); toast("记好了");
    };
    return;
  }
  const a = avg7();
  slot.innerHTML = today
    ? `<button class="weigh" id="wbtn"><span>体重　<b>${today.toFixed(1)} kg</b>${a ? `　7 天平均 ${a.toFixed(1)}` : ""}</span><em aria-hidden="true">›</em></button>`
    : `<button class="weigh" id="wbtn"><span>体重　今天还没称</span><em aria-hidden="true">＋</em></button>`;
  $("#wbtn").onclick = () => paintWeight(true);
}

function go(k){
  tab = k;
  document.querySelectorAll("#bar button").forEach(b => { if (b.dataset.tab === k) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
  sky.show(k === "home");
  view.scrollTop = 0;
  if (k !== "train") leaveTrain();
  if (k !== "food") leaveFood();
  if (k !== "money") leaveMoney();
  if (k === "home") renderHome(); else if (k === "train") renderTrain(view); else if (k === "food") renderFood(view); else renderMoney(view, { toast });
}
document.querySelectorAll("#bar button").forEach(b => b.addEventListener("click", () => { if (b.dataset.tab !== tab) go(b.dataset.tab); }));

// 从后台切回来：日期、招呼、天气跟着更新
let lastDay = dkey(new Date());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  const d = dkey(new Date());
  if (d !== lastDay) { if (tab === "home") renderHome(); else if (tab === "train") redrawTrain(); else if (tab === "food") redrawFood(); else redrawMoney(); }
  lastDay = d;
  refreshWeather(false);
  loadReminders();
});

view.addEventListener("click", e => { if (e.target.closest("[data-remind]")) openReminders(); });
loadReminders(() => { if (tab === "home") paintRemind(); });
/* 有新版本就自动换：GitHub Pages 会把网页缓存 10 分钟，这里绕过去 */
const VERSION = "20261010h";
async function checkUpdate(){
  try {
    const r = await fetch(new URL("version.json", import.meta.url).href.split("?")[0] + "?t=" + Date.now(), { cache:"no-store" });
    const j = await r.json();
    if (j.v && j.v !== VERSION){
      const k = "suri:reload:" + j.v;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
      location.replace(location.pathname + "?v=" + j.v);
    }
  } catch(e) {}
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkUpdate(); });
checkUpdate();

go("home");
refreshWeather(true);
setHandlers({ error: () => toast("没存到云端，先存在手机里了"), load: () => { if (tab === "home") { paintWeight(); paintRemind(); } else if (tab === "train") redrawTrain(); } });
initDB();
// 厨房账本的数据（菜单、食谱、采购、记账），吃饭和记账两页用
const redrawKitchen = () => { redrawFood(); redrawMoney(); };
ui.rerender = redrawKitchen;
onChange(what => { if (what !== "status") redrawKitchen(); });
initStore().then(() => { migrateLedger(); migrateMenu(); migrateWeek(); redrawKitchen(); applyInbox(); }).catch(e => { console.error(e); toast("菜单没加载出来，过会儿再打开看看"); });
