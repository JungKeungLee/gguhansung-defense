import type { MonsterId } from './monsters';

export interface WaveDef {
  /** 몬스터 구성 (출현 순서는 종류별로 고르게 섞임) */
  groups: { monster: MonsterId; count: number }[];
  /** 마지막에 등장하는 보스 */
  boss?: MonsterId;
  /** 소환 간격(초) */
  interval: number;
  /** 일반 몬스터 체력 배율 (보스는 고정 체력) */
  hpScale: number;
  /** 31~50웨이브: 일반 몬스터 구성을 웨이브 시작 시 랜덤으로 1회 확정 (groups는 비어 있음) */
  random?: boolean;
  /** 보스를 기존 보스 중 랜덤 선택 (boss 대신) */
  bossPool?: boolean;
  /** 이 웨이브 보스의 기본 체력 (난이도 보스 배율 적용 전). 없으면 몬스터 기본 체력 */
  bossHp?: number;
  /** 보스를 처치해야 다음 웨이브로 진행 (30·35·40·45) */
  gate?: boolean;
  /** 최종 보스 웨이브 (보스 등장 시 제한시간 시작, 처치 시 최종 보스 처치 기록) — 50웨이브만 */
  final?: boolean;
}

/** 살아 있는 몬스터가 이 수에 도달하면 즉시 패배 */
export const MAX_ALIVE = 80;
/** 게임 시작 후 첫 웨이브까지 준비 시간(초) */
export const FIRST_PREP_TIME = 5;
/** 웨이브 소환 완료 후 다음 웨이브까지 준비 시간(초) */
export const PREP_TIME = 6;
/** 최종 보스 등장 후 제한시간(초) */
export const FINAL_BOSS_TIME = 180;
/** 30·35·40·45웨이브 보스 대기 제한(게임 시간 초): 보스 등장부터 계산, 지나면 보스를 남긴 채 준비 시간 후 다음 웨이브 */
export const BOSS_GATE_TIME = 30;

type G = [MonsterId, number][];
type Plan = { g: G; boss?: MonsterId } & Pick<WaveDef, 'random' | 'bossPool' | 'bossHp' | 'gate' | 'final'>;
// 웨이브별 구성 (1~30: 고정 구성, 31~50: 랜덤 후반 구간)
const PLAN: Plan[] = [
  { g: [['slime', 10]] },
  { g: [['slime', 14]] },
  { g: [['slime', 18]] },
  { g: [['slime', 22]] },
  { g: [['slime', 25]], boss: 'slimeKing' },
  { g: [['slime', 12], ['goblin', 6]] },
  { g: [['slime', 12], ['goblin', 8]] },
  { g: [['slime', 10], ['goblin', 10]] },
  { g: [['slime', 10], ['goblin', 8], ['golem', 4]] },
  { g: [['goblin', 10], ['golem', 8]], boss: 'golemBoss' },
  { g: [['slime', 10], ['splitter', 5], ['golem', 5]] },
  { g: [['slime', 8], ['splitter', 6], ['goblin', 8]] },
  { g: [['splitter', 7], ['golem', 6], ['goblin', 8]] },
  { g: [['splitter', 5], ['shaman', 3], ['slime', 12]] },
  { g: [['splitter', 5], ['shaman', 4], ['golem', 7]], boss: 'frenzyKnight' },
  { g: [['shaman', 3], ['slime', 10], ['goblin', 10], ['golem', 5]] },
  { g: [['ghost', 10], ['shaman', 3], ['slime', 10]] },
  { g: [['ghost', 12], ['shaman', 4], ['goblin', 8]] },
  { g: [['ghost', 12], ['shaman', 4], ['golem', 8]] },
  { g: [['ghost', 10], ['shaman', 4], ['splitter', 5]], boss: 'darkMage' },
  { g: [['guard', 3], ['slime', 14], ['golem', 8]] },
  { g: [['guard', 4], ['goblin', 12], ['ghost', 8]] },
  { g: [['guard', 4], ['golem', 10], ['shaman', 4]] },
  { g: [['guard', 4], ['ghost', 10], ['splitter', 6]] },
  { g: [['berserker', 6], ['guard', 4], ['goblin', 10]], boss: 'chaosGuardian' },
  { g: [['berserker', 6], ['guard', 4], ['ghost', 8], ['shaman', 3], ['goblin', 6]] },
  { g: [['berserker', 8], ['golem', 8], ['splitter', 5], ['guard', 4]] },
  { g: [['berserker', 8], ['ghost', 10], ['shaman', 4], ['guard', 4]] },
  { g: [['berserker', 9], ['golem', 8], ['splitter', 6], ['guard', 4], ['ghost', 5]] },
  // 30웨이브 혼돈의 군주는 중간 보스 (제한시간 없음, 처치해야 31웨이브 진행). 기본 체력 80,000 그대로
  { g: [['berserker', 8], ['ghost', 8], ['shaman', 4], ['guard', 4], ['golem', 6]], boss: 'chaosLord', gate: true },
  // ── 31~50웨이브 (50웨이브 확장): 일반 몬스터 랜덤, 35·40·45 랜덤 보스, 50 최종 보스 강화형 ──
  // bossHp는 난이도 배율 적용 전 기본값: 보통 ×2.5 → 220k·250k·280k·320k / 어려움 ×3.0 → 264k·300k·336k·384k
  ...lateWaves(),
];

