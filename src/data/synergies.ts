/** 피해 분류: 시너지 조건 판정용. synergy·bonus는 시너지가 만든 피해라 시너지 배율을 다시 적용하지 않음 */
export type DamageTag = 'single' | 'area' | 'chain' | 'pierce' | 'summon' | 'synergy' | 'bonus';

/**
 * 시너지 효과. who 생략 시 해당 시너지 멤버에게, all이면 전투 칸 전체 유닛에게 적용.
 * damage.bucket: atk(공격력 계열, 상한 20%) / skill(스킬·광역 계열, 상한 20%)
 */
export type SynergyEffect =
  | { kind: 'attackSpeed'; amount: number; all?: boolean }
  | {
      kind: 'damage'; bucket: 'atk' | 'skill'; amount: number; all?: boolean; who?: string[];
      tags?: DamageTag[]; skillOnly?: boolean; vsSlowed?: boolean; vsHpBelow?: number; vsBoss?: boolean;
    }
  | { kind: 'cooldown'; amount: number }
  | { kind: 'radius'; amount: number; who: string[] }
  | { kind: 'skillEffect'; amount: number; who: string[] }
  | { kind: 'procSlow'; who: string[]; chance: number; slow: number; duration: number }
  | { kind: 'procExtra'; who: string[]; chance: number; mult: number; tags: DamageTag[] }
  | { kind: 'periodic'; mode: 'blast' | 'focus'; interval: number; mult: number; radius?: number };

export type SynergyTier = 2 | 3 | 5 | 10;

export interface SynergyDef {
  id: string;
  name: string;
  tier: SynergyTier;
  /** 멤버 ID (표시 이름 미사용) */
  members: string[];
  desc: string;
  effects: SynergyEffect[];
}

/** 시너지 보너스 합산 상한 (기존 전투 상한과 별개) */
/** 5-A.5: 시너지 다수 동시 활성 시 과도한 누적 방지를 위해 하향 (기존 atk 0.2·skill 0.2·공속 0.15, 합계 상한 없음). 개별 시너지 수치(최대 8%)는 그대로 */
export const SYNERGY_CAPS = { atk: 0.1, attackSpeed: 0.08, skill: 0.1, cooldown: 0.1, /** 공격력계+스킬·광역계 합계 상한 */ damageTotal: 0.15 };

/**
 * 등급 조건: 전원 minStar 이상 + 그중 서로 다른 멤버 highCount명이 3성 이상 (멤버별 전투 칸 최고 등급 1개로 판정 → 중복 계산 없음)
 * 6K: 3인·5인 전원 3성 이상, 10인 전원 2성 이상 + 5명 3성 이상 (6J: 3인 2성+1명 3성, 5인 2성+2명 3성, 10인 전원 1성)
 */
export const TIER_RULES: Record<SynergyTier, { minStar: number; highCount: number }> = {
  2: { minStar: 2, highCount: 0 }, // 6J부터 비활성 (DISABLED_TIERS)
  3: { minStar: 3, highCount: 0 },
  5: { minStar: 3, highCount: 0 },
  10: { minStar: 2, highCount: 5 },
};

/** 발동 조건 설명 (패널·게임 설명 공통, TIER_RULES에서 생성) */
export function tierRuleText(t: SynergyTier, short = false) {
  const r = TIER_RULES[t];
  const all = t === 10 ? (short ? '10명' : '멤버 10명 모두') : '전원';
  if (short) return `${all} ${r.minStar}성↑${r.highCount ? ` · ${r.highCount}명 3성↑` : ''}`;
  return `${all} ${r.minStar}성 이상${r.highCount ? ` + 그중 서로 다른 멤버 ${r.highCount}명 3성 이상` : ''}`;
}

const ALL_MEMBERS = ['yappu', 'harunotsuki', 'manjo', 'moya', 'yuntami', 'yamuji', 'nanwony', 'kkutinho', 'kimokdok', 'damyu'];

/**
 * 6J: 비활성 발동 단계. 2인 시너지는 무작위 배치만으로 대부분 켜져 전략 차이를 줄여서 비활성화.
 * 정의(SYNERGY_DEFS)는 그대로 두므로 이 목록에서 2를 빼면 원래대로 복원됨.
 */
export const DISABLED_TIERS: SynergyTier[] = [2];
export const isTierEnabled = (t: SynergyTier) => !DISABLED_TIERS.includes(t);

