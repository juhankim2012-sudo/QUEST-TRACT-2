const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const colorEl = $("color");
const sizeEl = $("size");
const nameEl = $("name");
const titleEl = $("title");
const msg = $("msg");
const penBtn = $("pen");
const eraserBtn = $("eraser");
const undoBtn = $("undo");
const detail = $("detail");

// ================= 화면 바꾸기 (주소 끝의 # 로 구분) =================
//   #/        갤러리
//   #/draw    그리기
//   #/u/이름   그 사람의 공간
const views = { gallery: $("view-gallery"), draw: $("view-draw"), profile: $("view-profile") };
// ================= 움직임 (밀려 나가고 들어오기) =================
// - 오른쪽에 있는 요소는 오른쪽으로, 왼쪽에 있는 요소는 왼쪽으로 밀려 나가고,
//   들어올 때도 자기 쪽에서 들어온다. (가운데쯤 있는 요소는 화면이 가는 방향을 따른다)
// - 요소마다 아주 조금씩 늦게 출발하고, 움직이는 쪽으로 살짝 기울어진다.
// - 처음에는 서서히 움직이기 시작해서 점점 빨라진다.
const EASE = "cubic-bezier(.7, 0, .3, 1)";
const DURATION = 480;   // 한 요소가 움직이는 시간(ms)
const STEP = 35;        // 다음 요소가 늦게 출발하는 간격(ms)
const MAX_DELAY = 280;  // 아무리 많아도 이 이상은 늦지 않게
const LEAN = 8;         // 기울어지는 정도(도)
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// mode: "out" = 밀려 나감 / "in" = 밀려 들어옴
// fallback: 가운데쯤 있는 요소가 향할(올) 쪽 (1 = 오른쪽, -1 = 왼쪽)
// bound: 움직이는 범위(없으면 화면 전체). 창 안에서는 범위를 주고 흐려지게 한다.
function fly(els, mode, fallback, bound) {
  const b = bound || { left: 0, right: window.innerWidth };
  const mid = (b.left + b.right) / 2;
  const near = (b.right - b.left) * 0.05; // 정확히 가운데쯤인 요소만 "화면 방향" 을 따름
  const fade = Boolean(bound);
  const list = els
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0);
  return list.map(({ el, r }, i) => {
    const center = r.left + r.width / 2;
    const side = Math.abs(center - mid) < near ? fallback : (center > mid ? 1 : -1);
    const far = side > 0 ? b.right - r.left + 40 : -(r.right - b.left + 40);
    const moving = mode === "out" ? side : -side;            // 실제로 움직이는 방향
    const away = `translateX(${far}px) skewX(${moving > 0 ? -LEAN : LEAN}deg)`;
    const home = "translateX(0px) skewX(0deg)";
    const frames = mode === "out"
      ? [{ transform: home, opacity: 1 }, { transform: away, opacity: fade ? 0 : 1 }]
      : [{ transform: away, opacity: fade ? 0 : 1 }, { transform: home, opacity: 1 }];
    return el.animate(frames, {
      duration: DURATION,
      delay: Math.min(i * STEP, MAX_DELAY),
      easing: EASE,
      fill: mode === "out" ? "forwards" : "backwards",
    });
  });
}
const allDone = (anims) => Promise.all(anims.map((a) => a.finished.catch(() => {})));

// 한 화면 안에서 따로 움직일 요소들 (격자는 그림 한 칸씩)
function targets(view) {
  return [...view.children].flatMap((c) => (c.classList.contains("grid") ? [...c.children] : [c]));
}

// 깊이: 갤러리(0) → 그리기·사람의 공간(1). 깊어지면 앞으로(왼쪽으로 나가고 오른쪽에서 들어옴), 돌아가면 반대.
const depth = { gallery: 0, draw: 1, profile: 1 };
let current = null;
let finishSlide = null;

function show(name) {
  if (finishSlide) finishSlide(); // 움직이는 중이면 먼저 끝내기
  const next = views[name];
  const from = current;
  const prev = from ? views[from] : null;
  current = name;
  window.scrollTo(0, 0);

  if (!prev || from === name || reduceMotion()) {
    for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
    return;
  }
  const forward = depth[name] >= depth[from];
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name && k !== from;
  prev.classList.add("leaving-view"); // 겹쳐 놓고 같이 움직이기
  const anims = [
    ...fly(targets(prev), "out", forward ? -1 : 1),
    ...fly(targets(next), "in", forward ? 1 : -1),
  ];
  let timer = null;
  const mine = () => {
    clearTimeout(timer);
    anims.forEach((a) => a.cancel());
    prev.hidden = true;
    prev.classList.remove("leaving-view");
    if (finishSlide === mine) finishSlide = null;
  };
  finishSlide = mine;
  allDone(anims).then(() => { if (finishSlide === mine) mine(); });
  timer = setTimeout(() => { if (finishSlide === mine) mine(); }, 1800); // 혹시 끝 신호가 안 와도 정리
}

