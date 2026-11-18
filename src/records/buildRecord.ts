import type { Battle } from '../game/combat';
import { BALANCE_VERSION } from '../data/version';
import { newRecordId, type PlayRecord } from './records';

/** 종료된 전투 → 기록 1건 (Scene에서 종료 확정 시 1회 호출). 브라우저 저장과 분리된 순수 변환 */
export function buildRecord(b: Battle, playTimeSec: number): PlayRecord {
  return {
    id: newRecordId(),
    playedAt: new Date().toISOString(),
    balanceVersion: BALANCE_VERSION,
    difficulty: b.difficulty,
    result: b.phase === 'victory' ? 'victory' : 'defeat',
    wave: b.waveNumber,
    kills: b.kills,
    playTimeSec,
    gameTimeSec: Math.round(b.time),
    finalBossKilled: b.finalBossKilled,
    units: b.units.map((u) => ({ memberId: u.memberId, star: u.star, area: u.area })),
    // 플레이 중 실제 달성한 최고 등급 (이후 판매·합성·이동과 무관)
    bestStar: Math.max(b.maxStarReached, ...b.units.map((u) => u.star), 0),
    synergies: [...b.syn.active],
    upgrades: { ...b.upgrades },
    defeatReason: b.defeatReason,
  };
}
