/** 주기 행동(timed)과 지속 효과(passive). phases가 있으면 해당 페이즈에서만 동작 */
export type MonsterAbility =
  | { kind: 'summon'; name: string; interval: number; monster: string; count: number; phases?: number[] }
  | { kind: 'heal'; name: string; interval: number; pct: number; radius: number; phases?: number[] }
  | { kind: 'armorUp'; name: string; interval: number; duration: number; reduction: number; phases?: number[] }
  | { kind: 'shield'; name: string; interval: number; duration: number; pct: number; phases?: number[] }
  | { kind: 'guard'; reduction: number; radius: number; phases?: number[] }
  | { kind: 'hasteAura'; bonus: number; radius: number; phases?: number[] };

export type MonsterShape = 'circle' | 'triangle' | 'square' | 'diamond' | 'hex';

export interface MonsterDef {
  id: string;
  name: string;
  /** 일반 몬스터: 웨이브 hpScale 적용 / 보스: 고정 체력 */
  hp: number;
  /** 초당 이동 픽셀 */
  speed: number;
  radius: number;
  color: number;
  shape: MonsterShape;
  /** 처치 골드 */
  gold: number;
  boss?: boolean;
  /** 30웨이브 최종 보스 (등장 시 제한시간 시작) */
  final?: boolean;
  /** 감속 저항 0~1 (감속량 감소) */
  slowResist?: number;
  /** 감속 지속시간 배율 (1 미만이면 빨리 풀림) */
  slowDurationMult?: number;
  /** 일반 공격 피해 감소 (스킬에는 미적용) */
  attackArmor?: number;
  /** 일반 공격 회피율 (스킬은 회피 불가) */
  evasion?: number;
  /** 처치 시 분열 */
  split?: { monster: string; count: number };
  /** 체력 비율 이하에서 이동속도 증가 */
  enrage?: { threshold: number; bonus: number };
  /** 체력 비율 이하에서 1회만 피해 감소 */
  lastStand?: { threshold: number; duration: number; reduction: number };
  /** 페이즈 전환 체력 비율 (내림차순). [0.7, 0.3] → 1·2·3페이즈 */
  phases?: number[];
  abilities?: MonsterAbility[];
}

/** 피해 감소 최종 합계 상한 */
export const MAX_DAMAGE_REDUCTION = 0.5;
/** 보스별 동시에 살아 있는 소환 몬스터 상한 */
export const BOSS_MINION_CAP = 20;
/** 보스 주기 스킬 사용 전 경고 시간(초) */
export const BOSS_WARN_TIME = 1.5;

