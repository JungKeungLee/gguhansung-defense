// 4.5단계 밸런스 시뮬레이터 — 실제 Battle/army 로직 재사용, 고정 시드, 미래 정보 미사용
// 사용법: npm run balance -- [전략=ABCDEF] [시드=1,2,3] [v=상세|-] [설정.json 경로 또는 JSON 문자열]
//   Windows(npm)는 JSON 따옴표가 사라지므로 파일 경로 사용 권장: npm run balance -- ABCDE 1,2,3 - tools/balance/configs/nosyn.json
//   전략 R 무작위 플레이(일반 소환 연타+자동 합성, 재배치·판매·집중 소환 없음, 강화는 설정 upg를 따름)
//   전략 A 일반 소환·다양화 / B 집중 소환 주력 / C 단독 1성 판매 후 재소환 / D 역할 혼합 배치 / E 상현·하현 5인 조합 지향 / F 5성 1명 집중 육성
//   '{"nosyn":1}' 시너지 비활성(기존 밸런스 비교)
//   오버라이드 예: '{"peak":1}' '{"power":1}' '{"diag":1}' '{"curve":{"k":0.085}}' '{"mult":0.5,"bossMult":0.5}'
//   '{"boss":{"chaosLord":50000}}' '{"ival":{"base":0.8,"step":0.012,"floor":0.5}}' '{"count":{"m":0.8,"from":10}}'
//   오버라이드는 실행 중 메모리에서만 적용되며 데이터 파일은 바뀌지 않음
import { Battle, type Unit } from '../../src/game/combat';
import { buyUpgrade, summon, mergeAll, sell, moveUnit, isFocusUnlocked } from '../../src/game/army';
import { MEMBERS } from '../../src/data/members';
import { unitStats, STAR_DAMAGE_MULT } from '../../src/data/units';
import { WAVES } from '../../src/data/waves';
import { MONSTERS } from '../../src/data/monsters';
import { cellCenter, pathPoint, PATH_LENGTH, FIELD_SLOTS, GRID } from '../../src/game/layout';

export type Strategy = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'R';
import { readFileSync } from 'node:fs';
import { SYNERGIES, SYNERGY_CAPS, TIER_RULES } from '../../src/data/synergies';
import { UPGRADES, UPGRADE_IDS, UPGRADE_MAX } from '../../src/data/upgrades';
import { DIFFICULTIES, type DifficultyId } from '../../src/data/difficulty';
/** 전역 강화 투자 정책 (실제 골드 차감, 소환과 경쟁). none: 안 함 / some: 8웨이브마다 목표 1단계↑ / heavy: 5웨이브마다 목표 1단계↑ */
let UPG: 'none' | 'some' | 'heavy' = 'none';
let DIFF: DifficultyId = 'normal';
const UPG_ORDER = ['attack', 'attackSpeed', 'skill', 'range'] as const;
function buyUpgrades(b: Battle) {
  if (UPG === 'none') return;
  const target = Math.min(UPGRADE_MAX, Math.floor(b.waveNumber / (UPG === 'some' ? 8 : 5)));
  for (const id of UPG_ORDER) {
    if (UPG === 'some' && id === 'range') continue; // 일부 투자: 공격력·공속·스킬만
    while (b.upgrades[id] < target && b.gold >= UPGRADES[id].costs[b.upgrades[id]]) buyUpgrade(b, id);
  }
}
const FIVE = ['nanwony', 'yappu', 'yuntami', 'harunotsuki', 'kkutinho', 'yamuji', 'manjo', 'kimokdok', 'damyu'];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// 셀별 사거리 커버리지 (경로 중 사거리 안 비율)
const SAMPLES = Array.from({ length: 200 }, (_, i) => pathPoint((i * PATH_LENGTH) / 200));
const covCache = new Map<string, number>();
function coverage(cell: number, range: number) {
  const k = cell + ':' + range; let v = covCache.get(k);
  if (v === undefined) { const c = cellCenter(cell % GRID.cols, Math.floor(cell / GRID.cols)); v = SAMPLES.filter((p) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2 <= range * range).length / 200; covCache.set(k, v); }
  return v;
}
const ROLE_W: Record<string, number> = { manjo: 1.8, damyu: 1.5, yamuji: 1.5, harunotsuki: 1.3, kkutinho: 1.2, nanwony: 1.2, moya: 1.2 };
const score = (u: Unit) => { const s = unitStats(u.memberId, u.star); return s.damage * s.attackSpeed * (ROLE_W[u.memberId] ?? 1); };