function lateWaves(): Plan[] {
  const BOSS_HP: Record<number, number> = { 35: 88000, 40: 100000, 45: 112000 };
  return Array.from({ length: 20 }, (_, k) => {
    const w = 31 + k;
    if (w === 50) return { g: [], random: true, boss: 'chaosLord' as MonsterId, bossHp: 128000, final: true };
    if (BOSS_HP[w]) return { g: [], random: true, bossPool: true, bossHp: BOSS_HP[w], gate: true };
    return { g: [], random: true };
  });
}
// 1~5웨이브는 기존 배율 유지, 6웨이브부터 선형 증가 (4.5단계 시뮬레이션 기반: 기존 ×1.15 지수 증가는 실제 화력 성장보다 가파름)
const EARLY_HP = [1, 1.3, 1.7, 2.2, 2.8];
/** 6웨이브부터 웨이브당 체력 증가량 (5웨이브 배율 대비) */
const HP_SLOPE = 0.085;

export const WAVES: WaveDef[] = PLAN.map((p, i) => ({
  groups: p.g.map(([monster, count]) => ({ monster, count })),
  boss: p.boss,
  random: p.random, bossPool: p.bossPool, bossHp: p.bossHp, gate: p.gate, final: p.final,
  interval: Math.max(0.5, +(0.8 - 0.012 * i).toFixed(3)),
  hpScale: i < 5 ? EARLY_HP[i] : +(EARLY_HP[4] * (1 + HP_SLOPE * (i - 4))).toFixed(2),
}));

/** 웨이브 출현 순서: 종류별로 고르게 섞고 보스는 마지막 */
/** countMult: 난이도별 출현 수 배율 (보스 제외) */
export function waveSpawnList(w: WaveDef, countMult = 1): MonsterId[] {
  const items: { id: MonsterId; k: number }[] = [];
  w.groups.forEach((g, gi) => {
    const count = Math.max(1, Math.round(g.count * countMult));
    for (let i = 0; i < count; i++) items.push({ id: g.monster, k: (i + 0.5) / count + gi * 1e-6 });
  });
  items.sort((a, b) => a.k - b.k);
  const list = items.map((x) => x.id);
  if (w.boss) list.push(w.boss);
  return list;
}

