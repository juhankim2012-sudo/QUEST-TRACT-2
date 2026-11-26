const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const colorEl = document.getElementById("color");
const sizeEl = document.getElementById("size");
const titleEl = document.getElementById("title");
const msg = document.getElementById("msg");
const listEl = document.getElementById("list");

function blank() {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
blank();

let drawing = false, last = null;
function pos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
}
canvas.addEventListener("pointerdown", (e) => {
  drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId);
  stroke(last, last);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const p = pos(e); stroke(last, p); last = p;
});
["pointerup", "pointercancel"].forEach((n) => canvas.addEventListener(n, () => (drawing = false)));
function stroke(a, b) {
  ctx.strokeStyle = colorEl.value; ctx.lineWidth = sizeEl.value; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}
document.getElementById("clear").onclick = blank;

document.getElementById("post").onclick = () => {
  const title = titleEl.value.trim() || "제목 없음";
  try {
    Store.addDrawing(title, canvas.toDataURL("image/png"));
  } catch {
    msg.textContent = "저장하지 못했어요. 브라우저 저장 공간이 가득 찼을 수 있어요.";
    return;
  }
  msg.textContent = "갤러리에 올렸어요!";
  titleEl.value = ""; blank(); render();
};

function fmt(t) { return new Date(t).toLocaleString("ko-KR"); }

function render() {
  const items = Store.list();
  listEl.textContent = "";
  if (!items.length) { listEl.textContent = "아직 올라온 그림이 없어요. 첫 그림을 올려 보세요!"; return; }
  for (const d of items) {
    const card = document.createElement("div"); card.className = "card";
    const h = document.createElement("h3"); h.textContent = d.title;
    const img = document.createElement("img"); img.src = d.image; img.alt = d.title;
    const when = document.createElement("small"); when.textContent = fmt(d.created);
    card.append(h, img, document.createElement("br"), when);
    for (const c of d.comments) {
      const p = document.createElement("div"); p.className = "comment";
      p.textContent = c.text + " ";
      const s = document.createElement("small"); s.textContent = fmt(c.created);
      p.append(s); card.append(p);
    }
    const form = document.createElement("form"); form.className = "cform";
    const input = document.createElement("input"); input.placeholder = "댓글 쓰기"; input.maxLength = 200;
    const btn = document.createElement("button"); btn.textContent = "등록";
    form.append(input, btn);
    form.onsubmit = (e) => {
      e.preventDefault();
      const t = input.value.trim(); if (!t) return;
      Store.addComment(d.id, t); render();
    };
    const del = document.createElement("button"); del.type = "button"; del.textContent = "그림 지우기";
    del.onclick = () => { if (confirm("이 그림을 지울까요?")) { Store.removeDrawing(d.id); render(); } };
    card.append(form, del);
    listEl.append(card);
  }
}
render();