function go(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}
function route() {
  if (detail.open) detail.close();
  const h = location.hash;
  if (h === "#/draw") {
    if (!nameEl.value) nameEl.value = Store.getName();
    msg.textContent = "";
    show("draw");
  } else if (h.startsWith("#/u/")) {
    let who = "";
    try { who = decodeURIComponent(h.slice(4)); } catch { go("#/"); return; }
    renderProfile(who);
    show("profile");
  } else {
    renderGallery();
    show("gallery");
  }
}
window.addEventListener("hashchange", route);
$("go-draw").onclick = () => go("#/draw");

// ================= 기능 1: 이름 기억하기 =================
nameEl.value = Store.getName();
nameEl.addEventListener("change", () => Store.setName(nameEl.value.trim()));

// ================= 그림판 =================
function blank() {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
blank();

// ================= 기능 2: 되돌리기 · 지우개 =================
const history = [];
const MAX_HISTORY = 30;
function remember() {
  history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (history.length > MAX_HISTORY) history.shift();
  undoBtn.disabled = false;
}
function undo() {
  const snap = history.pop();
  if (snap) ctx.putImageData(snap, 0, 0);
  undoBtn.disabled = history.length === 0;
}
undoBtn.disabled = true;
undoBtn.onclick = undo;

let erasing = false;
function setTool(isEraser) {
  erasing = isEraser;
  penBtn.setAttribute("aria-pressed", String(!isEraser));
  eraserBtn.setAttribute("aria-pressed", String(isEraser));
}
penBtn.onclick = () => setTool(false);
eraserBtn.onclick = () => setTool(true);

$("clear").onclick = () => { remember(); blank(); };

let drawing = false, last = null;
function pos(e) {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return { x: 0, y: 0 };
  return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
}
canvas.addEventListener("pointerdown", (e) => {
  drawing = true; remember(); last = pos(e);
  canvas.setPointerCapture(e.pointerId);
  stroke(last, last);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const p = pos(e); stroke(last, p); last = p;
});
["pointerup", "pointercancel"].forEach((n) => canvas.addEventListener(n, () => (drawing = false)));
function stroke(a, b) {
  ctx.strokeStyle = erasing ? "#fff" : colorEl.value;
  ctx.lineWidth = erasing ? Number(sizeEl.value) * 2 : sizeEl.value;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}

// ================= 올리기 =================
let pendingToast = ""; // 갤러리로 돌아온 뒤 보여 줄 알림
$("post").onclick = () => {
  const author = nameEl.value.trim();
  if (!author) { msg.textContent = "이름을 먼저 써 주세요."; nameEl.focus(); return; }
  Store.setName(author);
  const title = titleEl.value.trim() || "제목 없음";
  try {
    Store.addDrawing(author, title, canvas.toDataURL("image/png"));
  } catch {
    msg.textContent = "저장하지 못했어요. 브라우저 저장 공간이 가득 찼을 수 있어요.";
    return;
  }
  titleEl.value = ""; blank(); history.length = 0; undoBtn.disabled = true;
  pendingToast = "올렸어요!";
  go("#/");
};

// ================= 갤러리 / 한 사람의 공간 =================
function fmt(t) { return new Date(t).toLocaleString("ko-KR"); }
function shownName(a) { return a || "이름 없음"; }

// 그림 한 칸 (작은 그림 + 제목 + 이름 + 댓글 수)
function makeItem(d) {
  const item = document.createElement("div"); item.className = "item";

  const thumb = document.createElement("button"); thumb.type = "button"; thumb.className = "thumb";
  thumb.title = "크게 보기";
  const img = document.createElement("img"); img.src = d.image; img.alt = d.title; img.loading = "lazy";
  thumb.append(img);
  thumb.onclick = () => openDetail(d.id);

  const h = document.createElement("h3"); h.textContent = d.title;

  const sub = document.createElement("div"); sub.className = "sub";
  // ---- 기능 4: 이름을 누르면 그 사람의 공간으로 ----
  const who = document.createElement("button"); who.type = "button"; who.className = "who";
  who.textContent = shownName(d.author);
  who.title = "이 사람의 공간 보기";
  who.onclick = () => go("#/u/" + encodeURIComponent(d.author || ""));
  const cnt = document.createElement("span"); cnt.textContent = "댓글 " + d.comments.length;
  sub.append(who, cnt);

  item.append(thumb, h, sub);
  return item;
}

function fillGrid(el, items, emptyText) {
  el.textContent = "";
  if (!items.length) {
    const p = document.createElement("p"); p.className = "empty"; p.textContent = emptyText;
    el.append(p); return;
  }
  for (const d of items) el.append(makeItem(d));
}

function renderGallery() {
  $("toast").textContent = pendingToast;
  pendingToast = "";
  fillGrid($("grid"), Store.list(), "아직 올라온 그림이 없어요. 위의 '그리기' 단추로 첫 그림을 올려 보세요!");
}

function renderProfile(author) {
  const mine = Store.list().filter((d) => d.author === author);
  const comments = mine.reduce((n, d) => n + d.comments.length, 0);
  const head = $("profile-head");
  head.textContent = "";
  const av = document.createElement("div"); av.className = "avatar";
  av.textContent = shownName(author).slice(0, 1);
  const box = document.createElement("div");
  const h = document.createElement("h2");
  h.textContent = shownName(author) + (author && author === Store.getName() ? " (나)" : "");
  const p = document.createElement("p");
  p.textContent = "그림 " + mine.length + "개 · 받은 댓글 " + comments + "개";
  box.append(h, p);
  head.append(av, box);
  fillGrid($("profile-grid"), mine, "이 이름으로 올린 그림이 없어요.");
}

// ================= 그림 크게 보기 + 댓글 =================
let openId = null;
let closing = null; // 닫는 모션이 진행 중이면 그것을 끝내는 함수
function openDetail(id) {
  openId = id;
  renderDetail();
  if (detail.open) return;
  detail.showModal();
  const dr = detail.getBoundingClientRect();
  fly([...detail.children], "in", 1, { left: dr.left, right: dr.right }); // 창 안의 요소들이 오른쪽에서 밀려 들어옴
}
detail.addEventListener("close", () => { openId = null; if (closing) closing(); });
// 창 바깥(어두운 곳)을 누르면 닫기
detail.addEventListener("click", (e) => { if (e.target === detail) closeDetail(); });
detail.addEventListener("cancel", (e) => { e.preventDefault(); closeDetail(); }); // Esc 키

// 닫을 때도 요소들이 오른쪽으로 밀려 나간 뒤 닫기
function closeDetail() {
  if (!detail.open || closing) return;
  if (reduceMotion()) { detail.close(); return; }
  const dr = detail.getBoundingClientRect();
  const anims = fly([...detail.children], "out", 1, { left: dr.left, right: dr.right });
  detail.classList.add("leaving");
  let timer = null;
  const mine = () => {
    clearTimeout(timer);
    anims.forEach((a) => a.cancel());
    detail.classList.remove("leaving");
    if (closing === mine) closing = null;
    if (detail.open) detail.close();
  };
  closing = mine;
  allDone(anims).then(() => { if (closing === mine) mine(); });
  timer = setTimeout(() => { if (closing === mine) mine(); }, 1800);
}


function renderDetail() {
  const d = Store.list().find((x) => x.id === openId);
  detail.textContent = "";
  if (!d) { if (detail.open) detail.close(); return; }

  const h = document.createElement("h3"); h.textContent = d.title;
  const img = document.createElement("img"); img.src = d.image; img.alt = d.title;
  const meta = document.createElement("div"); meta.className = "meta";
  const who = document.createElement("button"); who.type = "button"; who.className = "who";
  who.textContent = shownName(d.author);
  who.onclick = () => go("#/u/" + encodeURIComponent(d.author || ""));
  meta.append(who, " · " + fmt(d.created));
  detail.append(h, img, meta);

  for (const c of d.comments) {
    const p = document.createElement("div"); p.className = "comment";
    const by = document.createElement("strong"); by.textContent = shownName(c.author) + " ";
    const body = document.createElement("span"); body.textContent = c.text + " ";
    const s = document.createElement("small"); s.textContent = fmt(c.created);
    p.append(by, body, s); detail.append(p);
  }

  const form = document.createElement("form"); form.className = "cform";
  const cname = document.createElement("input"); cname.className = "cname"; cname.placeholder = "내 이름";
  cname.maxLength = 20; cname.value = Store.getName();
  const input = document.createElement("input"); input.placeholder = "댓글 쓰기"; input.maxLength = 200;
  const btn = document.createElement("button"); btn.textContent = "등록";
  const err = document.createElement("div"); err.setAttribute("role", "status");
  form.append(cname, input, btn);
  form.onsubmit = (e) => {
    e.preventDefault();
    const t = input.value.trim(); if (!t) return;
    const author = cname.value.trim();
    if (!author) { err.textContent = "이름을 먼저 써 주세요."; cname.focus(); return; }
    Store.setName(author);
    Store.addComment(d.id, author, t);
    renderDetail();
    refreshBehind();
  };

  // ================= 기능 3: 그림 내려받기 =================
  const actions = document.createElement("div"); actions.className = "actions";
  const dl = document.createElement("a"); dl.className = "btn"; dl.textContent = "내려받기";
  dl.href = d.image; dl.download = (d.title.replace(/[\\/:*?"<>|]/g, "") || "그림") + ".png";
  const del = document.createElement("button"); del.type = "button"; del.textContent = "그림 지우기";
  del.onclick = () => {
    if (!confirm("이 그림을 지울까요?")) return;
    Store.removeDrawing(d.id);
    closeDetail();
    refreshBehind();
  };
  const close = document.createElement("button"); close.type = "button"; close.textContent = "닫기";
  close.onclick = () => closeDetail();
  actions.append(dl, del, close);

  detail.append(form, err, actions);
}

// 창 뒤의 화면(댓글 수 등)을 새로 그림
function refreshBehind() {
  const h = location.hash;
  if (h.startsWith("#/u/")) {
    try { renderProfile(decodeURIComponent(h.slice(4))); } catch { /* 무시 */ }
  } else if (h !== "#/draw") {
    renderGallery();
  }
}

route();
