import type { Area, DefeatReason, Phase } from './combat';
import type { SynergyView } from './synergy';
import type { UpgradeId } from '../data/upgrades';
import type { DifficultyId } from '../data/difficulty';
import type { PlayRecord } from '../records/records';

export interface UpgradeView {
  id: UpgradeId;
  name: string;
  level: number;
  max: number;
  /** 현재 효과 (예: 0.16) */
  bonus: number;
  perLevel: number;
  /** 다음 단계 비용, 최대 단계면 null */
  nextCost: number | null;
}
export type { SynergyView };

export interface BossView {
  id: number;
  name: string;
  color: string;
  hpPct: number;
  phase: number;
  maxPhase: number;
  /** 곧 사용할 스킬 이름 */
  warning: string | null;
  armor: boolean;
  shield: boolean;
  enraged: boolean;
}

export interface UnitView {
  id: number;
  memberId: string;
  name: string;
  color: string;
  star: number;
  area: Area;
  index: number;
  locked: boolean;
  mergeable: boolean;
}

export interface SelectedUnitInfo extends UnitView {
  damage: number;
  attackSpeed: number;
  range: number;
  rangeReaches: boolean;
  sellPrice: number;
  kills: number;
  role: string;
  attackDesc: string;
  skillName: string;
  skillDesc: string;
  skillCooldown: number;
  /** 남은 쿨타임(초), 0이면 준비 완료 */
  skillCd: number;
  /** 현재 등급 강화 효과 */
  starBonus: string;
  /** 적용 중인 지속 효과 */
  effects: string[];
}

export interface HudMessage {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'error';
}

export interface HudState {
  wave: number;
  totalWaves: number;
  alive: number;
  maxAlive: number;
  phase: Phase;
  /** 다음 웨이브까지 남은 초 (prep일 때만 의미) */
  phaseTimer: number;
  /** 최종 보스 남은 제한시간(초), 등장 전 null */
  finalTimer: number | null;
  defeatReason: DefeatReason | null;
  bosses: BossView[];
  synergies: SynergyView[];
  /** 난이도 선택 후 게임 시작 여부 */
  started: boolean;
  difficulty: DifficultyId;
  upgrades: UpgradeView[];
  /** 게임 시간(초, 배속 반영) */
  gameTime: number;
  /** 실제 플레이 시간(초) */
  playTime: number;
  /** 종료 확정 시 저장된 결과 (재렌더링과 무관하게 Scene에서 1회 생성·저장) */
  result: PlayRecord | null;
  recordFailed: boolean;
  speed: 1 | 2;
  paused: boolean;
  kills: number;
  gold: number;
  focusUnlocked: boolean;
  autoMerge: boolean;
  moveMode: boolean;
  /** 드래그 중인 유닛 */
  dragging: UnitView | null;
  anyMergeable: boolean;
  /** 길이 20, 빈 칸은 null */
  storage: (UnitView | null)[];
  selected: SelectedUnitInfo | null;
  message: HudMessage | null;
}

export interface GameControls {
  setSpeed(speed: 1 | 2): void;
  togglePause(): void;
  restart(): void;
  clickSlot(area: Area, index: number): void;
  summon(focusId?: string): void;
  mergeSelected(): void;
  mergeAll(): void;
  toggleAutoMerge(): void;
  toggleLock(): void;
  toggleMoveMode(): void;
  sell(id: number): void;
  /** 드래그 시작 (Phaser 전투 칸·React 보관함 공통) */
  beginDrag(unitId: number): void;
  /** 난이도 선택 후 시작 (진행 중 변경 불가: 재시작 시에만 다시 선택) */
  start(difficulty: DifficultyId): void;
  buyUpgrade(id: UpgradeId): void;
  /** 드롭: target null이면 취소(원위치) */
  endDrag(target: { area: Area; index: number } | null): void;
}

type Listener = () => void;
let state: HudState | null = null;
let stateKey = '';
const listeners = new Set<Listener>();

/** Phaser Scene → React UI 상태 전달 */
export const hudStore = {
  get: () => state,
  subscribe(l: Listener) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  set(next: HudState) {
    const key = JSON.stringify(next);
    if (key === stateKey) return;
    stateKey = key;
    state = next;
    listeners.forEach((l) => l());
  },
};

/** React UI → Phaser Scene 명령 전달 */
export const gameControls: { current: GameControls | null } = { current: null };
