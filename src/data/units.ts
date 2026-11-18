import { memberById } from './members';

export const PROJECTILE_SPEED = 700;

export const MAX_STAR = 5;
/** 등급별 공격력 배율 (테스트 밸런스). index = 별 - 1 */
export const STAR_DAMAGE_MULT = [1, 2.3, 5.4, 12.5, 29];
/** 등급별 스킬 피해 추가 보너스. 스킬 피해 = 현재 공격력(등급 배율 1회 적용) × 스킬 배율 × (1 + 보너스) */
export const STAR_SKILL_DAMAGE_BONUS = [0, 0.05, 0.1, 0.15, 0.2];
/** 비공격형 효과(버프·감속·소환) 지속시간 보너스 */
export const STAR_SKILL_DURATION_BONUS = [0, 0.05, 0.1, 0.15, 0.2];
/** 합성 재료 수 (6O): 1성 2개→2성, 2성 2개→3성, 3성 3개→4성, 4성 3개→5성. index = 재료 별 - 1 (1성 기준 2성 2, 3성 4, 4성 12, 5성 36개) */
export const MERGE_COUNT = [2, 2, 3, 3];
/** 등급별 판매 가격 = 1성 20G × 필요한 1성 수 (합성 전후 판매 가치 동일). index = 별 - 1 */
export const SELL_PRICE = [20, 40, 80, 240, 720];
export const mergeCount = (star: number) => MERGE_COUNT[star - 1];

/** 효과 중첩 상한 */
export const EFFECT_CAPS = { maxSlow: 0.3, maxHaste: 0.5 };

/**
 * 전투 맵(6-C) 보정: 새 맵은 칸과 경로가 가까워 사거리 내 체류 비율이 약 1.7배가 되어 기본 공격 사거리를 일괄 0.75배.
 * members.ts의 range는 원래 값을 유지하고 여기서 1회만 적용 (기본 공격·'사거리 내' 스킬·사거리 원·시뮬레이터 공통).
 * 스킬 고유 반경(폭발·응원가·연쇄·스플래시·보조 공격체 사거리)에는 적용하지 않음.
 */
export const MAP_RANGE_SCALE = 0.75;

/** 버프 미적용 기본 능력치 */
export function unitStats(memberId: string, star: number) {
  const m = memberById(memberId);
  return {
    damage: Math.round(m.damage * STAR_DAMAGE_MULT[star - 1]),
    attackSpeed: m.attackSpeed,
    range: m.range * MAP_RANGE_SCALE,
    projectileSpeed: PROJECTILE_SPEED,
  };
}