/** 상위 20명을 전투 칸에, 커버리지가 좋은 칸 우선 배치 */
function arrange(b: Battle, strat: Strategy) {
  let ranked = b.units.slice().sort((x, y) => score(y) - score(x));
  if (strat === 'D') { // 감속·지원·광역 최소 1명씩 보장
    const must: Unit[] = [];
    for (const id of ['harunotsuki', 'kkutinho', 'manjo', 'damyu']) { const best = ranked.find((u) => u.memberId === id); if (best) must.push(best); }
    ranked = [...must, ...ranked.filter((u) => !must.includes(u))];
  }
  if (strat === 'E') { // 상현·하현 멤버 각 최고 등급 1명씩 우선 배치
    const must = FIVE.map((id) => ranked.find((u) => u.memberId === id)).filter(Boolean) as Unit[];
    ranked = [...must, ...ranked.filter((u) => !must.includes(u))];
  }
  const chosen = ranked.slice(0, FIELD_SLOTS);
  // 현재 배치 품질 계산 → 필요한 경우만 재배치
  const free = new Set(Array.from({ length: FIELD_SLOTS }, (_, i) => i));
  const plan = new Map<Unit, number>();
  for (const u of chosen.slice().sort((x, y) => score(y) - score(x))) {
    let best = -1, bv = -1; const r = unitStats(u.memberId, u.star).range;
    for (const c of free) { const v = coverage(c, r); if (v > bv) { bv = v; best = c; } }
    plan.set(u, best); free.delete(best);
  }
  // 먼저 비선택 유닛을 보관함으로
  for (const u of b.units) if (u.area === 'field' && !plan.has(u)) { const s = b.freeSlot(); const si = s?.area === 'storage' ? s.index : firstStorage(b); if (si >= 0) moveUnit(b, u.id, 'storage', si); }
  for (const [u, c] of plan) if (!(u.area === 'field' && u.index === c)) moveUnit(b, u.id, 'field', c);
}
function firstStorage(b: Battle) { for (let i = 0; i < 20; i++) if (!b.unitAtSlot('storage', i)) return i; return -1; }

const carryOf = new WeakMap<Battle, string>();
function focusTarget(b: Battle, strat: Strategy): string | undefined {
  if (!isFocusUnlocked(b)) return undefined;
  if (strat === 'F') { // 5성 1명 완성까지 같은 주력만 집중 (주력은 6웨이브 시점 보유 가치로 1회 결정)
    if (!carryOf.has(b)) {
      const v = (id: string) => b.units.filter((u) => u.memberId === id).reduce((s, u) => s + 2 ** (u.star - 1), 0) * score1(id);
      carryOf.set(b, MEMBERS.filter((m) => m.id !== 'kkutinho').sort((x, y) => v(y.id) - v(x.id))[0].id);
    }
    const c = carryOf.get(b)!;
    return b.units.some((u) => u.memberId === c && u.star >= 5) ? undefined : c;
  }
  const val = (id: string) => b.units.filter((u) => u.memberId === id).reduce((s, u) => s + 3 ** (u.star - 1), 0);
  if (strat === 'B') { // 주력 1명 집중 육성 (4성 이상 완성되면 다음 주력)
    const cands = MEMBERS.filter((m) => m.id !== 'kkutinho' && !b.units.some((u) => u.memberId === m.id && u.star >= 4));
    return cands.sort((x, y) => val(y.id) - val(x.id) || score1(y.id) - score1(x.id))[0]?.id;
  }
  if (strat === 'E') { // 5인 조건: 2성 미만 멤버 → 3성 2명 확보 순으로 집중
    const top = (id: string) => Math.max(0, ...b.units.filter((u) => u.memberId === id).map((u) => u.star));
    const low = FIVE.filter((id) => top(id) < 2).sort((x, y) => val(y) - val(x));
    if (low.length) return low[0];
    const highs = FIVE.filter((id) => top(id) >= 3).length;
    if (highs < 4) return FIVE.filter((id) => top(id) < 3).sort((x, y) => val(y) - val(x))[0];
    return undefined;
  }
  if (strat === 'D') { // 합성 직전(같은 등급 2개) 멤버 마무리
    const ones = MEMBERS.map((m) => ({ id: m.id, n: b.units.filter((u) => u.memberId === m.id && u.star === 1).length }));
    const pick = ones.filter((o) => o.n % 3 === 2).sort((x, y) => val(y.id) - val(x.id))[0];
    return pick?.id;
  }
  return undefined;
}
const score1 = (id: string) => { const s = unitStats(id, 1); return s.damage * s.attackSpeed * (ROLE_W[id] ?? 1); };

