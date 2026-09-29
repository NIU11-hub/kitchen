// 食谱：列表、详情、做饭模式、自己加和改
import { store, saveRecipe, hideRecipe } from "./store.js";
import { DAY, SLOTS, SLOT_BY_NAME, DAYS, CATS, PROS, DIFFS } from "./data.js";
import { $, $$, esc, r0, r1, uid, toast, addDays, modal } from "./util.js";
import { actions, changes, ui } from "./ui.js";
import { perServing, week, thisWeek, M } from "./menu.js";
import { saveDoc } from "./store.js";

const st = { cat: "全部", pro: null, q: "", serv: {}, slot: {}, edit: null };
const catCls = c => "cat-" + (CATS.includes(c) ? c : "加餐");

function amt(i, k) {
  if (i.cnt) { const c = Math.round(i.cnt * k * 2) / 2; return `${c} ${i.unit || "个"}`; }
  const g = (i.g || 0) * k; if (!g) return "少许";
  return (g < 10 ? r1(g) : r0(g)) + "g";
}
function fillText(r, text, k) { return esc(text).replace(/\{(\d+)\}/g, (m, n) => { const i = r.ing[+n]; return i ? `<b>${esc(i.n)} ${amt(i, k)}</b>` : m; }); }
function usedIn(r, text) { const o = [], re = /\{(\d+)\}/g; let m; while ((m = re.exec(text))) { const i = r.ing[+m[1]]; if (i && !o.includes(i)) o.push(i); } return o; }
const fmtTime = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const tLabel = s => s >= 60 ? `${r1(s / 60)} 分钟` : `${s} 秒`;