// 초기 밸런스 값 — 추후 조정
export const MONSTERS = {
  slime: { id: 'slime', name: '슬라임', hp: 100, speed: 90, radius: 13, color: 0x6b8f3a, shape: 'circle', gold: 1 },
  miniSlime: { id: 'miniSlime', name: '작은 슬라임', hp: 40, speed: 100, radius: 9, color: 0x9ccc65, shape: 'circle', gold: 1 },
  goblin: { id: 'goblin', name: '질주 고블린', hp: 80, speed: 135, radius: 12, color: 0xd4a017, shape: 'triangle', gold: 2, slowDurationMult: 0.5 },
  golem: { id: 'golem', name: '철갑 골렘', hp: 220, speed: 65, radius: 16, color: 0x8a8f99, shape: 'square', gold: 3, attackArmor: 0.2 },
  splitter: {
    id: 'splitter', name: '분열 슬라임', hp: 160, speed: 85, radius: 15, color: 0x3fbf9f, shape: 'circle', gold: 2,
    split: { monster: 'miniSlime', count: 2 },
  },
  shaman: {
    id: 'shaman', name: '치유 주술사', hp: 140, speed: 80, radius: 13, color: 0x5ad16f, shape: 'diamond', gold: 3,
    abilities: [{ kind: 'heal', name: '치유', interval: 8, pct: 0.05, radius: 130 }],
  },
  ghost: { id: 'ghost', name: '그림자 유령', hp: 120, speed: 100, radius: 13, color: 0x9fa8da, shape: 'circle', gold: 2, evasion: 0.15 },
  guard: {
    id: 'guard', name: '방패 수호병', hp: 200, speed: 75, radius: 15, color: 0x4f7cc4, shape: 'hex', gold: 3,
    abilities: [{ kind: 'guard', reduction: 0.12, radius: 130 }],
  },
  berserker: {
    id: 'berserker', name: '광폭 마수', hp: 260, speed: 95, radius: 15, color: 0xb33a3a, shape: 'triangle', gold: 3,
    slowResist: 0.5, enrage: { threshold: 0.5, bonus: 0.25 },
  },

  // ── 보스 (고정 체력, 처치 90G) — 4.5단계: 해당 시점 현실 전력으로 30~60초 내 처치되도록 조정 ──
  slimeKing: {
    id: 'slimeKing', name: '슬라임 킹', hp: 1200, speed: 55, radius: 26, color: 0x7cb342, shape: 'circle', gold: 90, boss: true,
    abilities: [{ kind: 'summon', name: '슬라임 소환', interval: 10, monster: 'miniSlime', count: 3 }],
  },
  golemBoss: {
    id: 'golemBoss', name: '철갑 골렘 보스', hp: 2200, speed: 45, radius: 28, color: 0x9ea7b3, shape: 'square', gold: 90, boss: true,
    abilities: [{ kind: 'armorUp', name: '강철 피부', interval: 10, duration: 3, reduction: 0.35 }],
  },
  frenzyKnight: {
    id: 'frenzyKnight', name: '광폭 기사', hp: 5000, speed: 60, radius: 26, color: 0xc0392b, shape: 'diamond', gold: 90, boss: true,
    enrage: { threshold: 0.6, bonus: 0.3 }, lastStand: { threshold: 0.3, duration: 5, reduction: 0.2 },
  },
  darkMage: {
    id: 'darkMage', name: '어둠의 마법사', hp: 6500, speed: 55, radius: 26, color: 0x6a3d9a, shape: 'diamond', gold: 90, boss: true,
    abilities: [
      { kind: 'heal', name: '어둠의 치유', interval: 6, pct: 0.04, radius: 160 },
      { kind: 'shield', name: '마력 보호막', interval: 15, duration: 5, pct: 0.1 },
    ],
  },
  chaosGuardian: {
    id: 'chaosGuardian', name: '혼돈의 수호자', hp: 8500, speed: 55, radius: 28, color: 0x2c6fbb, shape: 'hex', gold: 90, boss: true,
    abilities: [
      { kind: 'summon', name: '질주 소환', interval: 10, monster: 'goblin', count: 2 },
      { kind: 'guard', reduction: 0.15, radius: 160 },
    ],
  },
  chaosLord: {
    id: 'chaosLord', name: '혼돈의 군주', hp: 80000, speed: 50, radius: 32, color: 0x8b0000, shape: 'hex', gold: 90, boss: true, final: true,
    phases: [0.7, 0.3],
    enrage: { threshold: 0.3, bonus: 0.25 }, // 3페이즈 이동속도 +25%
    abilities: [
      { kind: 'summon', name: '군세 소환', interval: 12, monster: 'slime', count: 2, phases: [1] },
      { kind: 'armorUp', name: '혼돈의 갑주', interval: 12, duration: 3, reduction: 0.3, phases: [2] },
      { kind: 'hasteAura', bonus: 0.15, radius: 170, phases: [2] },
      { kind: 'summon', name: '질주 군세', interval: 10, monster: 'goblin', count: 2, phases: [3] },
    ],
  },
} satisfies Record<string, MonsterDef>;

export type MonsterId = keyof typeof MONSTERS;
export const monsterDef = (id: string): MonsterDef => (MONSTERS as Record<string, MonsterDef>)[id];