function act(b: Battle, strat: Strategy, rng: () => number) {
  if (b.isOver) return;
  if (strat === 'R') { // 무작위: 골드가 되면 일반 소환(빈 칸 순서대로 들어감) + 자동 합성. 배치는 손대지 않음
    buyUpgrades(b);
    while (b.gold >= 30 && summon(b, undefined, rng).ok) mergeAll(b);
    return;
  }
  buyUpgrades(b); // 강화 목표 우선 구매 후 남은 골드로 소환
  for (let guard = 0; guard < 40; guard++) {
    const f = focusTarget(b, strat);
    const cost = f ? 40 : 30;
    if (b.gold < cost) break;
    if (!b.freeSlot()) {
      // 공간 부족: 판매 후 재소환 (A·B·D는 가득 찼을 때만, C는 아래에서 선제 판매)
      const singles = b.units.filter((u) => u.star === 1 && b.units.filter((o) => o.memberId === u.memberId && o.star === 1).length === 1);
      const keep = carryOf.get(b);
      const victim = (singles.length ? singles : b.units.filter((u) => u.star === 1)).filter((u) => u.memberId !== keep).sort((x, y) => score(x) - score(y))[0];
      if (!victim || !sell(b, victim.id).ok) break;
      continue;
    }
    const r = summon(b, f, rng);
    if (!r.ok) break;
    mergeAll(b);
  }
  if (strat === 'C' && b.gold < 30 && b.waveNumber >= 3) { // 단독 1성(합성 가망 낮음) 판매 → 재소환 자금
    const singles = b.units.filter((x) => x.star === 1 && b.units.filter((o) => o.memberId === x.memberId && o.star <= 2).length === 1).sort((x, y) => score(x) - score(y));
    if (singles.length && b.gold + 20 >= 30) { sell(b, singles[0].id); const r = summon(b, undefined, rng); if (r.ok) mergeAll(b); }
  }
  mergeAll(b);
  arrange(b, strat);
}

export interface SimResult {
  strat: Strategy; seed: number; win: boolean; wave: number; reason: string; finalLeft: number | null;
  time: number; stars: number[]; peakWave: number; peakAlive: number; bossTimes: Record<string, number>; bossCarry: string[]; goldSpent: number; field: string; power: number[]; peakBy: number[]; synBy: number[]; firstTier: Record<number, number>; ever: number; topAt: Record<number, number>; synFirst: Record<string, number>; lordTime: number | null; allStars: number[]; avgGold: number; endGold: number; violations: number; topEnd: number; upg: string; upgSpent: number; synEnd: number; peakAll: number; life: number;
}

