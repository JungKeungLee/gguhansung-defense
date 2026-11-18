export const START_GOLD = 90;
export const SUMMON_COST = 30;
export const FOCUS_COST = 40;
export const FOCUS_UNLOCK_WAVE = 6;
/** 집중 소환 시 선택 멤버 확률. 나머지는 다른 멤버에게 균등 분배 */
export const FOCUS_RATE = 0.8; // 6-G 승인: 65% → 80% (집중 소환으로 25웨이브 전후 5성 도전)

/** 웨이브 출현 완료 보상: wave ≤ upTo 인 첫 구간 */
/** 6K: 소환·합성과 전역 강화 투자 여유를 위해 구간별 +20G (기본: 55/70/85/100/115/130, 30웨이브 합계 +600G) */
export const WAVE_REWARDS = [
  { upTo: 5, gold: 75 },
  { upTo: 10, gold: 90 },
  { upTo: 15, gold: 105 },
  { upTo: 20, gold: 120 },
  { upTo: 25, gold: 135 },
  { upTo: 30, gold: 150 },
];

export function waveReward(wave: number) {
  return (WAVE_REWARDS.find((r) => wave <= r.upTo) ?? WAVE_REWARDS[WAVE_REWARDS.length - 1]).gold;
}
