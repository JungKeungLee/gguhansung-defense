/** 난이도별 몬스터 보정. 소환 확률·합성·판매·시너지·골드는 난이도와 무관 */
export type DifficultyId = 'normal' | 'hard';

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  desc: string;
  /** 일반·특수 몬스터 체력 배율 */
  hpMult: number;
  /** 보스 체력 배율 */
  bossHpMult: number;
  /** 몬스터 이동속도 배율 */
  speedMult: number;
  /** 웨이브 예정 출현 수 배율 (보스 제외, 반올림) */
  countMult: number;
  /** 중반 이후 일반 몬스터 체력 추가 배율: fromWave 다음 웨이브부터 웨이브당 perWave씩 증가 (보스 제외, 없으면 1) */
  lateHp?: { fromWave: number; perWave: number };
}

/** 해당 웨이브의 일반 몬스터 체력 배율 (hpMult × 중반 이후 증가분) */
export function regularHpMult(d: DifficultyDef, wave: number) {
  const late = d.lateHp ? 1 + d.lateHp.perWave * Math.max(0, wave - d.lateHp.fromWave) : 1;
  return d.hpMult * late;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  // 6J: 기본 체력 대비 최종 배율로 일원화 (6I의 웨이브별 증가 lateHp는 제거 — 중복 적용 없음)
  normal: { id: 'normal', name: '보통', desc: '몬스터·보스 체력 +70% (이동속도·등장 수·골드 보상은 기본)', hpMult: 1.7, bossHpMult: 1.7, speedMult: 1, countMult: 1 },
  // 6J 최종: 체력 ×2.3(보스 포함). 이동속도·등장 수 +10%는 6G 값 유지
  hard: { id: 'hard', name: '어려움', desc: '몬스터·보스 체력 +130%, 등장 수 +10%, 이동속도 +10% (특수 능력·골드 보상 동일)', hpMult: 2.3, bossHpMult: 2.3, speedMult: 1.1, countMult: 1.1 },
};