function matches(r) {
  if (st.cat !== "全部" && r.cat !== st.cat) return false;
  if (st.pro && !(r.pro || []).includes(st.pro)) return false;
  const q = st.q.trim(); if (!q) return true;
  return r.name.includes(q) || (r.ing || []).some(i => i.n.includes(q));
}
export function renderRecipes(el) {
  if (st.edit) { el.innerHTML = editHtml(st.edit); return; }
  if (ui.sel && store.byId[ui.sel]) { renderDetail(el, store.byId[ui.sel]); return; }
  const list = store.recipes.filter(matches);
  const active = document.activeElement?.id === "q";
  el.innerHTML = `<div class="pagehead"><h1>食谱</h1><div class="acts"><button class="go sm" data-act="newrecipe">自己加一道</button></div></div>
    <div class="filters">
      <div class="seg">${["全部", ...CATS].map(c => `<button class="chip ${c !== "全部" ? catCls(c) : ""}" data-act="rcat" data-v="${c}" aria-pressed="${st.cat === c}">${c !== "全部" ? `<span class="dot"></span>` : ""}${c}</button>`).join("")}</div>
      <div class="seg">${PROS.map(p => `<button class="chip" data-act="rpro" data-v="${p}" aria-pressed="${st.pro === p}">${p}</button>`).join("")}</div>
      <input class="search" id="q" type="search" placeholder="搜菜名或食材" value="${esc(st.q)}" data-chg="q" autocomplete="off">
    </div>
    <div class="count">${list.length} 道</div>
    <div class="grid">${list.length ? list.map(r => { const s = perServing(r); return `
      <button class="tile ${catCls(r.cat)}" data-act="open" data-id="${esc(r.id)}">
        <div class="cl"><span>${esc(r.cat)}</span><span>${r.diff ? esc(r.diff) + " · " : ""}${esc(r.mins)} 分钟</span></div>
        <div class="nm">${esc(r.name)}</div>
        ${r.batch ? `<div class="bt">能一次做几顿</div>` : ""}
        <div class="ft"><span class="kc">${r0(s.kcal)}<small>kcal</small></span>
          <span class="pcf">P <i>${r0(s.p)}</i> C <i>${r0(s.c)}</i> F <i>${r0(s.f)}</i></span></div>
      </button>`; }).join("") : `<div class="empty">没有符合的菜，换个条件试试。</div>`}</div>`;
  if (active) { const q = $("#q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}
function compare(s, slot) {
  const items = [];
  if (slot === "自由餐") {
    items.push(`按周末自由餐算，只看全天：碳水占全天 ${r0(s.c / DAY.c * 100)}%，脂肪占全天 ${r0(s.f / DAY.f * 100)}%。`);
    if (s.f > DAY.f * 0.45) items.push(`<span class="up">脂肪偏高</span>，当天其他餐的油各减 5g。`);
    return items;
  }
  const t = SLOT_BY_NAME[slot].t, dk = s.kcal - t.kcal, dp = s.p - t.p;
  if (Math.abs(dk) <= 80) items.push(`<span class="ok">热量合适</span>，计划里${slot}是 ${t.kcal} kcal。`);
  else if (dk > 0) items.push(`<span class="up">热量多了 ${r0(dk)} kcal</span>，当天其他餐的米饭少吃 ${Math.round(dk / 1.3 / 10) * 10}g 就能抵掉。`);
  else items.push(`热量少了 ${r0(-dk)} kcal，这顿多配 ${Math.round(-dk / 1.3 / 10) * 10}g 米饭。`);
  if (dp < -12) items.push(`<span class="up">蛋白少了 ${r0(-dp)}g</span>，多加 1 勺蛋白粉（约 24g）。`);
  else if (dp < -4) items.push(`<span class="up">蛋白少了 ${r0(-dp)}g</span>，加 1 个鸡蛋（约 6g）基本补上。`);
  else items.push(`<span class="ok">蛋白够了</span>，计划里这餐是 ${t.p}g。`);
  items.push(`碳水占全天 ${r0(s.c / DAY.c * 100)}%，脂肪占全天 ${r0(s.f / DAY.f * 100)}%。`);
  return items;
}
function renderDetail(el, r) {
  const n = st.serv[r.id] ?? r.base ?? 1, k = n / (r.base || 1), s = perServing(r);
  const slot = st.slot[r.id] ?? (SLOT_BY_NAME[r.slot] ? r.slot : "晚餐");
  el.innerHTML = `<article class="${catCls(r.cat)}">
    <button class="back" data-act="back">← 全部食谱</button>
    <div class="rhero">
      <div>
        <div class="cl"><span class="dot"></span>${esc(r.cat)}</div>
        <h2>${esc(r.name)}</h2>
        <div class="sub">${esc(r.sub || "")}</div>
        <div class="meta">
          <span>耗时 <b>${esc(r.mins)}</b> 分钟</span>
          ${r.diff ? `<span>难度 <b>${esc(r.diff)}</b></span>` : ""}
          ${r.batch ? `<span>能一次做几顿</span>` : ""}
          ${r.yield ? `<span>${esc(r.yield)}</span>` : ""}
          <span>份数 <span class="stepper"><button data-act="serv" data-v="-1" aria-label="减少一份">−</button><span>${n}</span><button data-act="serv" data-v="1" aria-label="增加一份">+</button></span></span>
        </div>
      </div>
      <div class="rbtns"><button class="go" data-act="cook">开始做饭</button><button class="btn" data-act="plan">排进菜单</button><button class="btn" data-act="editrecipe">编辑</button></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="k">热量</div><div class="v">${r0(s.kcal)}<small>kcal</small></div><div class="s">全天 ${r0(s.kcal / DAY.kcal * 100)}%</div></div>
      <div class="stat"><div class="k"><i style="background:var(--p)"></i>蛋白</div><div class="v">${r0(s.p)}<small>g</small></div><div class="s">全天 155–190g</div></div>
      <div class="stat"><div class="k"><i style="background:var(--c)"></i>碳水</div><div class="v">${r0(s.c)}<small>g</small></div><div class="s">全天 390g</div></div>
      <div class="stat"><div class="k"><i style="background:var(--f)"></i>脂肪</div><div class="v">${r0(s.f)}<small>g</small></div><div class="s">全天 80g</div></div>
    </div>
    <div class="est">以上是每一份的量，按常见食材数据估算。</div>
    <div class="card mtop">
      <div class="cmp-head">当作 <select data-chg="slot" aria-label="当作哪一餐">${["早餐", "午餐", "练后", "晚餐", "睡前", "自由餐"].map(o => `<option ${o === slot ? "selected" : ""}>${o}</option>`).join("")}</select> 吃，和计划比：</div>
      <ul>${compare(s, slot).map(x => `<li>${x}</li>`).join("")}</ul>
    </div>
    ${r.opt ? `<div class="opt"><b>健身版改法：</b>${esc(r.opt)}</div>` : ""}
    <div class="rcols">
      <div class="card"><h3>食材 · ${n} 份</h3>
        <table class="ing"><tbody>${(r.ing || []).map(i => `<tr><td>${esc(i.n)}${i.note ? `<span class="note">${esc(i.note)}</span>` : ""}</td><td class="amt">${amt(i, k)}${i.cnt ? `<span class="note">约 ${r0(i.g * k)}g</span>` : ""}</td></tr>`).join("")}</tbody></table>
      </div>
      <div class="card"><h3>步骤</h3>
        <ol class="steps">${(r.steps || []).map(x => `<li><div>${fillText(r, x.t, k)}${x.timer ? `<span class="tmr">⏱ ${tLabel(x.timer)}</span>` : ""}</div></li>`).join("")}</ol>
        ${r.tips ? `<div class="tip">${esc(r.tips)}</div>` : ""}
        ${r.source ? `<div class="tip"><a class="srclink" href="${esc(r.source)}" target="_blank" rel="noopener">${/douyin/.test(r.source) ? "看原视频" : "看参考做法"}（${esc(r.sourceName || "来源")}）</a></div>` : ""}
      </div>
    </div>
  </article>`;
}
actions.rcat = el => { st.cat = el.dataset.v; ui.rerender(); };
actions.rpro = el => { st.pro = st.pro === el.dataset.v ? null : el.dataset.v; ui.rerender(); };
changes.q = el => { st.q = el.value; ui.rerender(); };
actions.open = (el, e) => { e?.preventDefault(); st.edit = null; ui.go("recipes", el.dataset.id); };
actions.back = () => { ui.go("recipes"); };
actions.serv = el => { const r = store.byId[ui.sel]; const n = (st.serv[r.id] ?? r.base ?? 1) + (+el.dataset.v); if (n >= 1 && n <= 12) { st.serv[r.id] = n; ui.rerender(); } };
changes.slot = el => { st.slot[ui.sel] = el.value; ui.rerender(); };

/* 排进菜单 */
actions.plan = () => {
  const r = store.byId[ui.sel]; if (!r) return;
  const defSlot = r.cat === "甜品" ? "x" : SLOT_BY_NAME[r.slot] ? SLOT_BY_NAME[r.slot].k : "d";
  const td = (new Date().getDay() + 6) % 7;
  modal(`<form><p class="mt">把「${esc(r.name)}」排进哪一格？</p>
    <div class="two"><label>哪周<select name="w"><option value="0">本周</option><option value="1">下周</option></select></label>
    <label>哪天<select name="d">${DAYS.map((x, i) => `<option value="${i}" ${i === td ? "selected" : ""}>${x}</option>`).join("")}</select></label></div>
    <label>哪一餐<select name="k">${SLOTS.map(s => `<option value="${s.k}" ${s.k === defSlot ? "selected" : ""}>${s.name}</option>`).join("")}</select></label>
    <p class="hint">会替换那一格原来的菜，并锁住，随机生成不会再换掉它。</p>
    <div class="two mtop"><button type="button" class="btn" data-close>取消</button><button class="go" type="submit">排进去</button></div></form>`,
    (box, close) => box.querySelector("form").onsubmit = e => {
      e.preventDefault(); const f = e.target;
      const w = week(addDays(thisWeek(), 7 * +f.w.value), true), d = w.days[+f.d.value], k = f.k.value;
      if (d[k]?.custom?.paid) { toast("那一格已经记过账了，换一格"); return; }
      const slot = SLOTS.find(s => s.k === k);
      const s = perServing(r), rice = slot.rice && !(r.ing || []).some(i => /米饭/.test(i.n)) && r.cat !== "面食" ? Math.max(0, Math.min(350, Math.round((slot.t.kcal - s.kcal) / 1.3 / 50) * 50)) : 0;
      d[k] = { r: r.id, rice, lock: true };
      saveDoc("menu"); close(); toast(`排进${+f.w.value ? "下周" : "本周"}${DAYS[+f.d.value]}${slot.name}了`);
    });
};

/* ---------- 做饭模式 ---------- */
const ck = { r: null, i: 0, k: 1, left: 0, tick: null, lock: null };
async function wake(on) {
  try {
    if (on && "wakeLock" in navigator) ck.lock = await navigator.wakeLock.request("screen");
    if (!on && ck.lock) { await ck.lock.release(); ck.lock = null; }
  } catch (e) {}
}
function stopT() { clearInterval(ck.tick); ck.tick = null; }
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)();
  [0, .35, .7].forEach(t => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination);
    g.gain.setValueAtTime(.15, a.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + t + .25); o.start(a.currentTime + t); o.stop(a.currentTime + t + .3); }); } catch (e) {} }
