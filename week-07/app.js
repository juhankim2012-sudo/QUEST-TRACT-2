const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const colorEl = document.getElementById("color");
const sizeEl = document.getElementById("size");
const nameEl = document.getElementById("name");
const titleEl = document.getElementById("title");
const msg = document.getElementById("msg");
const listEl = document.getElementById("list");
const penBtn = document.getElementById("pen");
const eraserBtn = document.getElementById("eraser");
const undoBtn = document.getElementById("undo");

// ---- 기능 1: 이름 기억하기 ----
nameEl.value = Store.getName();
nameEl.addEventListener("change", () => Store.setName(nameEl.value.trim()));

// ---- 그림판 ----
function blank() {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
blank();

// ---- 기능 2: 되돌리기 · 지우개 ----
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

document.getElementById("clear").onclick = () => { remember(); blank(); };

let drawing = false, last = null;
function pos(e) {
  const r = canvas.getBoundingClientRect();
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

// ---- 올리기 ----
document.getElementById("post").onclick = () => {
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
  msg.textContent = "올렸어요!";
  titleEl.value = ""; blank(); history.length = 0; undoBtn.disabled = true; render();
};

// ---- 갤러리 ----
function fmt(t) { return new Date(t).toLocaleString("ko-KR"); }

// ---- 기능 4: 이름별로 모아 보기 ----
let onlyAuthor = null; // null 이면 전부 보기
const filterEl = document.getElementById("filter");
function showOnly(author) { onlyAuthor = author; render(); }

function render() {
  const all = Store.list();
  if (onlyAuthor !== null && !all.some((d) => d.author === onlyAuthor)) onlyAuthor = null; // 그림이 다 지워졌으면 전체로
  const items = onlyAuthor === null ? all : all.filter((d) => d.author === onlyAuthor);

  filterEl.textContent = "";
  if (onlyAuthor !== null) {
    const label = document.createElement("span");
    label.textContent = (onlyAuthor || "이름 없음") + " 님의 그림만 보는 중 (" + items.length + "개) ";
    const back = document.createElement("button"); back.type = "button"; back.textContent = "전체 보기";
    back.onclick = () => showOnly(null);
    filterEl.append(label, back);
  }

  listEl.textContent = "";
  if (!all.length) { listEl.textContent = "아직 올라온 그림이 없어요. 첫 그림을 올려 보세요!"; return; }
  for (const d of items) {
    const card = document.createElement("div"); card.className = "card";
    const h = document.createElement("h3"); h.textContent = d.title;
    const meta = document.createElement("div"); meta.className = "meta";
    const who = document.createElement("button"); who.type = "button"; who.className = "who";
    who.textContent = d.author || "이름 없음";
    who.title = "이 사람의 그림만 보기";
    who.onclick = () => showOnly(d.author);
    meta.append(who, " · " + fmt(d.created));
    const img = document.createElement("img"); img.src = d.image; img.alt = d.title;
    card.append(h, img, meta);

    for (const c of d.comments) {
      const p = document.createElement("div"); p.className = "comment";
      const who = document.createElement("strong"); who.textContent = (c.author || "이름 없음") + " ";
      const body = document.createElement("span"); body.textContent = c.text + " ";
      const s = document.createElement("small"); s.textContent = fmt(c.created);
      p.append(who, body, s); card.append(p);
    }

    const form = document.createElement("form"); form.className = "cform";
    const input = document.createElement("input"); input.placeholder = "댓글 쓰기"; input.maxLength = 200;
    const btn = document.createElement("button"); btn.textContent = "등록";
    form.append(input, btn);
    form.onsubmit = (e) => {
      e.preventDefault();
      const t = input.value.trim(); if (!t) return;
      const author = nameEl.value.trim();
      if (!author) { msg.textContent = "댓글을 쓰려면 위에 이름을 먼저 써 주세요."; nameEl.focus(); return; }
      Store.setName(author);
      Store.addComment(d.id, author, t); render();
    };

    // ---- 기능 3: 그림 내려받기 ----
    const actions = document.createElement("div"); actions.className = "actions";
    const dl = document.createElement("a"); dl.className = "btn"; dl.textContent = "내려받기";
    dl.href = d.image; dl.download = (d.title.replace(/[\\/:*?"<>|]/g, "") || "그림") + ".png";
    const del = document.createElement("button"); del.type = "button"; del.textContent = "그림 지우기";
    del.onclick = () => { if (confirm("이 그림을 지울까요?")) { Store.removeDrawing(d.id); render(); } };
    actions.append(dl, del);

    card.append(form, actions);
    listEl.append(card);
  }
}
render();
