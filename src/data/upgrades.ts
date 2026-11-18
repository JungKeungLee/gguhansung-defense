/** 전역 강화 (게임 내 골드로 구매, 전투 칸 유닛 전체 적용, 재시작 시 초기화) */
export type UpgradeId = 'attack' | 'attackSpeed' | 'range' | 'skill';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** 단계당 증가율 */
  perLevel: number;
  /** 단계별 구매 비용 (index = 현재 단계). 길이 = 최대 단계 */
  costs: number[];
  desc: string;
}

export const UPGRADE_MAX = 5;
/** 단계마다 약 1.5배, 5G 단위 반올림 */
const costs = (base: number) => Array.from({ length: UPGRADE_MAX }, (_, i) => Math.round((base * 1.5 ** i) / 5) * 5);

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  attack: { id: 'attack', name: '공격력', perLevel: 0.08, costs: costs(60), desc: '기본 공격·스킬의 기준 공격력' },
  attackSpeed: { id: 'attackSpeed', name: '공격속도', perLevel: 0.05, costs: costs(75), desc: '기본 공격 속도' },
  range: { id: 'range', name: '사거리', perLevel: 0.04, costs: costs(75), desc: '공격·스킬 사거리 (보조 공격체 포함)' },
  skill: { id: 'skill', name: '스킬 효율', perLevel: 0.06, costs: costs(90), desc: '스킬 피해 (보조 공격체 포함)' },
};
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
export const upgradeBonus = (id: UpgradeId, level: number) => UPGRADES[id].perLevel * level;