function renderCook() {
  const r = ck.r, x = r.steps[ck.i], last = ck.i === r.steps.length - 1, uses = usedIn(r, x.t);
  $("#cook").innerHTML = `
    <div class="cook-top"><div class="t">${esc(r.name)}</div><button class="btn" data-act="cookclose">退出</button></div>
    <div class="prog">${r.steps.map((_, j) => `<span class="${j <= ck.i ? "on" : ""}"></span>`).join("")}</div>
    <div class="cook-body">
      <div class="cook-n">第 ${ck.i + 1} 步 / 共 ${r.steps.length} 步</div>
      <div class="cook-text">${fillText(r, x.t, ck.k)}</div>
      ${uses.length ? `<div class="uses">${uses.map(i => `<span>${esc(i.n)}<em>${amt(i, ck.k)}</em></span>`).join("")}</div>` : ""}
      ${x.timer ? `<div class="timer"><span class="clock ${ck.left === 0 ? "done" : ""}" id="clock">${fmtTime(ck.left)}</span>
        <button class="${ck.tick ? "btn" : "go"}" data-act="cooktimer">${ck.tick ? "暂停" : ck.left === 0 ? "重新计时" : ck.left < x.timer ? "继续" : "开始计时"}</button></div>` : ""}
    </div>
    <div class="cook-nav"><button class="btn" data-act="cookprev" ${ck.i === 0 ? "disabled" : ""}>上一步</button><button class="go" data-act="cooknext">${last ? "做完了" : "下一步"}</button></div>`;
}
function closeCook() { stopT(); $("#cook").hidden = true; document.body.classList.remove("noscroll"); wake(false); }
function step(d) { const n = ck.i + d; if (n < 0) return; if (n >= ck.r.steps.length) { closeCook(); return; } stopT(); ck.i = n; ck.left = ck.r.steps[n].timer || 0; renderCook(); }
actions.cook = () => {
  const r = store.byId[ui.sel]; if (!r || !(r.steps || []).length) { toast("这道还没有步骤"); return; }
  ck.r = r; ck.i = 0; ck.k = (st.serv[r.id] ?? r.base ?? 1) / (r.base || 1); stopT(); ck.left = r.steps[0].timer || 0;
  const c = $("#cook"); c.className = "cook " + catCls(r.cat); c.hidden = false; document.body.classList.add("noscroll");
  renderCook(); wake(true);
};
actions.cookclose = closeCook;
actions.cooknext = () => step(1);
actions.cookprev = () => step(-1);
actions.cooktimer = () => {
  if (ck.tick) { stopT(); renderCook(); return; }
  if (ck.left <= 0) ck.left = ck.r.steps[ck.i].timer;
  ck.tick = setInterval(() => { ck.left--; if (ck.left <= 0) { ck.left = 0; stopT(); beep(); renderCook(); return; } const c = $("#clock"); if (c) c.textContent = fmtTime(ck.left); }, 1000);
  renderCook();
};
document.addEventListener("keydown", e => {
  if ($("#cook")?.hidden !== false) return;
  if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); if (e.key === "Escape") closeCook();
});

