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
  // 6-I: 무작위 플레이 쉬운 클리어 완화 — 1~10웨이브는 그대로, 11웨이브부터 일반 몬스터 체력 웨이브당 +2%(30웨이브 ×1.4), 보스 체력 ×1.35
  //      (어려움보다 낮게 유지: 어려움은 전 구간 ×1.5·등장 수·이동속도 +10%)
  normal: {
    id: 'normal', name: '보통', desc: '1~10웨이브 기본 체력, 11웨이브부터 일반 몬스터 체력이 웨이브마다 2%씩 증가(30웨이브 +40%), 보스 체력 +35%',
    hpMult: 1, bossHpMult: 1.35, speedMult: 1, countMult: 1, lateHp: { fromWave: 10, perWave: 0.02 },
  },
  // 6-G 승인: 체력 +50%(보스 포함)·등장 수 +10%·이동속도 +10% (5-B: 1.4배·등장 수 1.0)
  hard: { id: 'hard', name: '어려움', desc: '몬스터·보스 체력 +50%, 등장 수 +10%, 이동속도 +10% (특수 능력·골드 보상 동일)', hpMult: 1.5, bossHpMult: 1.5, speedMult: 1.1, countMult: 1.1 },
};