let DIAG = false; let NOSYN = false;
export function runSim(strat: Strategy, seed: number, dt = 1 / 30): SimResult {
  let goldSum = 0, goldN = 0, violations = 0;
  const rng = mulberry32(seed);
  const b = new Battle(DIFF); b.rng = mulberry32(seed * 7 + 1); b.synergyEnabled = !NOSYN;
  let t = 0, actT = 0, peakAlive = 0, peakWave = 0; const bossSeen = new Map<number, { name: string; t: number; wave: number }>(); const bossTimes: Record<string, number> = {}; const bossCarry: string[] = [];
  let spent = 0; const g0 = { v: b.gold }; const power: number[] = []; let lastW = 0; const synBy: number[] = []; const firstTier: Record<number, number> = {}; const ever = new Set<string>(); const topAt: Record<number, number> = {}; const synFirst: Record<string, number> = {}; const peakBy: number[] = []; const life: number[] = []; const born = new Map<number, number>();
  while (!b.isOver && t < 4000) {
    if ((actT -= dt) <= 0) {
      const before = b.gold; act(b, strat, rng); spent += Math.max(0, before - b.gold); actT = 0.5;
      goldSum += b.gold; goldN++;
      // 규칙 위반 검사 (6-F): 골드 음수, 유닛 40 초과, 전투 칸 20 초과, 같은 칸 중복
      const field = b.units.filter((u) => u.area === 'field');
      if (b.gold < 0 || b.units.length > 40 || field.length > 20 || new Set(b.units.map((u) => u.area + u.index)).size !== b.units.length) violations++;
    }
    b.step(dt); t += dt;
    if (b.waveNumber !== lastW) { lastW = b.waveNumber; power[lastW] = Math.round(b.units.filter((u) => u.area === 'field').reduce((a, u) => a + score(u), 0)); }
    peakBy[b.waveNumber] = Math.max(peakBy[b.waveNumber] ?? 0, b.monsters.length);
    synBy[b.waveNumber] = b.syn.active.size;
    if ([20, 25, 30].includes(b.waveNumber) && topAt[b.waveNumber] === undefined && b.spawned >= b.waveTotal) topAt[b.waveNumber] = Math.max(0, ...b.units.map((u) => u.star));
    for (const id of b.syn.active) { ever.add(id); synFirst[id] ??= b.waveNumber; const tier = SYNERGIES.find((d) => d.id === id)!.tier; firstTier[tier] ??= b.waveNumber; }
    if (b.waveNumber >= 26) { const ids = new Set<number>(); for (const m of b.monsters) { ids.add(m.id); if (!born.has(m.id) && !m.def.boss) born.set(m.id, t); } for (const [id, t0] of born) if (!ids.has(id)) { life.push(t - t0); born.delete(id); } }
    if (b.monsters.length > peakAlive) { peakAlive = b.monsters.length; peakWave = b.waveNumber; }
    for (const m of b.monsters) if (m.def.boss && !bossSeen.has(m.id)) bossSeen.set(m.id, { name: m.def.name, t, wave: b.waveNumber });
    for (const [id, s] of bossSeen) {
      if (bossTimes[s.name] !== undefined) continue;
      if (!b.monsters.some((m) => m.id === id)) bossTimes[s.name] = +(t - s.t).toFixed(1);
      else if (b.waveNumber > s.wave && !bossCarry.includes(s.name)) bossCarry.push(s.name);
    }
  }
  if (DIAG) { const by: Record<string, [number, number]> = {}; for (const m of b.monsters) { const e = (by[m.def.name] ??= [0, 0]); e[0]++; e[1] += m.hp / m.maxHp; }
    console.log(`   [진단 seed${seed}] w${b.waveNumber} ` + Object.entries(by).map(([k, [n, h]]) => `${k}${n}(${Math.round((h / n) * 100)}%)`).join(' ') + ` | 처치 ${b.kills} 골드잔액 ${b.gold}`); }
  const stars = [0, 0, 0, 0, 0]; for (const u of b.units) if (u.area === 'field') stars[u.star - 1]++;
  const field = b.units.filter((u) => u.area === 'field').sort((x, y) => y.star - x.star).slice(0, 6).map((u) => `${MEMBERS.find((m) => m.id === u.memberId)!.name}${u.star}`).join(' ');
  void g0; void STAR_DAMAGE_MULT; void WAVES;
  return { strat, seed, time: +t.toFixed(0), win: b.phase === 'victory', wave: b.waveNumber, reason: b.defeatReason ?? (b.phase === 'victory' ? 'win' : b.phase), finalLeft: b.finalTimer === null ? null : +b.finalTimer.toFixed(0), stars, peakWave, peakAlive, bossTimes, bossCarry, goldSpent: spent, field, power, peakBy, synBy, firstTier, ever: ever.size, topAt, synFirst, lordTime: bossTimes['혼돈의 군주'] ?? null, upg: UPGRADE_IDS.map((id) => b.upgrades[id]).join(''), upgSpent: UPGRADE_IDS.reduce((s, id) => s + UPGRADES[id].costs.slice(0, b.upgrades[id]).reduce((a, c) => a + c, 0), 0), synEnd: b.syn.active.size, peakAll: peakAlive, avgGold: Math.round(goldSum / Math.max(1, goldN)), endGold: b.gold, violations, topEnd: Math.max(0, ...b.units.map((u) => u.star)), allStars: [1, 2, 3, 4, 5].map((s) => b.units.filter((u) => u.star === s).length), life: life.length ? +(life.reduce((a, c) => a + c, 0) / life.length).toFixed(1) : 0 };
}