/* ---------- 自己加 / 改 ---------- */
function knownNutrition() {
  const m = new Map();
  for (const r of store.recipes) for (const i of r.ing || []) if (!m.has(i.n) && (i.kcal || i.p || i.c || i.f)) m.set(i.n, { kcal: i.kcal, p: i.p, c: i.c, f: i.f });
  return m;
}
function blank() { return { id: "", name: "", sub: "", cat: "家常菜", diff: "简单", mins: 30, base: 2, batch: false, pro: [], slot: "晚餐", ing: [{ n: "", g: 0, kcal: 0, p: 0, c: 0, f: 0 }], steps: [], tips: "", opt: "", source: "", sourceName: "" }; }
function ingRow(i, idx) {
  const v = x => x === undefined || x === null ? "" : x;
  return `<tr data-row="${idx}"><td><input list="ingnames" data-chg="ingname" name="n" value="${esc(i.n)}" placeholder="食材"></td>
    <td><input name="g" type="number" min="0" step="1" value="${v(i.g)}" placeholder="克"></td>
    <td><input name="cnt" type="number" min="0" step="0.5" value="${v(i.cnt)}" placeholder="个数"></td>
    <td><input name="unit" value="${esc(i.unit || "")}" placeholder="单位"></td>
    <td><input name="kcal" type="number" min="0" step="1" value="${v(i.kcal)}"></td>
    <td><input name="p" type="number" min="0" step="0.1" value="${v(i.p)}"></td>
    <td><input name="c" type="number" min="0" step="0.1" value="${v(i.c)}"></td>
    <td><input name="f" type="number" min="0" step="0.1" value="${v(i.f)}"></td>
    <td><input name="note" value="${esc(i.note || "")}" placeholder="备注"></td>
    <td><button type="button" class="x" data-act="ingdel" aria-label="删掉这行">×</button></td></tr>`;
}
function editHtml(r) {
  const known = knownNutrition();
  return `<div class="pagehead"><h1>${r.id ? "编辑食谱" : "自己加一道"}</h1><div class="acts"><button class="btn" data-act="editcancel">取消</button></div></div>
  <form class="card editf" data-form="recipe" autocomplete="off">
    <div class="grid3">
      <label>菜名<input name="name" value="${esc(r.name)}" required></label>
      <label>一句话说明<input name="sub" value="${esc(r.sub || "")}" placeholder="比如：鸡腿肉版，碗汁提前兑好"></label>
      <label>分类<select name="cat">${CATS.map(c => `<option ${c === r.cat ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label>难度<select name="diff">${DIFFS.map(c => `<option ${c === r.diff ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label>耗时（分钟）<input name="mins" type="number" min="1" value="${esc(r.mins)}"></label>
      <label>这份食材做几份<input name="base" type="number" min="1" value="${esc(r.base || 1)}"></label>
      <label>一般当作<select name="slot">${["早餐", "午餐", "练后", "晚餐", "睡前", "加餐"].map(c => `<option ${c === r.slot ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" name="batch" ${r.batch ? "checked" : ""}> 能一次做几顿</label>
      <div><div class="flab">主要蛋白</div><div class="seg">${PROS.map(p => `<label class="chipc"><input type="checkbox" name="pro" value="${p}" ${(r.pro || []).includes(p) ? "checked" : ""}>${p}</label>`).join("")}</div></div>
    </div>
    <h3>食材 <span class="hint">营养填每 100 克的数；输入之前用过的食材名会自动带出营养</span></h3>
    <div class="scroll"><table class="ingedit"><thead><tr><th>食材</th><th>克数</th><th>个数</th><th>单位</th><th>kcal</th><th>蛋白</th><th>碳水</th><th>脂肪</th><th>备注</th><th></th></tr></thead>
      <tbody id="ingrows">${(r.ing || []).map(ingRow).join("")}</tbody></table></div>
    <datalist id="ingnames">${[...known.keys()].map(n => `<option value="${esc(n)}">`).join("")}</datalist>
    <button type="button" class="btn mtop" data-act="ingadd">加一行食材</button>
    <h3>步骤 <span class="hint">一行一步；某一步要计时，在行尾写「⏱5分钟」</span></h3>
    <textarea name="steps" rows="8">${esc((r.steps || []).map(s => s.t.replace(/\{(\d+)\}/g, (m, n) => r.ing?.[+n] ? "{" + r.ing[+n].n + "}" : m) + (s.timer ? ` ⏱${r1(s.timer / 60)}分钟` : "")).join("\n"))}</textarea>
    <p class="hint">在步骤里把食材名写在花括号里，比如「{鸡胸肉}切丁」，页面上会显示成「鸡胸肉 400g 切丁」，跟着份数变。</p>
    <div class="grid2">
      <label>小贴士<textarea name="tips" rows="3">${esc(r.tips || "")}</textarea></label>
      <label>健身版改法<textarea name="opt" rows="3">${esc(r.opt || "")}</textarea></label>
      <label>来源链接<input name="source" value="${esc(r.source || "")}" placeholder="抖音或网页链接"></label>
      <label>来源名字<input name="sourceName" value="${esc(r.sourceName || "")}"></label>
    </div>
    <div class="acts mtop"><button class="go" type="submit">保存</button>${r.id ? `<button type="button" class="btn danger" data-act="recipedel">从食谱库拿掉</button>` : ""}</div>
  </form>`;
}
actions.newrecipe = () => { st.edit = blank(); ui.rerender(); window.scrollTo(0, 0); };
actions.editrecipe = () => { st.edit = JSON.parse(JSON.stringify(store.byId[ui.sel])); ui.rerender(); window.scrollTo(0, 0); };
actions.editcancel = () => { st.edit = null; ui.rerender(); };
actions.ingadd = () => { const tb = $("#ingrows"); tb.insertAdjacentHTML("beforeend", ingRow({ n: "" }, tb.children.length)); tb.lastElementChild.querySelector("input").focus(); };
actions.ingdel = el => el.closest("tr").remove();
changes.ingname = el => {
  const k = knownNutrition().get(el.value.trim()); if (!k) return;
  const tr = el.closest("tr");
  for (const f of ["kcal", "p", "c", "f"]) { const i = tr.querySelector(`[name=${f}]`); if (!i.value || +i.value === 0) i.value = k[f] ?? ""; }
};
actions.recipedel = async el => {
  if (!el.dataset.armed) { el.dataset.armed = "1"; el.textContent = "再点一次确认拿掉"; return; }
  await hideRecipe(st.edit.id); st.edit = null; ui.go("recipes"); toast("拿掉了");
};
export async function submitRecipe(form) {
  const r = st.edit, num = v => v === "" ? undefined : +v;
  const ing = $$("#ingrows tr").map(tr => {
    const g = n => tr.querySelector(`[name=${n}]`).value;
    const o = { n: g("n").trim(), g: +g("g") || 0, kcal: +g("kcal") || 0, p: +g("p") || 0, c: +g("c") || 0, f: +g("f") || 0 };
    if (num(g("cnt"))) { o.cnt = +g("cnt"); o.unit = g("unit").trim() || "个"; }
    if (g("note").trim()) o.note = g("note").trim();
    return o;
  }).filter(i => i.n);
  if (!form.name.value.trim()) { toast("先填菜名"); return; }
  if (!ing.length) { toast("至少填一样食材"); return; }
  const steps = form.steps.value.split("\n").map(s => s.trim()).filter(Boolean).map(line => {
    let timer; line = line.replace(/\s*⏱\s*([\d.]+)\s*分钟?\s*$/, (m, v) => { timer = Math.round(+v * 60); return ""; });
    const t = line.replace(/\{([^}]+)\}/g, (m, name) => { const i = ing.findIndex(x => x.n === name.trim()); return i >= 0 ? `{${i}}` : name; });
    return timer ? { t, timer } : { t };
  });
  const out = { ...r, name: form.name.value.trim(), sub: form.sub.value.trim(), cat: form.cat.value, diff: form.diff.value,
    mins: +form.mins.value || 30, base: +form.base.value || 1, slot: form.slot.value, batch: form.batch.checked,
    pro: $$("[name=pro]:checked").map(x => x.value), ing, steps, tips: form.tips.value.trim(), opt: form.opt.value.trim(),
    source: form.source.value.trim(), sourceName: form.sourceName.value.trim(), mine: true };
  if (!out.id) { out.id = uid("my-"); out.order = 900; out.v = 1; }
  const ok = await saveRecipe(out);
  if (ok) { st.edit = null; ui.go("recipes", out.id); toast("存好了"); }
}
