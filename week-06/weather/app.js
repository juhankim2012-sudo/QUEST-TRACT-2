// 오늘 날씨 앱
// 날씨 정보는 Open-Meteo 에서 받아 와요. 키가 필요 없는 API 라서 파일에 키를 적지 않아요.

const PLACES = [
  { id: "here", name: "📍 내 위치" },
  { id: "pyeongtaek", name: "평택", lat: 36.99, lon: 127.09 },
  { id: "seoul", name: "서울", lat: 37.57, lon: 126.98 },
  { id: "incheon", name: "인천", lat: 37.46, lon: 126.71 },
  { id: "daejeon", name: "대전", lat: 36.35, lon: 127.38 },
  { id: "daegu", name: "대구", lat: 35.87, lon: 128.6 },
  { id: "gwangju", name: "광주", lat: 35.16, lon: 126.85 },
  { id: "busan", name: "부산", lat: 35.18, lon: 129.08 },
  { id: "gangneung", name: "강릉", lat: 37.75, lon: 128.88 },
  { id: "jeju", name: "제주", lat: 33.5, lon: 126.53 },
];

// 날씨 번호 → 한국어 설명과 그림 (밤에는 해 대신 달)
function describe(code, isDay = true) {
  const sun = isDay ? "☀️" : "🌙";
  const few = isDay ? "🌤️" : "🌙";
  if (code === 0) return [sun, "맑음"];
  if (code === 1) return [few, "대체로 맑음"];
  if (code === 2) return [isDay ? "⛅" : "☁️", "구름 조금"];
  if (code === 3) return ["☁️", "흐림"];
  if (code === 45 || code === 48) return ["🌫️", "안개"];
  if (code >= 51 && code <= 57) return ["🌦️", "이슬비"];
  if (code >= 61 && code <= 67) return ["🌧️", "비"];
  if (code >= 71 && code <= 77) return ["🌨️", "눈"];
  if (code >= 80 && code <= 82) return ["🌧️", "소나기"];
  if (code === 85 || code === 86) return ["🌨️", "눈 소나기"];
  if (code >= 95) return ["⛈️", "천둥번개"];
  return ["❔", "알 수 없음"];
}

const $ = (id) => document.getElementById(id);
const placeSelect = $("place");

// ---------- 저장 (이 폰 안에만 저장돼요) ----------
function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

// ---------- 까닭 보여 주기 ----------
// 정보를 못 받아 오면 빈 화면 대신 무엇이 잘못됐는지 알려 줘요.
class Problem extends Error {
  constructor(title, why) { super(title); this.title = title; this.why = why; }
}

function showProblem(p) {
  $("problem-title").textContent = p.title;
  $("problem-why").textContent = p.why;
  $("problem").hidden = false;
}
function hideProblem() { $("problem").hidden = true; }

// ---------- 위치 ----------
function getMyPosition() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Problem("내 위치를 알 수 없어요", "이 브라우저는 위치 찾기를 지원하지 않아요. 위에서 지역을 골라 주세요."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        const why =
          err.code === 1 ? "위치 사용을 허락하지 않았어요. 위치를 허락하거나, 위에서 지역을 골라 주세요." :
          err.code === 3 ? "위치를 찾는 데 너무 오래 걸렸어요. 다시 해 보거나 지역을 골라 주세요." :
          "폰이 위치를 찾지 못했어요. 위에서 지역을 골라 주세요.";
        reject(new Problem("내 위치를 알 수 없어요", why));
      },
      { timeout: 10000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

// ---------- 날씨 받아 오기 ----------
async function fetchWeather(lat, lon) {
  if (!navigator.onLine) {
    throw new Problem("인터넷에 연결돼 있지 않아요", "와이파이나 데이터가 켜져 있는지 확인한 뒤 '다시 받아 오기'를 눌러 주세요.");
  }
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
    "&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m,is_day" +
    "&hourly=temperature_2m,weather_code,precipitation_probability,is_day" +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" +
    "&timezone=Asia%2FSeoul&forecast_days=2";

  // 15초 안에 답이 없으면 멈춰요
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 15000);
  let res;
  try {
    res = await fetch(url, { signal: stop.signal });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Problem("날씨 서버가 대답하지 않아요", "15초를 기다렸지만 답이 없었어요. 인터넷이 느리거나 서버가 바쁠 수 있어요. 잠시 뒤 다시 해 보세요.");
    }
    throw new Problem("날씨 서버에 닿지 못했어요", "인터넷이 끊겼거나 서버에 연결할 수 없어요. 연결을 확인하고 다시 해 보세요.");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const why =
      res.status === 429 ? "너무 자주 물어봐서 서버가 잠깐 막았어요. 조금 뒤에 다시 해 보세요." :
      res.status >= 500 ? `날씨 서버에 문제가 생겼어요 (오류 번호 ${res.status}). 잠시 뒤 다시 해 보세요.` :
      `서버가 요청을 받아 주지 않았어요 (오류 번호 ${res.status}).`;
    throw new Problem("날씨를 받아 오지 못했어요", why);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Problem("날씨 정보를 읽지 못했어요", "서버가 보낸 정보의 모양이 이상해요. 잠시 뒤 다시 해 보세요.");
  }
  if (!data.current || !data.daily || !data.hourly) {
    throw new Problem("날씨 정보가 모자라요", "서버가 보낸 정보에 필요한 칸이 빠져 있어요. 잠시 뒤 다시 해 보세요.");
  }
  return data;
}

