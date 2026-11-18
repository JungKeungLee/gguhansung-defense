/** 기본 공격 방식 */
export type AttackDef =
  | { kind: 'single' }
  | { kind: 'splash'; radius: number }
  | { kind: 'pierce'; maxTargets: number; width: number }
  | { kind: 'chain'; maxTargets: number; falloff: number; jumpRange: number };

/**
 * 스킬 데이터. damageMult는 "현재 공격력(등급 배율 적용 완료)" 대비 배율.
 * scaling: 등급별 강화 적용 대상 (damage=스킬 피해, duration=지속시간, both=둘 다)
 */
interface SkillBase { name: string; desc: string; cooldown: number; scaling: 'damage' | 'duration' | 'both' }
export type SkillDef = SkillBase & (
  | { kind: 'haste'; bonus: number; duration: number }
  | { kind: 'frostNova'; damageMult: number; slow: number; slowDuration: number }
  | { kind: 'blast'; damageMult: number; radius: number }
  | { kind: 'summon'; duration: number; damageMult: number; attackSpeed: number; range: number }
  | { kind: 'snipe'; damageMult: number }
  | { kind: 'pierce'; damageMult: number; maxTargets: number; width: number }
  | { kind: 'chaos'; blastMult: number; blastRadius: number; barrageHits: number; barrageMult: number; slow: number; slowDuration: number; slowMult: number }
  | { kind: 'aura'; bonus: number; duration: number; radius: number }
  | { kind: 'execute'; damageMult: number; threshold: number }
  | { kind: 'chain'; damageMult: number; maxTargets: number; falloff: number; jumpRange: number }
);

export interface MemberDef {
  id: string;
  name: string;
  role: string;
  /** 임시 외형·공격 효과 색상 (이미지 도입 전) */
  color: number;
  /** 1성 기준 능력치. 공격력에만 등급 배율 적용 */
  damage: number;
  attackSpeed: number;
  range: number;
  attack: AttackDef;
  attackDesc: string;
  skill: SkillDef;
}

// 초기 밸런스 값 — 추후 조정
export const MEMBERS: MemberDef[] = [
  {
    id: 'yappu', name: '야뿌', role: '연사형', color: 0xe0566b, damage: 14, attackSpeed: 2.4, range: 240,
    attack: { kind: 'single' }, attackDesc: '빠른 단일 대상 공격',
    skill: { kind: 'haste', name: '폭주 연사', desc: '5초 동안 자신의 공격속도 +30%', cooldown: 18, scaling: 'duration', bonus: 0.3, duration: 5 },
  },
  {
    id: 'harunotsuki', name: '하루노츠키', role: '냉기형', color: 0x7fd6ff, damage: 22, attackSpeed: 1.1, range: 250,
    attack: { kind: 'single' }, attackDesc: '단일 대상 냉기 공격',
    skill: { kind: 'frostNova', name: '서리 파동', desc: '사거리 내 모든 적에게 공격력 120% 피해 + 3초간 25% 감속', cooldown: 15, scaling: 'both', damageMult: 1.2, slow: 0.25, slowDuration: 3 },
  },
  {
    id: 'manjo', name: '만조', role: '광역형', color: 0xff8a3d, damage: 20, attackSpeed: 0.9, range: 230,
    attack: { kind: 'splash', radius: 60 }, attackDesc: '작은 범위(반경 60)에 피해',
    skill: { kind: 'blast', name: '대폭발', desc: '적이 가장 밀집한 구역에 공격력 250% 광역 폭발', cooldown: 18, scaling: 'damage', damageMult: 2.5, radius: 110 },
  },
  {
    id: 'moya', name: '모야', role: '소환형', color: 0x40b5a0, damage: 22, attackSpeed: 1.1, range: 270,
    attack: { kind: 'single' }, attackDesc: '단일 대상 원거리 공격',
    skill: { kind: 'summon', name: '꼬마 모야', desc: '8초 동안 주변 적을 자동 공격하는 보조 공격체 소환', cooldown: 20, scaling: 'duration', duration: 8, damageMult: 0.6, attackSpeed: 1.5, range: 220 },
  },
  {
    id: 'yuntami', name: '윤타미', role: '저격형', color: 0xe8c547, damage: 70, attackSpeed: 0.45, range: 340,
    attack: { kind: 'single' }, attackDesc: '느리지만 강한 단일 공격',
    skill: { kind: 'snipe', name: '헤드샷', desc: '사거리 내 체력이 가장 높은 적에게 공격력 300% 저격', cooldown: 20, scaling: 'damage', damageMult: 3 },
  },
  {
    id: 'yamuji', name: '야무지', role: '관통형', color: 0x9ccc65, damage: 26, attackSpeed: 0.8, range: 300,
    attack: { kind: 'pierce', maxTargets: 3, width: 24 }, attackDesc: '직선상 최대 3마리 관통',
    skill: { kind: 'pierce', name: '일격 관통', desc: '직선상 최대 8마리에게 공격력 200% 관통 공격', cooldown: 16, scaling: 'damage', damageMult: 2, maxTargets: 8, width: 40 },
  },
  {
    id: 'nanwony', name: '난워니', role: '혼돈형', color: 0xd94fa8, damage: 25, attackSpeed: 1.1, range: 260,
    attack: { kind: 'single' }, attackDesc: '단일 대상 원거리 공격',
    skill: {
      kind: 'chaos', name: '혼돈의 주사위', desc: '무작위(각 1/3): 광역 180% / 연속 5회 70% / 범위 감속 20% + 80% 피해',
      cooldown: 16, scaling: 'both', blastMult: 1.8, blastRadius: 100, barrageHits: 5, barrageMult: 0.7, slow: 0.2, slowDuration: 3, slowMult: 0.8,
    },
  },
  {
    id: 'kkutinho', name: '꾸티뉴', role: '지원형', color: 0x2ecc71, damage: 14, attackSpeed: 1.2, range: 230,
    attack: { kind: 'single' }, attackDesc: '약한 단일 대상 공격',
    skill: { kind: 'aura', name: '응원가', desc: '6초 동안 반경 230 내 아군 공격속도 +12% (꾸티뉴끼리 중첩 안 됨)', cooldown: 20, scaling: 'duration', bonus: 0.12, duration: 6, radius: 230 },
  },
  {
    id: 'kimokdok', name: '김옥독', role: '처형형', color: 0x8d6e63, damage: 26, attackSpeed: 1.1, range: 250,
    attack: { kind: 'single' }, attackDesc: '단일 대상 공격',
    skill: { kind: 'execute', name: '처형', desc: '체력 30% 이하인 적에게 공격력 400% 추가 피해 (대상 없으면 대기)', cooldown: 18, scaling: 'damage', damageMult: 4, threshold: 0.3 },
  },
  {
    id: 'damyu', name: '다뮤_', role: '연쇄형', color: 0x7e8cff, damage: 22, attackSpeed: 1.0, range: 260,
    attack: { kind: 'chain', maxTargets: 2, falloff: 0.7, jumpRange: 150 }, attackDesc: '최대 2마리 연쇄 (두 번째 70%)',
    skill: { kind: 'chain', name: '연쇄 번개', desc: '최대 5마리 연쇄, 공격력 150%에서 대상마다 20% 감소', cooldown: 17, scaling: 'damage', damageMult: 1.5, maxTargets: 5, falloff: 0.8, jumpRange: 170 },
  },
];

export const memberById = (id: string) => MEMBERS.find((m) => m.id === id)!;
