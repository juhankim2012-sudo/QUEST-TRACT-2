// week-07 확인 도구
// 쓰는 법:  node week-07/check/check.js            (week-07 폴더 전체 확인)
//          node week-07/check/check.js week-07/폴더이름   (한 폴더만 확인)
// 따로 설치할 것 없음. Node.js 만 있으면 됨.

const fs = require("fs");
const path = require("path");

const CHECK_DIR = __dirname;
const target = path.resolve(process.argv[2] || path.join(CHECK_DIR, ".."));

let fails = 0;
let warns = 0;
const ok = (msg) => console.log("  ✅ " + msg);
const bad = (msg, fix) => { fails++; console.log("  ❌ " + msg + (fix ? "\n     → " + fix : "")); };
const warn = (msg, fix) => { warns++; console.log("  ⚠️  " + msg + (fix ? "\n     → " + fix : "")); };
const title = (t) => console.log("\n■ " + t);

// ---------- 파일 모으기 ----------
const TEXT_EXT = [".html", ".htm", ".js", ".mjs", ".css", ".json", ".webmanifest", ".md", ".txt", ".env"];
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const full = path.join(dir, name);
    if (full === CHECK_DIR) continue; // 확인 도구 자신은 빼고
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

if (!fs.existsSync(target)) {
  console.log("❌ 폴더를 찾을 수 없음: " + target);
  process.exit(1);
}

const all = walk(target);
const textFiles = all.filter((f) => TEXT_EXT.includes(path.extname(f).toLowerCase()) || path.basename(f).startsWith(".env"));
const read = (f) => fs.readFileSync(f, "utf8");
const rel = (f) => path.relative(target, f) || path.basename(f);
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

console.log("확인할 폴더: " + target);

// ---------- 1. 비밀 정보 ----------
title("1. API 키·비밀번호가 파일에 적혀 있지 않은가");
const SECRET_PATTERNS = [
  [/(api[_-]?key|apikey|secret|token|password|passwd|pwd|비밀번호)\s*["']?\s*[:=]\s*["'`][^"'`\s]{6,}["'`]/gi, "키·비밀번호를 값으로 적음"],
  [/[?&](api[_-]?key|apikey|appid|key|token|serviceKey)=[A-Za-z0-9%_\-]{10,}/gi, "주소 안에 키가 들어 있음"],
  [/AIza[0-9A-Za-z_\-]{30,}/g, "구글 API 키 모양"],
  [/sk-[A-Za-z0-9_\-]{20,}/g, "sk- 로 시작하는 키 모양"],
  [/gh[pousr]_[A-Za-z0-9]{30,}/g, "GitHub 토큰 모양"],
  [/Bearer\s+[A-Za-z0-9._\-]{20,}/g, "Bearer 토큰"],
];
let secretFound = false;
for (const f of textFiles) {
  const text = read(f);
  if (path.basename(f).startsWith(".env")) {
    bad(rel(f) + " 파일이 있음 (공개 저장소에 올라가면 안 됨)", "이 파일을 지우거나 .gitignore 에 넣기");
    secretFound = true;
  }
  for (const [re, why] of SECRET_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      secretFound = true;
      bad(`${rel(f)} ${lineOf(text, m.index)}번째 줄: ${why}`, "키가 필요 없는 API 를 쓰거나, 키는 앱 화면에서 직접 입력받기");
    }
  }
}
if (!secretFound) ok("키·비밀번호로 보이는 것이 없음");

// ---------- 2. 개인 정보 ----------
title("2. 전화번호·주소·학교 이름이 없는가");
const PRIVATE_PATTERNS = [
  [/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g, "전화번호 모양", bad],
  [/0\d{1,2}-\d{3,4}-\d{4}/g, "전화번호 모양", bad],
  [/[가-힣]{2,}(초등학교|중학교|고등학교|대학교)/g, "학교 이름", bad],
  [/[가-힣0-9]+(로|길)\s?\d+(-\d+)?(번지)?\s/g, "주소일 수도 있음", warn],
];
let privateFound = false;
for (const f of textFiles) {
  const text = read(f);
  const seen = new Set();
  for (const [re, why, report] of PRIVATE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const key = m.index + ":" + m[0].trim();
      if (seen.has(key)) continue; // 같은 것을 두 번 알리지 않기
      seen.add(key);
      privateFound = true;
      report(`${rel(f)} ${lineOf(text, m.index)}번째 줄: ${why} ("${m[0].trim()}")`, "지우거나 일반적인 말로 바꾸기");
    }
  }
}
if (!privateFound) ok("전화번호·주소·학교 이름으로 보이는 것이 없음");

