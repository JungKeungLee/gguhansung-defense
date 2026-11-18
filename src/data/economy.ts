import type { DifficultyId } from './difficulty';

export const START_GOLD = 90;
export const SUMMON_COST = 30;
export const FOCUS_COST = 40;
export const FOCUS_UNLOCK_WAVE = 6;
/** 집중 소환 시 선택 멤버 확률. 나머지는 다른 멤버에게 균등 분배 */
export const FOCUS_RATE = 0.8; // 6-G 승인: 65% → 80% (집중 소환으로 25웨이브 전후 5성 도전)

/** 웨이브 출현 완료 기본 보상: wave ≤ upTo 인 첫 구간 */
export const WAVE_REWARDS = [
  { upTo: 5, gold: 55 },
  { upTo: 10, gold: 70 },
  { upTo: 15, gold: 85 },
  { upTo: 20, gold: 100 },
  { upTo: 25, gold: 115 },
  { upTo: 50, gold: 130 }, // 26~50웨이브 (50웨이브 확장 후에도 더 올리지 않음)
];

/**
 * 6N: 난이도별 웨이브 추가 보상 (기본 보상에 1회 가산). 소환·합성과 전역 강화에 나눠 투자할 여유
 * 보통 +35G, 어려움 +45G (6L: 보통 +25G, 어려움 +30G)
 */
export const WAVE_BONUS: Record<DifficultyId, number> = { normal: 35, hard: 45 };

/** 웨이브 출현 완료 보상 = 기본 + 난이도 추가분. difficulty 생략 시 보통 기준 (기존 호출부 호환) */
export function waveReward(wave: number, difficulty: DifficultyId = 'normal') {
  const base = (WAVE_REWARDS.find((r) => wave <= r.upTo) ?? WAVE_REWARDS[WAVE_REWARDS.length - 1]).gold;
  return base + WAVE_BONUS[difficulty];
}
