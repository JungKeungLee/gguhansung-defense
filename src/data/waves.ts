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
}

/** 살아 있는 몬스터가 이 수에 도달하면 즉시 패배 */
export const MAX_ALIVE = 80;
/** 게임 시작 후 첫 웨이브까지 준비 시간(초) */
export const FIRST_PREP_TIME = 5;
/** 웨이브 소환 완료 후 다음 웨이브까지 준비 시간(초) */
export const PREP_TIME = 6;
/** 최종 보스 등장 후 제한시간(초) */
export const FINAL_BOSS_TIME = 180;

type G = [MonsterId, number][];
// 웨이브별 구성 (초기 밸런스 값)
const PLAN: { g: G; boss?: MonsterId }[] = [
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
  { g: [['berserker', 8], ['ghost', 8], ['shaman', 4], ['guard', 4], ['golem', 6]], boss: 'chaosLord' },
];
// 1~5웨이브는 기존 배율 유지, 6웨이브부터 선형 증가 (4.5단계 시뮬레이션 기반: 기존 ×1.15 지수 증가는 실제 화력 성장보다 가파름)
const EARLY_HP = [1, 1.3, 1.7, 2.2, 2.8];
/** 6웨이브부터 웨이브당 체력 증가량 (5웨이브 배율 대비) */
const HP_SLOPE = 0.085;

export const WAVES: WaveDef[] = PLAN.map((p, i) => ({
  groups: p.g.map(([monster, count]) => ({ monster, count })),
  boss: p.boss,
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