/** 전체 시너지 정의 (비활성 단계 포함, 기존 기록의 이름 표시용으로도 사용) */
export const SYNERGY_DEFS: SynergyDef[] = [
  // ── 2인 ──
  { id: 'frostRapid', name: '빙결 연사', tier: 2, members: ['yappu', 'harunotsuki'], desc: '야뿌 기본 공격에 10% 확률로 1.5초 15% 감속',
    effects: [{ kind: 'procSlow', who: ['yappu'], chance: 0.1, slow: 0.15, duration: 1.5 }] },
  { id: 'blastParty', name: '폭발 파티', tier: 2, members: ['manjo', 'moya'], desc: '만조 광역 공격 범위 +8%',
    effects: [{ kind: 'radius', amount: 0.08, who: ['manjo'] }] },
  { id: 'perfectFinish', name: '완벽한 마무리', tier: 2, members: ['yuntami', 'kimokdok'], desc: '두 멤버의 체력 30% 이하 적 대상 피해 +8%',
    effects: [{ kind: 'damage', bucket: 'atk', amount: 0.08, vsHpBelow: 0.3 }] },
  { id: 'chaosCombo', name: '대환장 콤보', tier: 2, members: ['nanwony', 'yamuji'], desc: '야무지 관통 적중 시 8% 확률로 50% 추가 피해',
    effects: [{ kind: 'procExtra', who: ['yamuji'], chance: 0.08, mult: 0.5, tags: ['pierce'] }] },
  { id: 'cheerSquad', name: '응원단', tier: 2, members: ['kkutinho', 'damyu'], desc: '두 멤버 공격속도 +5%',
    effects: [{ kind: 'attackSpeed', amount: 0.05 }] },
  { id: 'focusFire', name: '집중 사격', tier: 2, members: ['yappu', 'yuntami'], desc: '두 멤버 단일 대상 피해 +6%',
    effects: [{ kind: 'damage', bucket: 'atk', amount: 0.06, tags: ['single'] }] },
  { id: 'frostBlast', name: '냉기 폭발', tier: 2, members: ['harunotsuki', 'manjo'], desc: '감속된 적에게 만조 광역 피해 +8%',
    effects: [{ kind: 'damage', bucket: 'skill', amount: 0.08, who: ['manjo'], tags: ['area'], vsSlowed: true }] },
  { id: 'chainRiot', name: '연쇄 소동', tier: 2, members: ['moya', 'damyu'], desc: '두 멤버의 소환체·연쇄 공격 피해 +6%',
    effects: [{ kind: 'damage', bucket: 'skill', amount: 0.06, tags: ['summon', 'chain'] }] },
  { id: 'chaosCheer', name: '혼돈의 응원', tier: 2, members: ['nanwony', 'kkutinho'], desc: '난워니 스킬 피해·감속 효과 +8%',
    effects: [{ kind: 'damage', bucket: 'skill', amount: 0.08, who: ['nanwony'], skillOnly: true }, { kind: 'skillEffect', amount: 0.08, who: ['nanwony'] }] },
  { id: 'pierceExecute', name: '관통 처형', tier: 2, members: ['yamuji', 'kimokdok'], desc: '체력 25% 이하 적에 대한 야무지 관통 피해 +8%',
    effects: [{ kind: 'damage', bucket: 'atk', amount: 0.08, who: ['yamuji'], tags: ['pierce'], vsHpBelow: 0.25 }] },
  // ── 3인 ──
  { id: 'chaosTrio', name: '대환장 삼총사', tier: 3, members: ['nanwony', 'yamuji', 'kimokdok'], desc: '20초마다 적 밀집 구역에 평균 공격력 150% 광역 공격',
    effects: [{ kind: 'periodic', mode: 'blast', interval: 20, mult: 1.5, radius: 100 }] },
  { id: 'blizzard', name: '눈보라 작전', tier: 3, members: ['yappu', 'harunotsuki', 'manjo'], desc: '감속된 적에게 세 멤버의 스킬 피해 +8%',
    effects: [{ kind: 'damage', bucket: 'skill', amount: 0.08, skillOnly: true, vsSlowed: true }] },
  { id: 'cheerTeam', name: '꾸한성 응원대', tier: 3, members: ['moya', 'kkutinho', 'damyu'], desc: '전투 유닛 전체 공격속도 +4%, 스킬 피해 +4%',
    effects: [{ kind: 'attackSpeed', amount: 0.04, all: true }, { kind: 'damage', bucket: 'skill', amount: 0.04, all: true, skillOnly: true }] },
  // ── 5인 ──
  { id: 'sanghyeon', name: '상현의 각성', tier: 5, members: ['nanwony', 'yappu', 'yuntami', 'harunotsuki', 'kkutinho'],
    desc: '보스 대상 피해 +8%, 공격속도 +5%, 20초마다 체력 높은 적에게 평균 공격력 200% 집중 공격',
    effects: [{ kind: 'damage', bucket: 'atk', amount: 0.08, vsBoss: true }, { kind: 'attackSpeed', amount: 0.05 }, { kind: 'periodic', mode: 'focus', interval: 20, mult: 2 }] },
  { id: 'hahyeon', name: '하현의 폭주', tier: 5, members: ['yamuji', 'manjo', 'kimokdok', 'damyu', 'kkutinho'],
    desc: '광역·연쇄 피해 +8%, 스킬 쿨타임 -5%, 20초마다 적 밀집 구역에 평균 공격력 150% 광역 공격',
    effects: [{ kind: 'damage', bucket: 'skill', amount: 0.08, tags: ['area', 'chain'] }, { kind: 'cooldown', amount: 0.05 }, { kind: 'periodic', mode: 'blast', interval: 20, mult: 1.5, radius: 110 }] },
  // ── 10인 ──
  { id: 'fullSquad', name: '꾸한성 완전체', tier: 10, members: ALL_MEMBERS, desc: '전투 유닛 전체 공격력 +5%, 스킬 피해 +5%',
    effects: [{ kind: 'damage', bucket: 'atk', amount: 0.05, all: true }, { kind: 'damage', bucket: 'skill', amount: 0.05, all: true, skillOnly: true }] },
];

/** 실제 판정·효과·UI에 쓰는 활성 시너지 (비활성 단계 제외) */
export const SYNERGIES: SynergyDef[] = SYNERGY_DEFS.filter((d) => isTierEnabled(d.tier));
