// week-06 확인 도구
// 쓰는 법:  node week-06/check/check.js            (week-06 폴더 전체 확인)
//          node week-06/check/check.js week-06/날씨앱   (한 폴더만 확인)
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
  title("3~5. 앱 확인");
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

// ---------- 4. 정보 받아 오기 ----------
title("4. 바깥 정보 받아 오기와 실패했을 때");
const codeFiles = all.filter((f) => /\.(html?|m?js)$/i.test(f) && !/(^|[\\/])(sw|service-worker)\.js$/i.test(f));
let anyFetch = false;
for (const f of codeFiles) {
  const text = read(f);
  if (!/\bfetch\s*\(|XMLHttpRequest/.test(text)) continue;
  anyFetch = true;
  const name = rel(f);
  /\.catch\s*\(|\bcatch\s*\(|\bcatch\s*\{/.test(text)
    ? ok(name + ": 받아 오기가 실패했을 때 잡는 부분(catch) 있음")
    : bad(name + ": 받아 오기가 실패했을 때 잡는 부분(catch) 없음", "실패하면 빈 화면 대신 까닭을 보여 주기 (예: 인터넷이 끊겼어요)");
  /\.ok\b|\.status\b/.test(text)
    ? ok(name + ": 서버 응답이 정상인지(ok/status) 확인함")
    : warn(name + ": 서버가 오류를 돌려줘도 모를 수 있음", "if (!res.ok) 로 확인하고 까닭 보여 주기");
  /navigator\.onLine|offline/.test(text)
    ? ok(name + ": 인터넷이 끊긴 경우도 생각함")
    : warn(name + ": 인터넷이 끊겼을 때 따로 알려 주지 않음", "navigator.onLine 이나 catch 에서 '인터넷 연결을 확인해 주세요' 보여 주기");
  const httpUrls = text.match(/["'`]http:\/\/(?!localhost|127\.0\.0\.1)[^"'`]+/g);
  httpUrls
    ? bad(name + ": https 가 아닌 주소가 있음 (" + httpUrls[0].slice(1, 60) + ")", "폰 앱에서는 https 주소만 됨")
    : ok(name + ": 바깥 주소가 모두 https");
}
if (!anyFetch) bad("fetch 로 바깥 정보를 받아 오는 코드가 없음", "이번 주 목표: API 로 오늘 정보를 받아 오기");

// ---------- 5. 폰에 설치되는 앱 ----------
title("5. 폰에 설치되는 앱(PWA)");
const mainHtml = htmlFiles.find((f) => /index\.html?$/i.test(f)) || htmlFiles[0];
const mainText = read(mainHtml);
const appDir = path.dirname(mainHtml);
console.log("  (기준 화면: " + rel(mainHtml) + ")");

const linkM = mainText.match(/<link[^>]+rel=["']manifest["'][^>]*>/i);
const hrefM = linkM && linkM[0].match(/href=["']([^"']+)["']/i);
if (!hrefM) {
  bad("manifest 연결이 없음", '<link rel="manifest" href="manifest.json"> 넣기');
} else {
  const mPath = path.join(appDir, hrefM[1].split("?")[0]);
  if (!fs.existsSync(mPath)) {
    bad("manifest 파일이 없음: " + hrefM[1]);
  } else {
    let man = null;
    try { man = JSON.parse(read(mPath)); ok("manifest 파일 읽힘"); }
    catch (e) { bad("manifest 파일의 모양이 틀림 (JSON 오류): " + e.message); }
    if (man) {
      man.name || man.short_name ? ok("앱 이름: " + (man.short_name || man.name)) : bad("manifest 에 앱 이름(name) 없음");
      man.start_url ? ok("시작 주소(start_url) 있음") : bad("manifest 에 start_url 없음", '"start_url": "./" 넣기');
      ["standalone", "fullscreen", "minimal-ui"].includes(man.display) ? ok("앱처럼 보이기(display: " + man.display + ")") : bad("display 가 standalone 이 아님", '"display": "standalone" 넣기');
      const icons = Array.isArray(man.icons) ? man.icons : [];
      for (const size of ["192x192", "512x512"]) {
        const icon = icons.find((i) => (i.sizes || "").split(/\s+/).includes(size));
        if (!icon) { bad(size + " 아이콘이 manifest 에 없음"); continue; }
        fs.existsSync(path.join(path.dirname(mPath), icon.src.split("?")[0]))
          ? ok(size + " 아이콘 파일 있음 (" + icon.src + ")")
          : bad(size + " 아이콘 파일이 없음: " + icon.src);
      }
    }
  }
}

// 화면이 불러오는 내 스크립트 파일(app.js 등)도 같이 읽기
let mainWithScripts = mainText;
for (const s of mainText.matchAll(/<script[^>]+src=["']([^"':]+)["']/gi)) {
  const sp = path.join(appDir, s[1].split("?")[0]);
  if (fs.existsSync(sp)) mainWithScripts += "\n" + read(sp);
}
const regM = mainWithScripts.match(/serviceWorker\.register\(\s*["'`]([^"'`]+)["'`]/);
if (!regM) {
  bad("서비스 워커 등록이 없음", "navigator.serviceWorker.register('sw.js') 넣기");
} else {
  const swPath = path.join(appDir, regM[1].split("?")[0]);
  if (!fs.existsSync(swPath)) bad("서비스 워커 파일이 없음: " + regM[1]);
  else {
    ok("서비스 워커 파일 있음 (" + regM[1] + ")");
    /addEventListener\(\s*["']fetch["']|onfetch/.test(read(swPath))
      ? ok("서비스 워커가 fetch 를 처리함 (설치 조건)")
      : warn("서비스 워커에 fetch 처리가 없음", "self.addEventListener('fetch', ...) 넣기");
  }
}

finish();

function finish() {
  console.log("\n────────────────────────");
  if (fails === 0) console.log(`결과: 통과 ✅ (주의 ${warns}개)`);
  else console.log(`결과: 고칠 것 ${fails}개 ❌, 주의 ${warns}개`);
  console.log("※ 이 도구는 파일을 읽어서 확인만 함. 진짜로 폰에 설치되는지,");
  console.log("  인터넷을 끄면 까닭이 나오는지는 직접 해 봐야 알 수 있음.");
  process.exit(fails === 0 ? 0 : 1);
}
