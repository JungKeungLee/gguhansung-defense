import { useState } from 'react';
import type { HudState } from '../game/bridge';
import { DIFFICULTIES, type DifficultyId } from '../data/difficulty';
import { memberById } from '../data/members';
import { SYNERGY_DEFS } from '../data/synergies';
import { clearRecords, computeStats, formatTime, isCurrentVersion, loadRecords, type PlayRecord } from '../records/records';
import { BALANCE_VERSION } from '../data/version';
import CharAvatar from './CharAvatar';
import victoryBg from '../assets/backgrounds/victory.webp';
import defeatBg from '../assets/backgrounds/defeat.webp';

// 이전 버전 기록에는 현재 비활성인 2인 시너지 ID가 있을 수 있어 전체 정의에서 찾음
const synName = (id: string) => SYNERGY_DEFS.find((s) => s.id === id)?.name ?? id;
const TIER_ORDER = (id: string) => -(SYNERGY_DEFS.find((s) => s.id === id)?.tier ?? 0);
const reasonText = (r: PlayRecord) =>
  r.result === 'victory' ? `${r.wave}웨이브 전체 처치` : r.defeatReason === 'timeout' ? '최종 보스 제한시간 초과' : '살아 있는 몬스터 80마리 도달';

/** 게임 종료 결과 (Scene이 종료 확정 시 1회 만든 기록을 표시만 함 — 재렌더링해도 저장 없음) */
export function ResultPanel({ hud, onRestart, onMain, onRecords }: { hud: HudState; onRestart: () => void; onMain: () => void; onRecords: () => void }) {
  const r = hud.result;
  const win = hud.phase === 'victory';
  // 남아 있는 유닛 중 달성 최고 등급과 같은 유닛 (판매·합성으로 없으면 등급만 표시)
  const best = r ? r.units.filter((u) => u.star === r.bestStar).sort((a, b) => b.star - a.star)[0] ?? null : null;
  return (
    // 6K: 승리·패배 전용 배경 (위쪽 문장 영역은 비워 두고 결과 정보는 아래 반투명 패널에 표시)
    <div className={`overlay result ${win ? 'win' : 'lose-bg'}`} style={{ backgroundImage: `url(${win ? victoryBg : defeatBg})` }}>
      <h2 className={hud.phase}>{win ? '승리!' : '패배'}</h2>
      {r ? (
        <div className="result-grid">
          <span>난이도</span><b>{DIFFICULTIES[r.difficulty].name}</b>
          <span>도달 웨이브</span><b>{r.wave} / {hud.totalWaves}</b>
          <span>플레이 시간</span><b>{formatTime(r.playTimeSec)} <small className="muted">(게임 {formatTime(r.gameTimeSec)})</small></b>
          <span>몬스터 처치</span><b>{r.kills.toLocaleString()}</b>
          <span>최종 보스</span><b>{r.finalBossKilled ? '처치' : '미처치'}</b>
          <span>최고 등급 유닛</span>
          <b className="best">{best ? <><CharAvatar memberId={best.memberId} star={best.star} color="#8a6a2a" size={22} /> {memberById(best.memberId).name} {'★'.repeat(best.star)}</> : r.bestStar ? `${r.bestStar}성 달성 (이후 판매·합성)` : '-'}</b>
          <span>주요 시너지</span><b>{r.synergies.length ? [...r.synergies].sort((a, b) => TIER_ORDER(a) - TIER_ORDER(b)).slice(0, 4).map(synName).join(', ') + (r.synergies.length > 4 ? ` 외 ${r.synergies.length - 4}` : '') : '없음'}</b>
          <span>{win ? '결과' : '패배 원인'}</span><b className={win ? '' : 'lose'}>{reasonText(r)}</b>
        </div>
      ) : <p>결과 정리 중…</p>}
      {hud.recordFailed && <p className="lose small">기록 저장에 실패했습니다 (브라우저 저장소 차단).</p>}
      <div className="row">
        <button onClick={onRestart}>다시 시작</button>
        <button onClick={onMain}>메인으로</button>
        <button onClick={onRecords}>기록 보기</button>
      </div>
    </div>
  );
}

/** 로컬 기록·통계 (localStorage, 최근 20건 기준) */
export function RecordsModal({ onClose }: { onClose: () => void }) {
  const [records, setRecords] = useState(loadRecords);
  const [includeOld, setIncludeOld] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const stats = computeStats(records, includeOld);
  const oldCount = records.filter((r) => !isCurrentVersion(r)).length;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal records" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>플레이 기록 <span className="muted">최근 {records.length} / 20건 · 이 브라우저에만 저장</span></h3>
          <label className="ver-toggle" title={`통계 기본값: 현재 밸런스(${BALANCE_VERSION}) 기록만`}>
            <input type="checkbox" checked={includeOld} onChange={(e) => setIncludeOld(e.target.checked)} /> 이전 버전 포함 <span className="muted">({oldCount}건)</span>
          </label>
          <button className="close" onClick={onClose}>닫기</button>
        </div>
        <table className="stats">
          <thead><tr><th>난이도</th><th>플레이</th><th>클리어</th><th>최고 웨이브</th><th>최단 클리어</th><th>최고 등급</th><th>누적 처치</th></tr></thead>
          <tbody>
            {(Object.keys(stats) as DifficultyId[]).map((d) => {
              const s = stats[d];
              return (
                <tr key={d}>
                  <td>{DIFFICULTIES[d].name}</td><td>{s.plays}</td><td>{s.clears}</td><td>{s.bestWave || '-'}</td>
                  <td>{s.fastestClear === null ? '-' : formatTime(s.fastestClear)}</td><td>{s.bestStar ? `${s.bestStar}성` : '-'}</td><td>{s.kills.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="rec-list">
          {records.length === 0 && <p className="muted">아직 기록이 없습니다.</p>}
          {records.map((r) => (
            <div key={r.id} className={`rec ${r.result}`}>
              <b>{r.result === 'victory' ? '승리' : '패배'}</b>
              <span className={`ver ${isCurrentVersion(r) ? '' : 'old'}`}>{isCurrentVersion(r) ? r.balanceVersion : r.balanceVersion ?? '구버전'}</span>
              <span>{DIFFICULTIES[r.difficulty]?.name ?? r.difficulty}</span>
              <span>W{r.wave}</span>
              <span>{formatTime(r.playTimeSec)}</span>
              <span>처치 {r.kills}</span>
              <span>최고 {r.bestStar}성</span>
              <span>시너지 {r.synergies.length}</span>
              <span>강화 {Object.values(r.upgrades).join('·')}</span>
              <span className="muted">{new Date(r.playedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              {r.result === 'defeat' && <span className="lose">{r.defeatReason === 'timeout' ? '시간 초과' : '80마리'}</span>}
            </div>
          ))}
        </div>
        <div className="modal-foot">
          {error && <span className="lose">{error}</span>}
          {confirm ? (
            <>
              <span>모든 기록을 삭제할까요? 되돌릴 수 없습니다.</span>
              <button className="danger" onClick={() => { if (clearRecords()) setRecords([]); else setError('기록 초기화 실패: 브라우저 저장소를 사용할 수 없습니다'); setConfirm(false); }}>삭제</button>
              <button onClick={() => setConfirm(false)}>취소</button>
            </>
          ) : (
            <button className="danger" disabled={!records.length} onClick={() => setConfirm(true)}>기록 초기화</button>
          )}
        </div>
      </div>
    </div>
  );
}