// ---------- 앱 찾기 ----------
const htmlFiles = all.filter((f) => /\.html?$/i.test(f));
if (htmlFiles.length === 0) {
  title("3~7. 앱 확인");
  warn("아직 HTML 파일이 없어서 앱 확인은 건너뜀", "앱을 만든 뒤 다시 돌려 보기");
  finish();
}

// ---------- 3. 화면 기본 ----------
title("3. 화면 기본");
for (const f of htmlFiles) {
  const html = read(f);
  const name = rel(f);
  /<title>[^<]+<\/title>/i.test(html) ? ok(name + ": 제목(title) 있음") : bad(name + ": 제목(title) 없음", "<title>앱 이름</title> 넣기");
  /<meta[^>]+name=["']viewport["']/i.test(html) ? ok(name + ": 폰 화면 크기 설정(viewport) 있음") : bad(name + ": 폰 화면 크기 설정(viewport) 없음", '<meta name="viewport" content="width=device-width, initial-scale=1"> 넣기');
  /<html[^>]+lang=["']ko["']/i.test(html) ? ok(name + ': 한국어 페이지(lang="ko")') : warn(name + ': <html lang="ko"> 가 아님');
}

// ---------- 4. 저장하는 코드는 한곳에 ----------
title("4. 저장하는 코드가 한곳(storage.js)에 모여 있는가");
const codeFiles = all.filter((f) => /\.(html?|m?js)$/i.test(f));
const STORAGE_FILE = "storage.js";
const STORAGE_RE = /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/;
const storageFile = codeFiles.find((f) => path.basename(f) === STORAGE_FILE);
if (!storageFile) {
  bad(STORAGE_FILE + " 파일이 없음", "저장하는 코드를 " + STORAGE_FILE + " 한 파일에 모으기");
} else {
  /\b(localStorage)\b/.test(read(storageFile))
    ? ok(STORAGE_FILE + " 안에서 이 기기의 브라우저(localStorage)에 저장함")
    : warn(STORAGE_FILE + " 에 localStorage 를 쓰는 곳이 없음", "지금은 이 기기의 브라우저에 저장하기");
  let leak = false;
  for (const f of codeFiles) {
    if (f === storageFile) continue;
    const text = read(f);
    const m = STORAGE_RE.exec(text);
    if (m) {
      leak = true;
      bad(`${rel(f)} ${lineOf(text, m.index)}번째 줄: 저장하는 코드(${m[0]})가 ${STORAGE_FILE} 밖에 있음`, STORAGE_FILE + " 안으로 옮기고 여기서는 Store 함수를 부르기");
    }
  }
  if (!leak) ok("저장하는 코드가 " + STORAGE_FILE + " 밖에는 없음");
}
// 지금은 바깥 서버로 보내지 않기 (보관함은 나중에)
let sends = false;
for (const f of codeFiles) {
  const text = read(f);
  const m = /\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/.exec(text);
  if (m) { sends = true; bad(`${rel(f)} ${lineOf(text, m.index)}번째 줄: 바깥으로 보내거나 받는 코드(${m[0]})가 있음`, "보관함(서버)은 마지막에 붙이기. 지금은 이 기기에만 저장"); }
}
if (!sends) ok("바깥 서버로 보내는 코드가 없음 (지금은 이 기기에만 저장)");

// ---------- 5. 로그인은 자리만 ----------
title("5. 로그인은 아직 안 만들고 자리만 있는가");
const mainHtml = htmlFiles.find((f) => /index\.html?$/i.test(f)) || htmlFiles[0];
const mainText = read(mainHtml);
console.log("  (기준 화면: " + rel(mainHtml) + ")");
/id=["']login-slot["'][^>]*>\s*로그인 자리\s*</.test(mainText)
  ? ok('화면 위쪽에 "로그인 자리" 가 있음')
  : bad('"로그인 자리" 라고만 쓴 칸(id="login-slot")이 없음', '<div id="login-slot">로그인 자리</div> 넣기');
let loginBuilt = false;
for (const f of htmlFiles) {
  const text = read(f);
  const m = /type=["']password["']|firebase|supabase|auth0|oauth|signInWith|<button[^>]*>\s*로그인\s*<\/button>/i.exec(text);
  if (m) { loginBuilt = true; bad(`${rel(f)} ${lineOf(text, m.index)}번째 줄: 로그인을 벌써 만든 것 같음 (${m[0].slice(0, 30)})`, "로그인은 마지막에 붙이기. 지금은 자리만"); }
}
for (const f of codeFiles.filter((x) => /\.m?js$/i.test(x))) {
  const text = read(f);
  const m = /firebase|supabase|auth0|oauth|signInWith|\blogin\s*\(/i.exec(text);
  if (m) { loginBuilt = true; bad(`${rel(f)} ${lineOf(text, m.index)}번째 줄: 로그인을 벌써 만든 것 같음 (${m[0]})`, "로그인은 마지막에 붙이기. 지금은 자리만"); }
}
if (!loginBuilt) ok("로그인 코드는 아직 없음");

// ---------- 6. 폰과 컴퓨터 어디서나 (반응형) ----------
title("6. 화면 폭에 맞춰 보이는가 (반응형)");
const cssFiles = all.filter((f) => /\.css$/i.test(f));
let styleText = [...mainText.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
for (const f of cssFiles) styleText += "\n" + read(f);
if (!styleText.trim()) {
  warn("스타일(CSS)을 찾지 못함", "style.css 를 만들어 연결하기");
} else {
  /@media|flex-wrap\s*:\s*wrap|grid-template-columns[^;]*(auto-fit|auto-fill)/i.test(styleText)
    ? ok("화면 폭에 따라 바뀌는 규칙이 있음 (@media 또는 줄바꿈 flex/grid)")
    : bad("화면 폭에 따라 바뀌는 규칙이 없음", "@media (max-width: 480px) 나 flex-wrap: wrap 쓰기");
  /(max-width|width)\s*:\s*100%/i.test(styleText)
    ? ok("그림·그림판이 화면 폭에 맞춤 (width: 100%)")
    : warn("width: 100% 가 없어서 큰 그림이 잘릴 수 있음", "canvas, img 에 width: 100%; height: auto; 주기");
  const fixed = styleText.match(/(^|[;{\s])width\s*:\s*(\d{4,})px/gi);
  fixed ? warn("1000px 이상 고정 너비가 있음: " + fixed[0].trim(), "max-width 로 바꾸기") : ok("아주 큰 고정 너비 없음");
}

// ---------- 7. 기능 표와 코드가 맞는가 ----------
title("7. CLAUDE.md 기능 표에서 '넣었음' 인 기능이 코드에 있는가");
const claudeMd = path.join(target, "CLAUDE.md");
// 기능 이름 → 코드에 있어야 하는 흔적
const FEATURE_HINTS = {
  "이름 기억하기": /getName|setName/,
  "되돌리기 · 지우개": /undo|되돌리기/,
  "그림 내려받기": /\.download\s*=|download=/,
  "이름별로 모아 보기": /filter\s*\(|byAuthor|이름별/,
  "나쁜 말 가리기": /\*\*\*|badWords|나쁜 말/,
  "직선 · 동그라미 · 네모 도구": /strokeRect|\.arc\s*\(|rect\s*\(|직선/,
  "채우기 통": /floodFill|flood|채우기/,
  "남의 그림 이어 그리기": /이어 그리기|continueDrawing|drawImage/,
};
if (!fs.existsSync(claudeMd)) {
  warn("week-07/CLAUDE.md 가 없어서 기능 표를 못 봄");
} else {
  const rows = read(claudeMd).split("\n").filter((l) => /^\|\s*\d+\s*\|/.test(l));
  if (rows.length === 0) warn('CLAUDE.md 에 "기능 표" 가 없음', "번호 · 기능 · 좋은 점 · 어려움 · 상태 표를 적어 두기");
  const allCode = codeFiles.map(read).join("\n");
  let done = 0;
  for (const row of rows) {
    const cells = row.split("|").map((c) => c.trim());
    const no = cells[1], name = cells[2], state = cells[cells.length - 2];
    if (!/넣었음/.test(state)) continue;
    done++;
    const hint = FEATURE_HINTS[name];
    if (!hint) { warn(`${no}번 ${name}: 코드에서 찾을 흔적을 모름 (이 도구에 목록이 없음)`); continue; }
    hint.test(allCode) ? ok(`${no}번 ${name}: 코드에 있음`) : bad(`${no}번 ${name}: '넣었음' 이라고 적었는데 코드에서 못 찾음`, "기능을 넣거나 표에서 '아직' 으로 바꾸기");
  }
  if (rows.length && done === 0) warn("'넣었음' 으로 표시된 기능이 아직 없음");
}

finish();

function finish() {
  console.log("\n────────────────────────");
  if (fails === 0) console.log(`결과: 통과 ✅ (주의 ${warns}개)`);
  else console.log(`결과: 고칠 것 ${fails}개 ❌, 주의 ${warns}개`);
  console.log("※ 이 도구는 파일을 읽어서 확인만 함. 그림이 실제로 그려지는지,");
  console.log("  폰에서 잘리지 않는지는 직접 열어 봐야 알 수 있음.");
  process.exit(fails === 0 ? 0 : 1);
}
