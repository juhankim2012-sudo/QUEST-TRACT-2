// 저승길 퇴마록 자동 시험
// 실행: 터미널에서  node week-02/tests/test.js
// 화면 없이 게임 코드를 돌려서, 숫자로 기능이 맞게 동작하는지 확인한다.
// (그림이 예쁘게 나오는지는 확인 못 함. 그건 직접 플레이해서 봐야 함)

const fs = require('fs');
const path = require('path');

// 게임 파일에서 <script> 안의 코드만 꺼낸다
const html = fs.readFileSync(path.join(__dirname, '..', 'exorcist.html'), 'utf8');
const GAME = html.split('<script>')[1].split('</script>')[0];

// 가짜 화면: 그리기 명령은 받기만 하고 아무것도 안 한다
const noop = () => {};
const grad = { addColorStop: noop };
const fakeCtx = new Proxy({}, {
  get: (t, k) => {
    if (k in t) return t[k];
    if (String(k).startsWith('create')) return () => grad;
    if (k === 'measureText') return () => ({ width: 50 });
    return noop;
  },
  set: (t, k, v) => { t[k] = v; return true; },
});
const fakeEl = () => ({
  getContext: () => fakeCtx, addEventListener: noop, style: {}, textContent: '', innerHTML: '', onclick: null,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
  classList: { add: noop, remove: noop, toggle: noop }, querySelectorAll: () => [],
});
global.document = { getElementById: () => fakeEl(), createElement: () => fakeEl(), querySelectorAll: () => [] };
global.innerWidth = 960; global.innerHeight = 540;
global.addEventListener = noop; global.requestAnimationFrame = noop; global.setTimeout = noop;
global.performance = { now: () => 0 };

// 결과 모으기
let pass = 0, fail = 0;
global.check = (ok, text) => { console.log((ok ? '  ✅ ' : '  ❌ ') + text); ok ? pass++ : fail++; };
global.info = text => console.log('     ' + text);

// 시험 하나 = 게임을 새로 켜고 시험 코드를 돌림
function test(title, code) {
  console.log('\n■ ' + title);
  try { eval(GAME + '\n' + HELPERS + '\n' + code); }
  catch (e) { check(false, '오류 발생: ' + e.message); }
}
const HELPERS = `
const frame = () => loop(last + 1000 / 60);
const run = sec => { for (let i = 0; i < sec * 60; i++) frame(); };
const reset = () => {
  newGame(); state = 'play'; P.x = 1500; P.y = 390; cam.x = P.x - W * 0.38;
  nextElite = 1e9; spawnT = 1e9; natT = 1e9;   // 시험할 땐 몬스터·포인트가 저절로 안 나오게
};
`;

// ---------------------------------------------------------------
test('1. 게임이 켜지고 시작됨', `
  check(state === 'title', '처음 화면은 제목 화면');
  run(1);
  newGame(); state = 'play'; run(2);
  check(state === 'play', '시작 후 2초 동안 오류 없이 돌아감');
`);

test('2. 몬스터 공격 동작 (준비 → 공격 → 숨 고르기)', `
  for (const type of Object.keys(MON)) {
    reset(); const m = spawnMonster(type, P.x + 40, P.y); m.fade = 1;
    let firstHit = -1;
    for (let i = 0; i < 180; i++) { const hp = P.hp; update(1 / 60); if (P.hp < hp && firstHit < 0) firstHit = i / 60; }
    check(firstHit >= MON[type].atk.wind, MON[type].name + ': 준비 동작(' + MON[type].atk.wind + '초)이 끝난 뒤에 맞음 → ' + firstHit.toFixed(2) + '초');
  }
  for (const type of ['zombie', 'skeleton', 'shade', 'knight']) {
    reset(); const m = spawnMonster(type, P.x + 40, P.y); m.fade = 1; m.acd = 0;
    let hits = 0, done = false;
    for (let i = 0; i < 120 && !done; i++) {
      keys.KeyA = !!(m.atk && m.atk.phase === 'wind');
      const hp = P.hp; update(1 / 60); if (P.hp < hp) hits++;
      if (m.atk && m.atk.phase === 'rec') done = true;
    }
    keys.KeyA = false;
    check(hits === 0, MON[type].name + ': 준비 동작을 보고 뒤로 피하면 안 맞음');
  }
`);

