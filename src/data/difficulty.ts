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
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  normal: { id: 'normal', name: '보통', desc: '기본 규칙', hpMult: 1, bossHpMult: 1, speedMult: 1, countMult: 1 },
  // 6-G 승인: 체력 +50%(보스 포함)·등장 수 +10%·이동속도 +10% (5-B: 1.4배·등장 수 1.0)
  hard: { id: 'hard', name: '어려움', desc: '몬스터·보스 체력 +50%, 등장 수 +10%, 이동속도 +10% (특수 능력·골드 보상 동일)', hpMult: 1.5, bossHpMult: 1.5, speedMult: 1.1, countMult: 1.1 },
};
