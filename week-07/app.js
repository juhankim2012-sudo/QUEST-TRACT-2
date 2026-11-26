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
function show(name) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
  window.scrollTo(0, 0);
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
function openDetail(id) {
  openId = id;
  renderDetail();
  if (!detail.open) detail.showModal();
}
detail.addEventListener("close", () => { openId = null; });
// 창 바깥(어두운 곳)을 누르면 닫기
detail.addEventListener("click", (e) => { if (e.target === detail) detail.close(); });

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
    detail.close();
    refreshBehind();
  };
  const close = document.createElement("button"); close.type = "button"; close.textContent = "닫기";
  close.onclick = () => detail.close();
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
