export const START_GOLD = 90;
export const SUMMON_COST = 30;
export const FOCUS_COST = 40;
export const FOCUS_UNLOCK_WAVE = 6;
/** 집중 소환 시 선택 멤버 확률. 나머지는 다른 멤버에게 균등 분배 */
export const FOCUS_RATE = 0.8; // 6-G 승인: 65% → 80% (집중 소환으로 25웨이브 전후 5성 도전)

/** 웨이브 출현 완료 보상: wave ≤ upTo 인 첫 구간 */
export const WAVE_REWARDS = [
  { upTo: 5, gold: 55 },
  { upTo: 10, gold: 70 },
  { upTo: 15, gold: 85 },
  { upTo: 20, gold: 100 },
  { upTo: 25, gold: 115 },
  { upTo: 30, gold: 130 },
];

export function waveReward(wave: number) {
  return (WAVE_REWARDS.find((r) => wave <= r.upTo) ?? WAVE_REWARDS[WAVE_REWARDS.length - 1]).gold;
}
