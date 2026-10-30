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
  for (const type of Object.keys(MON).filter(t => t !== 'boss')) {   // 보스는 12번에서 따로
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

test('4-2. 사후세계 마을: 평범한 시민들과도 이야기할 수 있음', `
  reset(); enterAfterlife();
  check(CITIZENS.length >= 8, '마을에 시민이 ' + CITIZENS.length + '명 있음');
  let talked = 0, bad = [];
  for (const c of CITIZENS) {
    AP.x = c.x; AP.y = c.y; chat = null;
    const n = nearAfter();
    if (n !== c) { bad.push(c.name + '(가까이 가도 말 걸기 안 됨)'); continue; }
    onKey('KeyF');
    if (!chat || chat.c !== c) { bad.push(c.name + '(F 로 대화 시작 안 됨)'); continue; }
    let lines = 1; for (let k = 0; k < 10 && chat; k++) { onKey('KeyF'); if (chat) lines++; }
    if (chat !== null || lines !== c.lines.length) { bad.push(c.name + '(대사가 끝까지 안 넘어감)'); continue; }
    talked++;
  }
  check(talked === CITIZENS.length, '모든 시민에게 F 로 말 걸고, F 로 대사를 끝까지 넘김' + (bad.length ? ' — 문제: ' + bad.join(', ') : ''));
  const c = CITIZENS[1]; AP.x = c.x; AP.y = c.y; onKey('KeyF'); onKey('Escape');
  check(chat === null, 'Esc 로 대화를 바로 끝낼 수 있음');
  AP.x = c.x; AP.y = c.y; onKey('KeyF'); const ax = AP.x; keys.KeyD = true; run(1); keys.KeyD = false;
  check(AP.x === ax, '시민과 대화 중에는 안 움직임'); chat = null;
  const xs = CITIZENS.map(c => c.x); run(8);
  check(CITIZENS.filter((c, i) => Math.abs(c.x - xs[i]) > 1).length >= 4, '시민들이 마을을 어슬렁거림');
  check(CITIZENS.every(c => Math.abs(c.x - c.hx) <= c.range + 1), '시민들이 자기 자리에서 멀리 안 감');
  for (const n of NPCS) check(CITIZENS.every(c => Math.abs(c.y - n.y) > 185 || Math.abs(c.hx - n.x) - c.range > 75), n.name + ' 근처에 시민이 없어서 상점 말 걸기를 가리지 않음');
`);

test('4-3. 큰 네모 마을: 위아래로 다니고, 건물은 못 지나감', `
  reset(); enterAfterlife();
  check(AH / AW > 0.85, '마을이 위아래로도 넓은 큰 네모 (' + AW + ' × ' + AH + ')');
  // 걸어서 갈 수 있는 곳을 20px 칸으로 모두 찾아본다 (입구에서 출발)
  const G = 20, cols = Math.ceil(AW / G), rows = Math.ceil(AH / G);
  const free = (cx, cy) => { const x = cx * G + G / 2, y = cy * G + G / 2; return x >= 40 && x <= AW - 40 && y >= 280 && y <= AH - 20 && !blockedAt(x, y); };
  const seen = new Set(), q = [[Math.floor(190 / G), Math.floor(400 / G)]];
  seen.add(q[0].join());
  while (q.length) { const [cx, cy] = q.pop(); for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny; if (!seen.has(k) && free(nx, ny)) { seen.add(k); q.push([nx, ny]); } } }
  const reach = (x, y) => [[0,0],[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => seen.has((Math.floor(x / G) + dx) + ',' + (Math.floor(y / G) + dy)));
  const lost = CITIZENS.filter(c => !reach(c.x, c.y)).map(c => c.name);
  check(lost.length === 0, '입구에서 걸어서 모든 시민에게 갈 수 있음' + (lost.length ? ' — 못 가는 시민: ' + lost.join(', ') : ''));
  check(NPCS.every(n => reach(n.x, n.y + 40)), '상점 NPC 세 명에게 걸어서 갈 수 있음');
  check(ROWS.every(b => reach(1400, b + 120) || reach(700, b + 120) || reach(2200, b + 120)), '다섯 줄의 길에 모두 갈 수 있음');
  const inWall = CITIZENS.filter(c => [c.hx - c.range, c.hx, c.hx + c.range].some(x => blockedAt(x, c.y))).map(c => c.name);
  check(inWall.length === 0, '시민이 건물 안에 서 있지 않음' + (inWall.length ? ' — ' + inWall.join(', ') : ''));
  // 집 앞에서 위(W)로 걸어가면 막힌다
  const h = VOBJ.find(o => o.k === 'house' && o.b === 700);
  AP.x = h.x; AP.y = h.b + 40; keys.KeyW = true; run(2); keys.KeyW = false;
  check(AP.y > h.b, '집 앞에서 W 를 눌러도 집을 뚫고 못 지나감 (멈춘 곳 y ' + Math.round(AP.y) + ', 집 ' + h.b + ')');
  check(acamY > 0, '아래 동네로 내려가면 카메라도 내려감 (' + Math.round(acamY) + 'px)');
  // 남문 너머로는 못 감
  AP.x = 1400; AP.y = 2400; keys.KeyS = true; run(2); keys.KeyS = false;
  check(AP.y < 2500 - 50, '닫힌 남문 너머로는 못 감');
  // 위아래로 걸을 때 모습
  AP.x = 1400; AP.y = 900;
  keys.KeyW = true; run(0.2); keys.KeyW = false; const vUp = AP.view;
  keys.KeyS = true; run(0.2); keys.KeyS = false; const vDown = AP.view;
  run(0.5); const vIdle = AP.view;
  keys.KeyA = true; run(0.2); keys.KeyA = false; const vSide = AP.view;
  check(vUp === 'back' && vDown === 'front', 'W 로 걸으면 뒷모습, S 로 걸으면 앞모습');
  check(vIdle === 'front', '멈추면 마지막 모습(앞모습) 그대로');
  check(vSide === 'side' && AP.f === -1, 'A 로 걸으면 왼쪽을 보는 옆모습');
  drawAfterlife();
  check(true, '마을 화면을 그려도 오류 없음');
`);

test('4-4. R 키: 마을 어디서든 이승으로 가는 문 앞으로 바로 이동', `
  reset(); enterAfterlife();
  for (const [x, y] of [[1400, 2400], [2700, 400], [930, 1300]]) {
    AP.x = x; AP.y = y; onKey('KeyR');
    keys.KeyD = true; run(0.3); keys.KeyD = false;   // 이동하는 동안 키를 눌러도 상관없음
    run(0.6);
    check(nearAfter() === 'portal', '(' + x + ', ' + y + ') 에서 R → 문 앞에 도착');
  }
  onKey('KeyF'); check(state === 'play', '도착해서 F → 이승으로 돌아감');
  reset(); enterAfterlife(); AP.x = 2000; AP.y = 1700; const c = CITIZENS[0];
  AP.x = c.x; AP.y = c.y; onKey('KeyF'); onKey('KeyR');
  check(warp === 0 && chat !== null, '시민과 대화 중에는 R 이 안 먹힘 (대화가 먼저)');
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
  reset(); P.x = 3000; cam.x = P.x - W * 0.38; natT = 0.1; let nat = 0;   // 근처에 세이브 지역이 없는 곳
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

test('8. 세이브 포인트 체력: 비어 있는 체력의 2/3 만, 한 번만', `
  reset(); P.x = 2300; cam.x = P.x - W * 0.38; P.hp = 40;
  keys.KeyD = true; for (let i = 0; i < 120 && !zoneAt(P.x); i++) update(1 / 60); keys.KeyD = false;
  check(P.hp === 80, '체력 40/100 으로 도착 → 비어 있는 60 의 2/3 인 40 을 채워서 80 (결과 ' + P.hp + ')');
  run(5);
  check(P.hp === 80, '세이브 지역에 5초 더 있어도 체력이 더 안 참 (결과 ' + Math.round(P.hp) + ')');
  enterAfterlife(); run(1);
  check(P.hp === 80, '사후세계에 들어가도 체력이 안 참 (결과 ' + Math.round(P.hp) + ')');
  leaveAfterlife();
  P.hp = 50; keys.KeyA = true; run(0.5); keys.KeyA = false; keys.KeyD = true; run(0.5); keys.KeyD = false;
  check(P.hp === 50, '이미 지나간 세이브 포인트에 다시 들어가면 또 안 참 (결과 ' + Math.round(P.hp) + ')');
  P.hp = 10; P.x = 4800 - 30; cam.x = P.x - W * 0.38;
  keys.KeyD = true; for (let i = 0; i < 120 && !zoneAt(P.x); i++) update(1 / 60); keys.KeyD = false;
  check(P.hp === 70, '다음 세이브 포인트: 10/100 → 비어 있는 90 의 2/3 인 60 → 70 (결과 ' + P.hp + ')');
`);

test('8-2. 영력 충전 속도: 평소 1초에 5, 세이브 포인트 안에서는 3배', `
  reset(); P.sp = 0; run(1);
  check(Math.abs(P.sp - 5) < 0.2, '평소: 1초 동안 영력 ' + P.sp.toFixed(1) + ' 참 (0 → 100 까지 20초)');
  reset(); P.x = 2400 + 160; cam.x = P.x - W * 0.38; P.sp = 0; run(1);
  check(Math.abs(P.sp - 15) < 0.4, '세이브 포인트 안: 1초 동안 영력 ' + P.sp.toFixed(1) + ' 참');
`);

test('9. 몬스터는 구간마다 정해진 수만큼만 나옴', `
  for (const s of [0, 1, 3]) {
    reset(); spawnT = 0; P.x = s * SAVE_GAP + SAVE_W + 400; cam.x = P.x - W * 0.38;
    let made = 0; const real = spawnMonster;
    spawnMonster = (t, x, y) => { made++; return real(t, x, y); };
    // 3분 동안 한자리에 서서, 나오는 몬스터를 바로바로 없앤다
    for (let i = 0; i < 60 * 180; i++) { update(1 / 60); mons = []; P.hp = P.maxHp; }
    spawnMonster = real;
    check(made === segQuota(s), (s + 1) + '번째 구간: 3분 동안 ' + made + '마리만 나옴 (정해진 수 ' + segQuota(s) + ')');
  }
  reset(); P.x = 2400 + SAVE_W + 400; lastSave = 1; segSpawned[1] = segQuota(1);
  P.hp = 0; update(1 / 60); respawn();
  check(segLeft(1) === segQuota(1), '죽고 다시 시작하면 그 구간 몬스터가 다시 나옴');
`);

test('10. 움직임이 끊기지 않고 부드럽게 이어짐', `
  const maxJump = arr => arr.slice(1).reduce((m, v, i) => Math.max(m, Math.abs(v - arr[i])), 0);
  // 플레이어: 서서히 빨라지고 서서히 멈춤
  reset(); keys.KeyD = true; update(1 / 60); const v1 = P.vx;
  for (let i = 0; i < 30; i++) update(1 / 60); const vFull = P.vx;
  keys.KeyD = false; update(1 / 60); const vAfter = P.vx;
  for (let i = 0; i < 40; i++) update(1 / 60); const vStop = P.vx;
  check(v1 < P.speed * 0.3, '출발한 첫 순간에는 아직 느림 (' + Math.round(v1) + ' / ' + P.speed + ')');
  check(vFull > P.speed * 0.95, '0.5초 뒤에는 최고 속도 (' + Math.round(vFull) + ')');
  check(vAfter > vFull * 0.7 && Math.abs(vStop) < 5, '손을 떼면 바로 서지 않고 서서히 멈춤 (' + Math.round(vAfter) + ' → ' + Math.round(vStop) + ')');
  // 플레이어 다리: 멈춰도 다리가 한 번에 제자리로 가지 않음
  reset(); keys.KeyD = true; run(0.5); const a0 = P.amp; keys.KeyD = false; run(1 / 60); const a1 = P.amp; run(0.6);
  check(a0 > 0.9 && a1 > 0.75 && P.amp < 0.05, '멈추면 걷는 동작이 서서히 줄어듦 (' + a0.toFixed(2) + ' → ' + a1.toFixed(2) + ' → ' + P.amp.toFixed(2) + ')');
  // 플레이어 돌아서기: 오른쪽 → 왼쪽으로 바꿀 때 한 번에 뒤집히지 않음
  reset(); mouse.down = false; P.atkCd = 0; keys.KeyD = true; run(0.3); keys.KeyD = false; keys.KeyA = true;
  run(1 / 60); const turn1 = Math.abs(P.drawA); run(0.3); const turn2 = Math.abs(P.drawA); keys.KeyA = false;
  check(turn1 > 0.1 && turn1 < 2.5 && turn2 > 3.0, '돌아설 때 몸이 빠르게 돌아감 (각도 0 → ' + turn1.toFixed(2) + ' → ' + turn2.toFixed(2) + ', 반대쪽은 3.14)');
  // 몬스터: 그림자 귀신이 느렸다 빨랐다 할 때 속도가 뚝 바뀌지 않음
  reset(); const sh = spawnMonster('shade', P.x + 700, P.y); sh.fade = 1; sh.acd = 99;
  const sv = []; for (let i = 0; i < 180; i++) { update(1 / 60); sv.push(sh.svx); }
  check(maxJump(sv) < sh.speed * 2.6 * 0.15, '그림자 귀신 속도 변화가 한 순간에 크지 않음 (가장 큰 변화 ' + maxJump(sv).toFixed(1) + ')');
  // 몬스터 돌아서기
  reset(); const z = spawnMonster('zombie', P.x + 100, P.y); z.fade = 1; z.acd = 99;
  const fs = []; for (let i = 0; i < 60; i++) { update(1 / 60); fs.push(z.fs); } P.x += 400;
  for (let i = 0; i < 90; i++) { update(1 / 60); fs.push(z.fs); }
  check(maxJump(fs) < 0.5 && fs[fs.length - 1] > 0.9, '좀비가 돌아설 때 서서히 몸을 돌림 (한 순간 가장 큰 변화 ' + maxJump(fs).toFixed(2) + ')');
  // 공격 자세: 좀비 팔 끝이 한 순간에 크게 튀지 않음 (준비 → 내리침 → 숨 고르기 → 평소)
  reset(); const zz = spawnMonster('zombie', P.x + 40, P.y); zz.fade = 1; zz.acd = 0; zz.seed = 0.3;
  const realLine = ctx.lineTo; let calls = []; ctx.lineTo = (x, y) => calls.push([x, y]);
  const arm = [];
  for (let i = 0; i < 150; i++) { update(1 / 60); P.hp = P.maxHp; P.inv = 1; calls = []; drawMonster(zz); if (calls[2]) arm.push(calls[2]); }
  ctx.lineTo = realLine;
  let armJump = 0; for (let i = 1; i < arm.length; i++) armJump = Math.max(armJump, Math.hypot(arm[i][0] - arm[i - 1][0], arm[i][1] - arm[i - 1][1]));
  check(armJump < 14, '좀비가 공격할 때 팔이 끊기지 않고 움직임 (한 순간 가장 크게 움직인 거리 ' + armJump.toFixed(1) + 'px)');
  // 사후세계: 시민과 나도 서서히 출발하고 멈춤
  reset(); enterAfterlife(); const cz = CITIZENS[1]; const czv = [];
  for (let i = 0; i < 600; i++) { frame(); czv.push(cz.v || 0); }
  check(maxJump(czv) < 4, '시민이 걷기 시작하고 멈출 때 속도가 서서히 바뀜 (가장 큰 변화 ' + maxJump(czv).toFixed(2) + ')');
  keys.KeyD = true; frame(); const av1 = AP.vx; run(0.5); keys.KeyD = false; frame(); const av2 = AP.vx;
  check(av1 < 60 && av2 > 100, '사후세계에서도 서서히 빨라지고 서서히 멈춤 (' + Math.round(av1) + ', 멈춘 직후 ' + Math.round(av2) + ')');
`);

test('12. 최종 보스 무명귀', `
  const toArena = () => {
    reset(); lastSave = BOSS_SAVE; P.x = BOSS_SAVE * SAVE_GAP + SAVE_W / 2; P.y = 390; cam.x = P.x - W * 0.38;
    keys.KeyD = true; for (let i = 0; i < 600 && !boss; i++) update(1 / 60); keys.KeyD = false;
  };
  toArena();
  check(!!boss && boss.phase === 1, '5번째 등불 너머 남문 앞에 오면 무명귀와 싸움이 시작됨 (' + Math.floor(BX0 / 10) + 'm)');
  check(mons.length === 1, '싸우는 곳에는 다른 몬스터가 없음');
  const hp0 = boss.hp; hurt(boss, 100, 1, 0, 0);
  check(boss.hp === hp0, '문을 두드리는 등장 장면에서는 안 맞음');
  run(4);
  keys.KeyD = true; run(3); keys.KeyD = false;
  check(P.x <= BX1 - 30 && Math.abs(cam.x - BX0) < 5, '싸우는 동안은 화면 한 칸 안에 갇힘 (남문 너머로 못 감)');
  // 휘두르기: 준비 동작이 끝나야 맞고, 그 사이 피하면 안 맞음
  const b = boss;
  // 공격 하나씩 시험하려고 무대를 비운다 (먼저 불러낸 혼령·날아다니는 글자를 치움)
  const calm = () => { mons = mons.filter(m => m === b); bshots = []; bhands = []; b.act = null; b.cd = 99; b.vanish = null; b.fade = 1; b.x = (BX0 + BX1) / 2; b.y = 380; P.inv = 0; P.hp = P.maxHp; P.vx = P.vy = 0; P.kx = P.ky = 0; P.slow = 0; };
  const sweepTest = dodge => {
    calm(); P.x = b.x - 120; P.y = b.y;
    bossAct(b, 'sweep'); let hitDuringWind = false, hit = false;
    for (let i = 0; i < 120 && b.act; i++) {
      const before = P.hp;
      if (dodge && b.act.phase === 'wind') keys.KeyA = true;
      update(1 / 60); keys.KeyA = false;
      if (P.hp < before) { hit = true; if (b.act && b.act.phase === 'wind') hitDuringWind = true; }
    }
    return { hit, hitDuringWind };
  };
  const s1 = sweepTest(false), s2 = sweepTest(true);
  check(s1.hit && !s1.hitDuringWind, '긴 팔 휘두르기: 준비 동작이 끝난 뒤에 맞음');
  check(!s2.hit, '긴 팔 휘두르기: 준비하는 동안 뒤로 피하면 안 맞음');
  // 이름 글자: 날아오고, 베면 없어짐
  calm(); P.x = b.x - 300; bossAct(b, 'names'); for (let i = 0; i < 50; i++) update(1 / 60);
  const n1 = bshots.length; P.atkCd = 0; weapon = 'dagger';
  bshots.forEach(s => { s.x = P.x + 40; s.y = P.y - 28; s.vx = s.vy = 0; }); mouse.x = P.x + 40 - cam.x; mouse.y = P.y - 28; attack();
  update(1 / 60);
  check(n1 >= 5 && bshots.length === 0, '이름 글자 ' + n1 + '개가 날아오고, 칼로 베면 없어짐');
  // 단계 넘어가기
  b.hp = b.maxHp * 0.6; P.hp = P.maxHp; run(0.1);
  check(b.phase === 2 && bdecoys.length === 8, '체력 66% 아래 → 2단계: 어둠 속에 가짜 눈 8쌍');
  run(2);
  // 땅에서 솟는 손: 표시된 자리에서 비키면 안 맞음
  calm(); P.x = BX0 + 300; P.y = 400;
  bossAct(b, 'hands'); for (let i = 0; i < 30; i++) update(1 / 60);
  const hand0 = bhands[0]; bhands = [hand0];   // 내 발밑에 생긴 손 하나만 본다
  const hold = sec => { for (let i = 0; i < sec * 60; i++) { b.cd = 99; update(1 / 60); } };
  keys.KeyS = true; keys.KeyD = true; hold(0.5); keys.KeyS = false; keys.KeyD = false; hold(1);
  check(hand0 && P.hp === P.maxHp, '땅에서 솟는 손: 바닥에 표시가 생겼을 때 비키면 안 맞음');
  calm(); P.x = BX0 + 300; P.y = 400; bossAct(b, 'hands'); hold(0.6);
  bhands = [bhands[0]]; const hpStay = P.hp; hold(1.2);
  check(P.hp < hpStay, '땅에서 솟는 손: 안 비키고 서 있으면 맞음');
  b.hp = b.maxHp * 0.3; run(0.1);
  check(b.phase === 3, '체력 33% 아래 → 3단계');
  run(3);
  check(bossScene === 'village' && bflee.length > 0, '3단계: 남문을 부수고 마을로 (도망가는 시민들)');
  // 붙잡기: 이름을 먹는다
  calm(); const eaten0 = bossEaten; P.x = b.x - 150; P.y = b.y; bossAct(b, 'grab');
  for (let i = 0; i < 90; i++) { b.act && (b.act.ang = Math.atan2(P.y - 28 - (b.y - 110), P.x - b.x)); update(1 / 60); }
  check(bossEaten > eaten0 && eatName(0, '체력') === '???', '붙잡히면 이름을 먹힘 → 화면의 「체력」 글자가 ??? 로 바뀜');
  // 죽으면 그 단계부터 다시
  P.hp = 0; update(1 / 60); respawn();
  check(!boss && bossEaten === 0, '죽으면 보스가 사라지고 먹힌 글자도 돌아옴');
  keys.KeyD = true; for (let i = 0; i < 600 && !boss; i++) update(1 / 60); keys.KeyD = false;
  check(boss && boss.phase === 3 && Math.abs(boss.hp / boss.maxHp - 0.33) < 0.01, '다시 가면 3단계부터 (체력 33%)');
  // 잡기 → 엔딩
  run(1.5); boss.hp = 1; P.atkCd = 0; const bb = boss; P.x = bb.x - 60; P.y = bb.y; mouse.x = bb.x - cam.x; mouse.y = bb.y - 90; P.sp = P.maxSp; attack();
  check(bossDone && !boss, '무명귀 퇴마!');
  check(uniques.mask === true, '특이 포인트 「무명귀의 가면」 획득');
  run(3.5);
  check(state === 'ending', '잠시 뒤 엔딩 화면');
  onKey('Digit2'); check(state === 'ending', '엔딩 글이 다 나오기 전에는 고를 수 없음');
  run(15); onKey('Digit2');
  check(state === 'afterlife', '[2] 엔드리스 안 하기 → 마을로');
  check(chatLines(CITIZENS.find(c => c.name === '꼬마 유령'))[0].includes('순이'), '시민들 대사가 바뀜 (꼬마 유령이 이름을 되찾음)');
  AP.x = PORTAL.x + 40; AP.y = PORTAL.y; onKey('KeyF');
  check(state === 'play', '마을 문으로 나가면 저승길로');
  keys.KeyD = true; run(8); keys.KeyD = false;
  check(P.x > BX1 + 200, '남문 너머로 계속 갈 수 있음 (엔드리스) → ' + Math.floor(P.x / 10) + 'm');
  // 보스 기술
  pts.tear = 99; learned.names = true; slots[0] = 'names'; P.sp = P.maxSp; skillCd = {}; const ns = shots.length; castSlot(0);
  check(shots.length - ns === 7 && shots[shots.length - 1].ch, '보스 기술 「이름 부르기」: 이름 글자 7개 발사');
  // [1] 엔드리스 계속하기
  toArena(); boss.intro = 0; boss.hp = 1; bossSaved = 3; P.x = boss.x - 60; P.y = boss.y; P.atkCd = 0; mouse.x = boss.x - cam.x; mouse.y = boss.y - 90; attack();
  run(3.5); run(15); onKey('Digit1');
  check(state === 'play' && bossDone, '[1] 엔드리스 계속하기 → 바로 저승길로');
`);

test('13. 몬스터 소리 (가짜 스피커로 확인)', `
  // 진짜 소리는 못 들으니, 소리를 만드는 부품이 몇 개 만들어지는지 세는 가짜 스피커를 쓴다
  let made = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime(a) { if (!(a > 0)) throw new Error('0 이하 값'); }, linearRampToValueAtTime() {} });
  const node = () => { made++; return { connect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: param(), pan: param(), type: '', buffer: null }; };
  AC = { currentTime: 0, sampleRate: 8000, destination: {}, createOscillator: node, createGain: node, createBiquadFilter: node, createBufferSource: node, createStereoPanner: node, createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }) };
  master = node(); muted = false;
  reset();
  let all = 0, bad = [];
  for (const type in MON_SOUNDS) for (const act in MON_SOUNDS[type]) {
    voiceEnds.length = 0; made = 0;
    try { monSound(type, act, P.x + 50); } catch (e) { bad.push(type + ':' + act + ' ' + e.message); }
    if (made < 2) bad.push(type + ':' + act + ' (소리가 안 만들어짐)');
    all++;
  }
  check(bad.length === 0, '몬스터 7종의 소리 ' + all + '가지가 모두 오류 없이 만들어짐' + (bad.length ? ' — ' + bad.join(', ') : ''));
  for (const type of ['zombie', 'skeleton', 'wisp', 'shade', 'wongwi', 'knight']) check(['idle', 'hit', 'hurt', 'die'].every(a => MON_SOUNDS[type][a] || (type === 'knight' && a === 'idle')), MON_SOUNDS[type] ? MON[type].name + ': 평소·공격·맞음·퇴마 소리가 다 있음' : type);
  voiceEnds.length = 0; made = 0; monSound('zombie', 'idle', P.x + 2000);
  check(made === 0, '아주 멀리 있는 몬스터 소리는 안 들림');
  voiceEnds.length = 0; muted = true; made = 0; monSound('zombie', 'idle', P.x + 10); muted = false;
  check(made === 0, 'M 으로 소리를 끄면 안 들림');
  // 실제로 싸울 때 행동마다 소리가 나는지
  const heard = type => soundLog.filter(s => s.startsWith(type + ':')).map(s => s.split(':')[1]);
  for (const type of ['zombie', 'skeleton', 'wisp', 'shade', 'wongwi', 'knight']) {
    reset(); soundLog.length = 0; voiceEnds.length = 0;
    const m = spawnMonster(type, P.x + 450, P.y); m.fade = 1; m.acd = 0; m.sndT = 0.1;   // 멀리서 다가오게 (다가오는 동안 평소 소리)
    for (let i = 0; i < 60 * 15 && !(heard(type).includes('hit') && i > 60 * 3); i++) { update(1 / 60); P.hp = P.maxHp; voiceEnds.length = 0; if (m.type === 'wongwi') m.tp = 99; }
    hurt(m, 1, 1, 0, 0); m.hp = 0; hurt(m, 1, 1, 0, 0);
    const got = [...new Set(heard(type))];
    const need = type === 'wisp' ? ['idle', 'wind', 'hit', 'hurt', 'die'] : type === 'knight' ? ['step', 'wind', 'hit', 'hurt', 'die'] : ['idle', 'wind', 'hit', 'hurt', 'die'];
    check(need.every(a => got.includes(a)), MON[type].name + ' 싸움에서 난 소리: ' + got.join(', '));
  }
  reset(); soundLog.length = 0; lastSave = BOSS_SAVE; P.x = BX0 + 200; cam.x = BX0; bossSaved = 1; startBoss(); boss.intro = 0;
  for (const k of ['sweep', 'names', 'grab', 'hands']) { voiceEnds.length = 0; boss.act = null; bossAct(boss, k); for (let i = 0; i < 90; i++) { update(1 / 60); P.hp = P.maxHp; boss.cd = 99; } }
  check(['sweepWind', 'sweepHit', 'namesWind', 'namesFire', 'grabWind', 'handsWind', 'handsUp'].every(a => heard('boss').includes(a)), '무명귀 공격마다 소리: ' + [...new Set(heard('boss'))].join(', '));
  AC = null;