// ---------- 화면에 그리기 ----------
const hhmm = (iso) => iso.slice(11, 16);
const round = (n) => Math.round(n);

function render(data, placeName) {
  const c = data.current;
  const d = data.daily;
  const [icon, desc] = describe(c.weather_code, c.is_day === 1);

  $("now-icon").textContent = icon;
  $("now-temp").textContent = round(c.temperature_2m);
  $("now-desc").textContent = `${placeName} · ${desc}`;
  $("now-feel").textContent = round(c.apparent_temperature);

  $("t-max").textContent = round(d.temperature_2m_max[0]) + "°";
  $("t-min").textContent = round(d.temperature_2m_min[0]) + "°";
  $("t-rain").textContent = (d.precipitation_probability_max[0] ?? "-") + "%";
  $("t-hum").textContent = c.relative_humidity_2m + "%";
  $("t-wind").textContent = (c.wind_speed_10m / 3.6).toFixed(1) + "m/s";
  $("t-sun").textContent = `${hhmm(d.sunrise[0])} · ${hhmm(d.sunset[0])}`;

  // 지금 시각부터 12시간
  const h = data.hourly;
  const nowHour = c.time.slice(0, 13);
  let start = h.time.findIndex((t) => t.slice(0, 13) === nowHour);
  if (start < 0) start = 0;
  const list = $("hours");
  list.innerHTML = "";
  for (let i = start; i < Math.min(start + 12, h.time.length); i++) {
    const [hIcon] = describe(h.weather_code[i], h.is_day[i] === 1);
    const li = document.createElement("li");
    const hour = Number(h.time[i].slice(11, 13));
    li.innerHTML =
      `<div class="h-time">${i === start ? "지금" : hour + "시"}</div>` +
      `<div class="h-icon">${hIcon}</div>` +
      `<div>${round(h.temperature_2m[i])}°</div>` +
      `<div class="h-rain">💧${h.precipitation_probability[i] ?? "-"}%</div>`;
    list.appendChild(li);
  }

  for (const id of ["now", "today", "hours-card"]) $(id).hidden = false;
}

function whenText(ms) {
  const t = new Date(ms);
  const sameDay = t.toDateString() === new Date().toDateString();
  const time = t.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  return sameDay ? `오늘 ${time}` : `${t.getMonth() + 1}월 ${t.getDate()}일 ${time}`;
}

// ---------- 전체 흐름 ----------
async function update() {
  const place = PLACES.find((p) => p.id === placeSelect.value) || PLACES[1];
  hideProblem();
  $("loading").hidden = false;
  $("retry").disabled = true;

  try {
    let { lat, lon, name } = place;
    if (place.id === "here") {
      ({ lat, lon } = await getMyPosition());
      name = "내 위치";
    }
    const data = await fetchWeather(lat, lon);
    render(data, name);
    $("updated").textContent = `${whenText(Date.now())}에 받아 온 정보예요.`;
    save("last", { placeId: place.id, name, data, at: Date.now() });
  } catch (e) {
    const p = e instanceof Problem ? e : new Problem("알 수 없는 문제가 생겼어요", "까닭: " + (e && e.message ? e.message : e));
    showProblem(p);

    // 전에 받아 둔 정보가 있으면 빈 화면 대신 그걸 보여 주고, 언제 것인지 알려 줘요.
    const last = load("last");
    if (last && last.placeId === place.id && last.data) {
      try {
        render(last.data, last.name);
        $("updated").textContent = `지금 정보가 아니라 ${whenText(last.at)}에 받아 둔 정보예요.`;
      } catch {
        $("updated").textContent = "";
      }
    } else {
      for (const id of ["now", "today", "hours-card"]) $(id).hidden = true;
      $("updated").textContent = "";
    }
  } finally {
    $("loading").hidden = true;
    $("retry").disabled = false;
  }
}

// 지역 목록 채우기 (고른 지역은 이 폰에 기억해요. 처음에는 평택)
for (const p of PLACES) {
  const opt = document.createElement("option");
  opt.value = p.id;
  opt.textContent = p.name;
  placeSelect.appendChild(opt);
}
placeSelect.value = load("place") || "pyeongtaek";
if (!placeSelect.value) placeSelect.value = "pyeongtaek"; // 기억한 지역이 목록에 없을 때
placeSelect.addEventListener("change", () => { save("place", placeSelect.value); update(); });
$("retry").addEventListener("click", update);
window.addEventListener("online", update);
window.addEventListener("offline", () =>
  showProblem(new Problem("인터넷 연결이 끊겼어요", "연결되면 저절로 다시 받아 올게요."))
);

update();

// 폰에 설치되는 앱이 되도록 서비스 워커 등록
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