// ── 31~50웨이브 랜덤 구성 ──
/** 랜덤 후반 구간에 쓰는 기존 일반·특수 몬스터 9종 (능력·이미지 그대로) */
export const RANDOM_GROUPS: Record<'fast' | 'tank' | 'special' | 'basic', MonsterId[]> = {
  fast: ['goblin', 'ghost', 'berserker'],
  tank: ['golem', 'guard'],
  special: ['splitter', 'shaman'],
  basic: ['slime', 'miniSlime'],
};
export const RANDOM_MONSTERS = Object.values(RANDOM_GROUPS).flat();
/** 35·40·45웨이브 랜덤 보스 후보 (최종 보스 혼돈의 군주 제외) */
export const BOSS_POOL: MonsterId[] = ['slimeKing', 'golemBoss', 'frenzyKnight', 'darkMage', 'chaosGuardian'];
/** 종류별 상한: 분열(작은 슬라임 2마리씩)·치유·수호 오라가 몰려 80마리 패배가 불합리하게 나지 않도록 (26~30웨이브 최대치 수준) */
const KIND_CAP: Partial<Record<MonsterId, number>> = { splitter: 6, shaman: 4, guard: 5, miniSlime: 8 };
/** 한 종류가 전체의 40%를 넘지 않음 */
const MAX_SHARE = 0.4;

/** 랜덤 웨이브 예정 출현 수(난이도 배율 전): 26~30웨이브(25~32마리) 수준, 5웨이브마다 +1 (31~35: 28 … 46~50: 31) */
export const randomWaveTotal = (wave: number) => 28 + Math.floor((wave - 31) / 5);

/** 31~50웨이브 일반 몬스터 구성: 빠른·방어·특수형 각 1종 이상 포함, 3~5종, 종류별 상한 적용. 웨이브 시작 시 1회 호출 */
export function randomWaveGroups(wave: number, rng: () => number): WaveDef['groups'] {
  const pick = <T,>(arr: T[]) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
  const kinds: MonsterId[] = [pick(RANDOM_GROUPS.fast), pick(RANDOM_GROUPS.tank), pick(RANDOM_GROUPS.special)];
  const want = 3 + Math.min(2, Math.floor(rng() * 3)); // 3~5종
  while (kinds.length < want) { const m = pick(RANDOM_MONSTERS.filter((x) => !kinds.includes(x))); kinds.push(m); }
  const total = randomWaveTotal(wave);
  const share = Math.floor(total * MAX_SHARE);
  const cap = (m: MonsterId) => Math.min(share, KIND_CAP[m] ?? share);
  const w = kinds.map(() => 0.6 + rng());
  const sum = w.reduce((a, c) => a + c, 0);
  const counts = kinds.map((m, i) => Math.max(2, Math.min(cap(m), Math.round((total * w[i]) / sum))));
  // 반올림·상한으로 생긴 차이를 상한 여유가 있는 종류에 1마리씩 분배
  let diff = total - counts.reduce((a, c) => a + c, 0);
  for (let guard = 0; diff !== 0 && guard < 400; guard++) {
    const room = kinds.some((m, i) => counts[i] < cap(m));
    if (diff > 0 && !room) { // 고른 종류가 모두 상한이면 종류를 추가(최대 5종)해 출현 수를 채움
      if (kinds.length >= 5) break;
      const extra = RANDOM_MONSTERS.filter((x) => !kinds.includes(x));
      const add = pick(extra.filter((x) => !KIND_CAP[x]).length ? extra.filter((x) => !KIND_CAP[x]) : extra);
      kinds.push(add); counts.push(2); diff -= 2; // 최소 2마리로 추가, 넘친 수는 아래에서 다른 종류에서 줄임
      continue;
    }
    const i = guard % kinds.length;
    if (diff > 0 && counts[i] < cap(kinds[i])) { counts[i]++; diff--; }
    else if (diff < 0 && counts[i] > 2) { counts[i]--; diff++; }
  }
  return kinds.map((monster, i) => ({ monster, count: counts[i] }));
}

/** 웨이브 시작 시 실제 구성 확정: 랜덤 웨이브는 일반 몬스터·랜덤 보스를 1회 결정, 고정 웨이브는 그대로 */
export function resolveWave(w: WaveDef, wave: number, rng: () => number): WaveDef {
  if (!w.random) return w;
  const boss = w.bossPool ? BOSS_POOL[Math.min(BOSS_POOL.length - 1, Math.floor(rng() * BOSS_POOL.length))] : w.boss;
  return { ...w, groups: randomWaveGroups(wave, rng), boss };
}