test('3. 세이브 지역에 있으면 몬스터가 길 전체로 퍼짐', `
  reset(); P.x = 2400 + 160; cam.x = P.x - W * 0.38;
  for (let k = 0; k < 24; k++) spawnMonster(['zombie', 'skeleton', 'wisp', 'shade'][k % 4], 2400 + SAVE_W + 30, 300 + k * 8).fade = 1;
  const hp = P.hp;
  for (let i = 0; i < 60 * 60; i++) update(1 / 60);
  const xs = mons.map(m => m.x - 2400 - SAVE_W);
  const bins = [0, 0, 0, 0]; xs.forEach(v => bins[clamp(Math.floor(v / 520), 0, 3)]++);
  info('60초 뒤 길을 4칸으로 나눴을 때 몬스터 수: ' + bins.join(' / '));
  check(bins.every(b => b > 0), '4칸 모두에 몬스터가 있음 (한곳에 몰리지 않음)');
  check(P.hp === hp, '세이브 지역 안에서는 안 맞음');
  check(mons.every(m => m.face === 1 || m.face === -1), '모든 몬스터가 왼쪽이나 오른쪽을 보고 있음');
`);

test('4. 사후세계를 걸어 다니며 NPC 에게 말 걸기', `
  reset(); P.x = 2400 + 160; cam.x = P.x - W * 0.38;
  enterAfterlife();
  check(state === 'afterlife' && talking === null, '사후세계에 들어감 (아직 대화 안 함)');
  const walkTo = id => { keys.KeyD = true; for (let i = 0; i < 900; i++) { frame(); if (nearAfter() === id) break; } keys.KeyD = false; return nearAfter() === id; };
  check(walkTo('reaper'), '오른쪽으로 걸어가서 저승사자 앞에 도착');
  onKey('KeyF'); check(talking === 'reaper', 'F 로 저승사자와 대화 시작');
  const x = AP.x; keys.KeyD = true; run(1); keys.KeyD = false;
  check(AP.x === x, '대화 중에는 안 움직임');
  onKey('KeyF'); check(talking === null, 'F 로 대화 끝');
  check(walkTo('lib'), '사서 앞에 도착');
  check(walkTo('smith'), '대장장이 앞에 도착');
  keys.KeyA = true; for (let i = 0; i < 900; i++) { frame(); if (nearAfter() === 'portal') break; } keys.KeyA = false;
  onKey('KeyF'); check(state === 'play', '왼쪽 끝 문에서 F → 이승으로 돌아옴');
`);

test('5. 뒤에 몬스터가 있으면 카메라가 뒤로 감', `
  reset(); let c = cam.x; keys.KeyA = true; run(2); keys.KeyA = false;
  check(cam.x === c, '몬스터가 없으면 카메라가 뒤로 안 감');
  reset(); spawnMonster('zombie', P.x - 900, 390).fade = 1; c = cam.x; keys.KeyA = true; run(2); keys.KeyA = false;
  check(cam.x < c - 100, '뒤에 몬스터가 있으면 카메라가 뒤로 감 (' + Math.round(c - cam.x) + 'px)');
`);

test('6. 떨어진 포인트를 직접 주워야 함', `
  reset(); const m = spawnMonster('shade', P.x + 200, 390); m.fade = 1; kill(m);
  check(pts.soul + pts.tear + pts.grudge === 0, '퇴마해도 바로 포인트가 들어오지 않음');
  check(drops.length > 0, '바닥에 포인트가 떨어짐: ' + drops.map(d => PT_NAMES[d.type] + ' ' + d.amt).join(', '));
  const x0 = drops.map(d => d.x); run(1);
  check(drops.some((d, i) => Math.abs(d.x - x0[i]) > 0.5), '포인트가 제자리에서 조금씩 움직임');
  check(drops.every(d => Math.abs(d.x - d.hx) <= 13), '움직여도 제자리에서 멀리 안 감 (13px 이내)');
  for (const d of [...drops]) { P.x = d.x; P.y = d.y; run(0.05); }
  check(drops.length === 0 && pts.soul > 0, '걸어가서 다 주움 → ' + JSON.stringify(pts));
  reset(); natT = 0.1; let nat = 0;
  for (let i = 0; i < 60 * 60; i++) { const n = drops.length; update(1 / 60); if (drops.length > n) nat++; }
  check(nat >= 5, '60초 동안 길에 저절로 생긴 포인트: ' + nat + '개');
`);

