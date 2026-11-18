import type { DifficultyId } from '../data/difficulty';
import type { DefeatReason } from '../game/combat';
import type { UpgradeId } from '../data/upgrades';
import { BALANCE_VERSION } from '../data/version';

/**
 * 브라우저 로컬 기록 (localStorage). 게임 로직·밸런스 시뮬레이터는 이 모듈을 사용하지 않음.
 * 저장소가 차단·손상되어도 예외를 삼키고 false/빈 값을 반환해 게임은 계속 진행.
 */
export interface PlayRecord {
  id: string;
  /** 밸런스 버전 (6-G부터 저장). 없으면 이전 버전 기록 */
  balanceVersion?: string;
  /** ISO 시각 */
  playedAt: string;
  difficulty: DifficultyId;
  result: 'victory' | 'defeat';
  wave: number;
  kills: number;
  /** 실제 플레이 시간(초, 일시정지·난이도 선택 대기 제외) */
  playTimeSec: number;
  /** 게임 시간(초, 배속 반영) */
  gameTimeSec: number;
  finalBossKilled: boolean;
  /** 최종 보유 유닛 (전투+보관함) */
  units: { memberId: string; star: number; area: 'field' | 'storage' }[];
  bestStar: number;
  /** 활성 시너지 ID */
  synergies: string[];
  upgrades: Record<UpgradeId, number>;
  defeatReason: DefeatReason | null;
}

export const RECORD_KEY = 'gguhansung-defense:records:v1';
export const MAX_RECORDS = 20;

/** 저장소 접근 대상 (테스트에서 교체 가능) */
let store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = null;
export function setRecordStore(s: typeof store) {
  store = s;
}
function storage() {
  if (store) return store;
  try {
    return window.localStorage; // 접근 자체가 예외일 수 있음
  } catch {
    return null;
  }
}

export function newRecordId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadRecords(): PlayRecord[] {
  try {
    const raw = storage()?.getItem(RECORD_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((r) => r && typeof r.id === 'string' && typeof r.wave === 'number') : [];
  } catch {
    return [];
  }
}

/** 최신 기록을 앞에 추가, 최근 20건 유지. 같은 ID는 중복 저장하지 않음. 실패 시 false */
export function saveRecord(r: PlayRecord): boolean {
  try {
    const s = storage();
    if (!s) return false;
    const list = loadRecords().filter((x) => x.id !== r.id);
    s.setItem(RECORD_KEY, JSON.stringify([r, ...list].slice(0, MAX_RECORDS)));
    return true;
  } catch {
    return false;
  }
}

export function clearRecords(): boolean {
  try {
    const s = storage();
    if (!s) return false;
    s.removeItem(RECORD_KEY);
    return true;
  } catch {
    return false;
  }
}

export interface DifficultyStats {
  plays: number;
  clears: number;
  bestWave: number;
  /** 최단 클리어 실제 시간(초), 클리어 없으면 null */
  fastestClear: number | null;
  bestStar: number;
  kills: number;
}

/** 현재 밸런스 버전 기록인지 (버전 없는 기존 기록은 이전 버전) */
export const isCurrentVersion = (r: PlayRecord) => r.balanceVersion === BALANCE_VERSION;

/** 저장된 기록(최근 20건) 기준 난이도별 통계. 기본은 현재 버전 기록만, includeOld면 전체 */
export function computeStats(records: PlayRecord[], includeOld = false): Record<DifficultyId, DifficultyStats> {
  const empty = (): DifficultyStats => ({ plays: 0, clears: 0, bestWave: 0, fastestClear: null, bestStar: 0, kills: 0 });
  const out: Record<DifficultyId, DifficultyStats> = { normal: empty(), hard: empty() };
  for (const r of records) {
    if (!includeOld && !isCurrentVersion(r)) continue;
    const s = out[r.difficulty];
    if (!s) continue;
    s.plays++;
    s.kills += r.kills;
    s.bestWave = Math.max(s.bestWave, r.wave);
    s.bestStar = Math.max(s.bestStar, r.bestStar);
    if (r.result === 'victory') {
      s.clears++;
      s.fastestClear = s.fastestClear === null ? r.playTimeSec : Math.min(s.fastestClear, r.playTimeSec);
    }
  }
  return out;
}

export const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