`);

// 제작자 코드는 공개 저장소에 적지 않는다. 시험할 때만 바깥에서 알려 준다:
//   PowerShell:  $env:DEV_CODE='숫자8자리'; node week-02/tests/test.js
const DEV_CODE = process.env.DEV_CODE || '';
if (!DEV_CODE) console.log('\n■ 14. 제작자 코드\n     (DEV_CODE 를 알려 주지 않아서 건너뜀)');
else test('14. 제작자 코드', `
  const CODE = ${JSON.stringify(DEV_CODE)};
  const typeCode = s => { for (const ch of s) onKey('Digit' + ch); };
  for (const st of ['title', 'play', 'afterlife']) {
    newGame(); state = st === 'title' ? 'title' : 'play'; if (st === 'afterlife') { P.x = 2400 + 160; enterAfterlife(); }
    typeCode(CODE);
    check(state === 'play' && lastSave === BOSS_SAVE && zoneAt(P.x) === BOSS_SAVE, (st === 'title' ? '제목 화면' : st === 'play' ? '게임 중' : '사후세계') + '에서 코드 입력 → 보스 바로 앞 등불로 이동');
  }
  check(W_ORDER.every(id => owned[id] && wlv[id] === 5) && pts.soul >= 9999 && pts.tear >= 9999 && pts.grudge >= 9999 && P.maxHp === 200 && P.maxSp === 200, '무기 4개 모두 +5, 포인트 9999, 체력·영력 최대');
  check(['light', 'barrier', 'scream', 'charge'].every(id => learned[id]), '스킬 4개 모두 배움');
  keys.KeyD = true; for (let i = 0; i < 600 && !boss; i++) update(1 / 60); keys.KeyD = false;
  check(!!boss, '앞으로 걸어가면 바로 보스');
  newGame(); state = 'play'; const x0 = P.x; typeCode(CODE.slice(0, 7) + ((+CODE[7] + 1) % 10));
  check(P.x === x0 && lastSave === 0, '틀린 숫자는 아무 일도 안 일어남');
  newGame(); state = 'play'; typeCode('999' + CODE);
  check(lastSave === BOSS_SAVE, '앞에 다른 숫자를 쳤어도 마지막 8자리가 맞으면 됨');
  check(!${JSON.stringify(['exorcist.html', 'tests/test.js'].some(f => require('fs').readFileSync(require('path').join(__dirname, '..', f), 'utf8').includes(DEV_CODE)))}, '게임 파일과 시험 파일에 코드 숫자가 그대로 적혀 있지 않음 (공개 저장소)');
`);

test('11. 10분 자동 플레이 (오류가 안 나는지)', `
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