test('7. 눈빛: 몬스터는 밝으면 사라지고, 포인트는 언제나 멀리 있는 몬스터 눈빛', `
  let glow = [], icon = 0;
  eyeGlow = (l, rgb, r, al) => glow.push(al);
  ptIcon = () => icon++;
  reset(); time = 1;
  const at = (dist, kind) => {
    mons = []; drops = []; glow = []; icon = 0;
    if (kind === 'mon') { const m = spawnMonster('zombie', P.x + dist, P.y); m.fade = 1; m.seed = 0.5; m.acd = 99; }
    else { dropPoint('soul', 1, P.x + dist, P.y); drops[0].seed = 0.5; }
    drawWorld();
    return glow.length ? glow[0] : 0;
  };
  info('거리 →   좀비 눈빛 / 포인트 눈빛   (1 = 완전히 빛남, 0 = 없음)');
  for (const d of [40, 120, 200, 300, 600]) info(String(d).padStart(4) + 'px:   ' + at(d, 'mon').toFixed(2) + ' / ' + at(d, 'drop').toFixed(2));
  check(at(40, 'mon') === 0, '바로 옆 좀비는 눈빛 없음');
  check(at(600, 'mon') === 1, '멀리 어둠 속 좀비는 눈빛이 완전히 빛남');
  check(at(600, 'mon') === at(600, 'drop'), '멀리서는 좀비 눈빛과 포인트 눈빛이 똑같음');
  check([40, 120, 200, 300, 600].every(d => at(d, 'drop') === 1), '포인트는 바로 옆에서도 멀리 있는 몬스터 눈빛 그대로');
  at(40, 'drop'); check(icon === 0, '가까이 가도 포인트의 진짜 모양은 안 보임');
  mons = []; const m = spawnMonster('zombie', P.x + 40, P.y); m.fade = 1; m.atk = { phase: 'wind', t: 0.3, ang: 0 };
  glow = []; drawWorld(); check(glow[0] === 1, '공격 준비 중인 좀비는 가까워도 눈이 번뜩임');
`);

test('8. 10분 자동 플레이 (오류가 안 나는지)', `
  newGame(); state = 'play'; let deaths = 0, afters = 0;
  for (let i = 0; i < 60 * 600; i++) {
    keys.KeyD = (i % 400) < 330; keys.KeyW = (i % 120) < 30; keys.KeyS = (i % 120) > 90;
    let near = null, nd = 1e9;
    for (const m of mons) { const d = Math.hypot(m.x - P.x, m.y - P.y); if (d < nd) { nd = d; near = m; } }
    if (near) { mouse.x = near.x - cam.x; mouse.y = near.y - 30; }
    mouse.down = true;
    if (i % 300 === 0) { castSlot(0); castSlot(1); }
    update(1 / 60); if (i % 2 === 0) { drawWorld(); drawHUD(); }
    if (state === 'dead') { deaths++; respawn(); }
    if (zoneAt(P.x) && i % 50 === 0 && afters < 20) {
      enterAfterlife(); afters++;
      for (const n of ['reaper', 'lib', 'smith']) { openTalk(n); closeTalk(); }
      pts.soul += 200; pts.tear += 20; pts.grudge += 10;
      for (const id of W_ORDER) if (!owned[id] && canPay(WEAPONS[id].price)) { pay(WEAPONS[id].price); owned[id] = true; weapon = id; }
      for (const id in SKILLS) { const s = SKILLS[id]; if (!learned[id] && (!s.need || uniques[s.need]) && canPay(s.price)) { pay(s.price); learned[id] = true; if (!slots[0]) slots[0] = id; else slots[1] = id; } }
      leaveAfterlife(); P.x += SAVE_W;
    }
  }
  info('간 거리 ' + Math.floor(P.x / 10) + 'm · 죽은 횟수 ' + deaths + ' · 사후세계 ' + afters + '번');
  check(true, '10분 동안 오류 없이 돌아감');
`);

console.log('\n결과: 통과 ' + pass + '개, 실패 ' + fail + '개');
process.exitCode = fail ? 1 : 0;