// CLI
const strats = (process.argv[2] ?? 'ABCD').split('') as Strategy[];
const seeds = (process.argv[3] ?? '1,2,3').split(',').map(Number);
const verbose = process.argv[4] === 'v';
const cfgArg = process.argv[5];
const cfg = !cfgArg ? {} : cfgArg.trim().startsWith('{') ? JSON.parse(cfgArg) : JSON.parse(readFileSync(cfgArg, 'utf-8'));
DIAG = !!cfg.diag; NOSYN = !!cfg.nosyn; UPG = cfg.upg ?? 'none'; DIFF = cfg.diff ?? 'normal';
if (cfg.hard) Object.assign(DIFFICULTIES.hard, cfg.hard);
if (cfg.normal) Object.assign(DIFFICULTIES.normal, cfg.normal); // 보통 난이도 후보 실험 (메모리에서만)
if (cfg.upgPer) for (const [id, v] of Object.entries(cfg.upgPer)) (UPGRADES as any)[id].perLevel = v;
if (cfg.upgCostMult) for (const u of Object.values(UPGRADES)) u.costs = u.costs.map((c) => Math.round(c * cfg.upgCostMult));
if (cfg.scale) cfg.scale.forEach((v: number, i: number) => (WAVES[i].hpScale = v));
if (cfg.curve) WAVES.forEach((w, i) => { if (i >= 5) w.hpScale = +(2.8 * (1 + cfg.curve.k * (i - 4)) * (cfg.curve.c ?? 1) ** ((i - 4) / 25)).toFixed(2); });
if (cfg.ival) WAVES.forEach((w, i) => (w.interval = Math.max(cfg.ival.floor, +(cfg.ival.base - cfg.ival.step * i).toFixed(3))));
if (cfg.count) WAVES.forEach((w, i) => { if (i >= (cfg.count.from ?? 0)) w.groups.forEach((g) => (g.count = Math.max(1, Math.round(g.count * cfg.count.m)))); });
if (cfg.noHeal) { (MONSTERS as any).shaman.abilities[0].pct = 0; }
if (cfg.mons) for (const [id, v] of Object.entries(cfg.mons)) Object.assign((MONSTERS as any)[id], v);
// synOff: 시너지 ID 또는 'tier2'·'tier3'·'tier5'·'tier10' 묶음 제외 (기여도 분석용)
if (cfg.synOff) for (const id of cfg.synOff) for (let i = SYNERGIES.length - 1; i >= 0; i--) if (SYNERGIES[i].id === id || 'tier' + SYNERGIES[i].tier === id) SYNERGIES.splice(i, 1);
if (cfg.synSet) for (const [id, eff] of Object.entries(cfg.synSet as Record<string, any[]>)) { const d = SYNERGIES.find((x) => x.id === id); if (d) d.effects = eff; }
if (cfg.synCaps) Object.assign(SYNERGY_CAPS, cfg.synCaps);
// tierRules: 시너지 등급 조건 실험 (예: {"2":{"highCount":1}}) — 메모리에서만 적용
if (cfg.tierRules) for (const [t, v] of Object.entries(cfg.tierRules)) Object.assign((TIER_RULES as any)[t], v);
// rangeMult: 유닛 사거리 추가 배율 (실험용, 메모리에서만 적용. 맵 보정 0.75는 units.ts에서 이미 적용됨)
if (cfg.rangeMult) for (const m of MEMBERS) m.range = Math.round(m.range * cfg.rangeMult);
if (cfg.synNoPeriodic) for (const d of SYNERGIES) for (const e of d.effects) if (e.kind === 'periodic') e.mult = 0;
if (cfg.synPeriodicMult) for (const d of SYNERGIES) for (const e of d.effects) if (e.kind === 'periodic') e.mult *= cfg.synPeriodicMult;
if (cfg.mult) WAVES.forEach((w) => (w.hpScale *= cfg.mult));
if (cfg.boss) for (const [id, hp] of Object.entries(cfg.boss)) (MONSTERS as any)[id].hp = hp;
if (cfg.bossMult) for (const m of Object.values(MONSTERS) as any[]) if (m.boss) m.hp *= cfg.bossMult;
const t0 = Date.now();
// jsonl: 실행 1회당 요약 1줄 (대량 시뮬레이션 집계용)
if (cfg.jsonl) {
  for (const s of strats) for (const seed of seeds) {
    let r: SimResult | null = null, crash = '';
    try { r = runSim(s, seed); } catch (e) { crash = String(e); }
    if (!r) { console.log(JSON.stringify({ s, seed, crash })); continue; }
    const fs = r.stars, n = fs.reduce((a, c) => a + c, 0);
    console.log(JSON.stringify({ s, seed, time: r.time, win: r.win, wave: r.wave, reason: r.reason, left: r.finalLeft, lord: r.lordTime, gold: r.avgGold, endGold: r.endGold,
      star: +(fs.reduce((a, c, i) => a + c * (i + 1), 0) / Math.max(1, n)).toFixed(2), fieldStars: fs, top20: r.topAt[20] ?? 0, top25: r.topAt[25] ?? 0, top30: r.topAt[30] ?? 0, topEnd: r.topEnd,
      syn: r.synEnd, syn20: r.synBy[20] ?? 0, upg: r.upg, upgSpent: r.upgSpent, spent: r.goldSpent, peak: r.peakAll, peakBy: r.peakBy.slice(1, 31), viol: r.violations, boss: r.bossTimes }));
  }
  process.exit(0);
}
for (const s of strats) {
  const rs = seeds.map((seed) => runSim(s, seed));
  const wins = rs.filter((r) => r.win).length;
  const avgStar = rs.map((r) => (r.stars.reduce((a, c, i) => a + c * (i + 1), 0) / Math.max(1, r.stars.reduce((a, c) => a + c, 0))).toFixed(2));
  console.log(`[${s}] 승리 ${wins}/${rs.length} | 도달 ${rs.map((r) => r.wave + (r.win ? 'W' : r.reason[0])).join(',')} | 남은시간 ${rs.map((r) => r.finalLeft ?? '-').join(',')} | 평균등급 ${avgStar.join(',')}`);
  if (!NOSYN) {
    const avgAt = (w: number) => (rs.reduce((a, r) => a + (r.synBy[w] ?? 0), 0) / rs.length).toFixed(1);
    const first = (t: number) => { const ws = rs.map((r) => r.firstTier[t]).filter((x) => x !== undefined); return ws.length ? `w${Math.round(ws.reduce((a, c) => a + c, 0) / ws.length)}(${ws.length}/${rs.length})` : '-'; };
    console.log(`   시너지 활성 평균 w10:${avgAt(10)} w20:${avgAt(20)} w30:${avgAt(30)} | 최초 발동 2인 ${first(2)} 3인 ${first(3)} 5인 ${first(5)} 10인 ${first(10)} | 경험 종류 평균 ${(rs.reduce((a, r) => a + r.ever, 0) / rs.length).toFixed(1)}`);
  }
  if (cfg.summary) {
    const avg = (f: (r: SimResult) => number) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(0);
    const lt = rs.filter((r) => r.lordTime !== null).map((r) => r.lordTime!);
    console.log(`   최대생존 ${avg((r) => r.peakAll)} | 사용골드 ${avg((r) => r.goldSpent)} (강화 ${avg((r) => r.upgSpent)}) | 강화단계(공·속·스·사) ${rs.map((r) => r.upg).join(',')} | 3/4/5성 ${[2, 3, 4].map((i) => (rs.reduce((a, r) => a + r.allStars[i], 0) / rs.length).toFixed(1)).join('/')} | 활성시너지 ${(rs.reduce((a, r) => a + r.synEnd, 0) / rs.length).toFixed(1)} | 보스처치 ${lt.length ? (lt.reduce((a, c) => a + c, 0) / lt.length).toFixed(0) + 's' : '-'}`);
  }
  if (cfg.stars) {
    const rate = (w: number, s: number) => `${rs.filter((r) => (r.topAt[w] ?? 0) >= s).length}/${rs.length}`;
    const lt = rs.filter((r) => r.lordTime !== null).map((r) => r.lordTime!);
    const avgAll = [0, 1, 2, 3, 4].map((i) => (rs.reduce((a, r) => a + r.allStars[i], 0) / rs.length).toFixed(1));
    console.log(`   보유 등급: w20 4성↑ ${rate(20, 4)} · 5성 ${rate(20, 5)} | w25 5성 ${rate(25, 5)} | w30 5성 ${rate(30, 5)} | 최종 보유(1~5성 평균) ${avgAll.join('/')} | 최종보스 처치 ${lt.length ? (lt.reduce((a, c) => a + c, 0) / lt.length).toFixed(0) + '초' : '-'}`);
  }
  if (cfg.synTiming) {
    console.log('   시너지 최초 발동(평균 웨이브·발동률) ' + SYNERGIES.map((d) => { const ws = rs.map((r) => r.synFirst[d.id]).filter((x) => x !== undefined); return `${d.name}:${ws.length ? 'w' + Math.round(ws.reduce((a, c) => a + c, 0) / ws.length) : '-'}(${ws.length}/${rs.length})`; }).join(' '));
  }
  if (cfg.power) { const avg = (w: number) => Math.round(rs.reduce((a, r) => a + (r.power[w] ?? 0), 0) / rs.length); console.log('   전력(웨이브 시작 시 전투칸 화력합)', [1, 5, 10, 15, 20, 25, 30].map((w) => `w${w}:${avg(w)}`).join(' ')); }
  if (cfg.peak) { const avg = (w: number) => Math.round(rs.reduce((a, r) => a + (r.peakBy[w] ?? 80), 0) / rs.length); console.log('   웨이브별 최대 생존 수(평균) ' + Array.from({ length: 30 }, (_, i) => avg(i + 1)).join(',') + ` | 26~30웨이브 일반 몬스터 평균 생존 ${(rs.reduce((a, r) => a + r.life, 0) / rs.length).toFixed(1)}초`); }
  if (verbose) for (const r of rs) console.log(`   seed${r.seed} 등급분포${JSON.stringify(r.stars)} 최대${r.peakAlive}@w${r.peakWave} 보스(초)${JSON.stringify(r.bossTimes)} 잔류${r.bossCarry.join('/') || '-'} | ${r.field}`);
}
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
