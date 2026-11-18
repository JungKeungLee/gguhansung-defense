import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { gameControls, hudStore, type HudState, type SelectedUnitInfo, type UnitView } from '../game/bridge';
import { MEMBERS } from '../data/members';
import { FOCUS_COST, FOCUS_UNLOCK_WAVE, SUMMON_COST } from '../data/economy';
import { GRID } from '../game/layout';
import GameCanvas from './GameCanvas';
import SynergyPanel from './SynergyPanel';
import DragLayer, { pressStorage } from './DragLayer';
import UpgradePanel from './UpgradePanel';
import CharAvatar from './CharAvatar';
import { RecordsModal, ResultPanel } from './Records';
import GuideModal from './GuideModal';
import { formatTime } from '../records/records';
import { DIFFICULTIES, type DifficultyId } from '../data/difficulty';

function statusText(h: HudState) {
  if (h.phase === 'defeat') return '패배';
  if (h.phase === 'victory') return '승리';
  if (h.paused) return '일시정지';
  if (h.phase === 'prep') return `준비 · ${h.phaseTimer}초 후 W${h.wave + 1}`;
  if (h.phase === 'clearing') return `최종 정리 · 남은 ${h.alive}마리`;
  return '웨이브 진행 중';
}

const Stars = ({ n }: { n: number }) => <span className="stars">{'★'.repeat(n)}</span>;
const Kbd = ({ k }: { k: string }) => <kbd>{k}</kbd>;

function location(u: UnitView) {
  return u.area === 'field'
    ? `전투 ${(u.index % GRID.cols) + 1}열 ${Math.floor(u.index / GRID.cols) + 1}행`
    : `보관함 ${u.index + 1}번`;
}

function Toast({ hud }: { hud: HudState | null }) {
  const msg = hud?.message;
  const [visibleId, setVisibleId] = useState<number | null>(null);
  useEffect(() => {
    if (!msg) return;
    setVisibleId(msg.id);
    const t = setTimeout(() => setVisibleId(null), 2500);
    return () => clearTimeout(t);
  }, [msg?.id]);
  if (!msg || visibleId !== msg.id) return null;
  return <div className={`toast ${msg.kind}`}>{msg.text}</div>;
}

type Tab = 'info' | 'skill' | 'effect';

/** 선택 유닛 정보 (정보 / 스킬 / 효과 탭) */
function UnitInfo({ sel }: { sel: SelectedUnitInfo }) {
  const [tab, setTab] = useState<Tab>('info');
  return (
    <div className="unit-info">
      <div className="unit-head">
        <CharAvatar memberId={sel.memberId} star={sel.star} color={sel.color} size={52} />
        <div>
          <b className="uname" style={{ color: sel.color }}>{sel.name}</b> <Stars n={sel.star} />
          <div className="muted">{sel.role} · {location(sel)}</div>
          <div className="chips">
            {sel.locked && <span className="chip lock">🔒 잠금</span>}
            {sel.mergeable && <span className="chip ok">▲ 합성 가능</span>}
            {sel.area === 'storage' && <span className="chip">보관 중 · 공격 안 함</span>}
            {!sel.rangeReaches && <span className="chip warn" title="현재 칸에서 기본 공격 사거리가 몬스터 경로에 닿지 않습니다">⚠ 사거리 부족</span>}
          </div>
        </div>
      </div>
      <div className="tabs">
        {([['info', '정보'], ['skill', '스킬'], ['effect', `효과${sel.effects.length ? ` ${sel.effects.length}` : ''}`]] as [Tab, string][]).map(([id, name]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{name}</button>
        ))}
      </div>
      <div className="tab-body">
        {tab === 'info' && (
          <dl>
            <dt>공격력</dt><dd>{Math.round(sel.damage).toLocaleString()}</dd>
            <dt>공격속도</dt><dd>{sel.attackSpeed}회/초</dd>
            <dt>사거리</dt><dd>{sel.range}{!sel.rangeReaches && <span className="warn-text"> · 이 칸에서는 경로에 닿지 않음</span>}</dd>
            <dt>기본 공격</dt><dd>{sel.attackDesc}</dd>
            <dt>판매가</dt><dd>{sel.sellPrice.toLocaleString()}G</dd>
            <dt>처치</dt><dd>{sel.kills}</dd>
          </dl>
        )}
        {tab === 'skill' && (
          <div className="skill">
            <div className="skill-head">
              <b style={{ color: sel.color }}>{sel.skillName}</b>
              {sel.skillCd <= 0 ? <span className="ready">준비 완료</span> : <span className="muted">{sel.skillCd.toFixed(1)}초 / {sel.skillCooldown}초</span>}
            </div>
            <div className="cd"><i style={{ width: `${100 - (sel.skillCd / sel.skillCooldown) * 100}%`, background: sel.color }} /></div>
            <p>{sel.skillDesc}</p>
            <p className="muted">등급 강화: {sel.starBonus}</p>
          </div>
        )}
        {tab === 'effect' && (sel.effects.length ? sel.effects.map((e) => <p key={e} className="effect">▲ {e}</p>) : <p className="muted">적용 중인 효과가 없습니다.</p>)}
      </div>
    </div>
  );
}

/** 난이도별 안내 (표시 전용 — 실제 수치는 data/difficulty.ts) */
const DIFF_INFO: Record<DifficultyId, { tag: string; badge?: string; points: string[] }> = {
  normal: {
    tag: '처음 플레이 · 규칙과 조합을 익히기 좋음',
    badge: '추천',
    points: ['1~10웨이브: 기본 체력', '11웨이브부터 일반 몬스터 체력 웨이브당 +2% (30웨이브 +40%)', '보스 체력 +35%'],
  },
  hard: {
    tag: '숙련자용 · 배치·합성·강화가 모두 중요',
    points: ['몬스터·보스 체력 +50%', '등장 수 +10% · 이동속도 +10%', '특수 능력·골드 보상은 보통과 동일'],
  },
};

/** 전투 대기 화면: 난이도 선택 모달 (선택 전에는 전투 조작 불가 — 하단 버튼은 started 전 비활성) */
function DifficultyModal({ onPick }: { onPick: (d: DifficultyId) => void }) {
  return (
    <div className="overlay diff-select">
      <div className="diff-modal" role="dialog" aria-labelledby="diff-title">
        <div className="dm-head">
          <span className="dm-kicker">전투 준비</span>
          <h3 id="diff-title">난이도 선택</h3>
        </div>
        <div className="dm-cards">
          {Object.values(DIFFICULTIES).map((d) => {
            const info = DIFF_INFO[d.id];
            return (
              <button key={d.id} className={`diff-card ${d.id}`} onClick={() => onPick(d.id)}>
                <span className="dc-top">
                  <b>{d.name}</b>
                  {info.badge && <em className="dc-badge">{info.badge}</em>}
                </span>
                <span className="dc-tag">{info.tag}</span>
                <ul>{info.points.map((t) => <li key={t}>{t}</li>)}</ul>
                <span className="dc-go">{d.name}으로 시작</span>
              </button>
            );
          })}
        </div>
        <div className="dm-foot">
          <span>30웨이브</span><span>몬스터 80마리 도달 시 패배</span><span>최종 보스 180초 제한</span>
          <p>진행 중에는 난이도를 바꿀 수 없으며, 재시작하면 다시 선택합니다.</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const hud = useSyncExternalStore(hudStore.subscribe, hudStore.get);
  const [focusId, setFocusId] = useState(MEMBERS[0].id);
  const [confirmSell, setConfirmSell] = useState<SelectedUnitInfo | null>(null);
  /** 일괄 판매 확인창: 열 때의 선택 목록 (실행 시 Scene에서 다시 검증) */
  const [confirmMulti, setConfirmMulti] = useState<{ ids: number[]; total: number } | null>(null);
  const [showRecords, setShowRecords] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const ctl = () => gameControls.current;
  const danger = hud ? hud.alive / hud.maxAlive : 0;
  const over = !!hud && (hud.phase === 'victory' || hud.phase === 'defeat');
  const playing = !!hud?.started && !over;
  const sel = hud?.selected ?? null;
  const gold = hud?.gold ?? 0;

  const multi = hud?.multiSell ?? { on: false, ids: [], total: 0 };
  useEffect(() => { if (!sel || over) setConfirmSell(null); }, [sel?.id, over]);
  useEffect(() => { if (!multi.on || over) setConfirmMulti(null); }, [multi.on, over]);

  const onSell = () => {
    if (!sel) return;
    if (sel.star >= 2) setConfirmSell(sel);
    else ctl()?.sell(sel.id);
  };

  // ── 키보드 단축키: 버튼과 같은 함수 호출. 모달·입력창·드래그 중·게임 종료 후·조합키 사용 시 무시 ──
  const keyState = useRef({ hud, focusId, modal: false });
  keyState.current = { hud, focusId, modal: showRecords || showGuide || !!confirmSell || !!confirmMulti };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { hud: h, focusId: fid, modal } = keyState.current;
      if (!h || e.ctrlKey || e.metaKey || e.altKey || e.repeat || modal) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!h.started || h.phase === 'victory' || h.phase === 'defeat' || h.dragging) return;
      const c = gameControls.current;
      if (!c) return;
      const k = e.code;
      const act: Record<string, () => void> = {
        KeyQ: () => c.summon(),
        KeyW: () => { if (h.focusUnlocked) c.summon(fid); },
        KeyE: () => c.mergeAll(),
        KeyA: () => c.toggleAutoMerge(),
        Space: () => c.togglePause(),
        KeyF: () => c.setSpeed(h.speed === 1 ? 2 : 1),
        Escape: () => { if (h.moveMode) c.toggleMoveMode(); else if (h.multiSell.on) c.toggleMultiSell(); },
      };
      if (!act[k]) return;
      e.preventDefault(); // 스페이스 스크롤·버튼 재클릭 등 브라우저 기본 동작 방지
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
      act[k]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1>꾸한성 디펜스</h1>
        {hud?.started && <span className={`diff-chip ${hud.difficulty}`}>{DIFFICULTIES[hud.difficulty].name}</span>}
        <div className="stat">
          <span className="label">웨이브</span>
          <b>{hud ? hud.wave : 0}<small> / {hud?.totalWaves ?? 30}</small></b>
        </div>
        <div className={`stat monsters ${danger >= 0.875 ? 'danger' : danger >= 0.75 ? 'warn' : ''}`} title="80마리에 도달하면 즉시 패배">
          <span className="label">몬스터 {danger >= 0.75 && '⚠'}</span>
          <b>{hud?.alive ?? 0}<small> / {hud?.maxAlive ?? 80}</small></b>
          <div className="meter"><i style={{ width: `${Math.min(100, danger * 100)}%` }} /></div>
        </div>
        <div className="stat gold">
          <span className="label">골드</span>
          <b>{gold.toLocaleString()}<small> G</small></b>
        </div>
        <div className="stat">
          <span className="label">게임 시간</span>
          <b>{formatTime(hud?.gameTime ?? 0)}</b>
        </div>
        {hud?.finalTimer != null && (
          <div className={`stat final ${hud.finalTimer <= 60 ? 'urgent' : ''}`}>
            <span className="label">⚠ 최종 보스 제한</span>
            <b>{formatTime(hud.finalTimer)}</b>
          </div>
        )}
        <div className="stat status">
          <span className="label">상태 · 처치 {hud?.kills ?? 0}</span>
          <b>{hud ? statusText(hud) : '로딩 중'}</b>
        </div>
        <div className="menu-btns">
          <button onClick={() => setShowGuide(true)}>게임 설명</button>
          <button onClick={() => setShowRecords(true)}>기록</button>
          <button onClick={() => ctl()?.restart()} title="현재 게임을 끝내고 난이도 선택으로">재시작</button>
        </div>
      </header>
      {showRecords && <RecordsModal onClose={() => setShowRecords(false)} />}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}

      <main className="middle">
        <div className="leftcol">
          <UpgradePanel list={hud?.upgrades ?? []} gold={gold} disabled={!playing} />
          <SynergyPanel list={hud?.synergies ?? []} />
        </div>
        <div className="map">
          <div className="syn-badge">시너지 {hud?.synergies.filter((s) => s.active).length ?? 0}</div>
          <GameCanvas />
          <Toast hud={hud} />
          {hud && !hud.started && <DifficultyModal onPick={(d) => ctl()?.start(d)} />}
          {!!hud?.bosses.length && (
            <div className={`bossbars n${hud.bosses.length}`}>
              {hud.bosses.map((b) => (
                <div key={b.id} className={`bossbar ${b.warning ? 'warning' : ''}`}>
                  <div className="row1">
                    <b style={{ color: b.color }}>👑 {b.name}</b>
                    {b.maxPhase > 1 && <span className="chip">{b.phase}/{b.maxPhase}P</span>}
                    {b.armor && <span className="chip gold">방어</span>}
                    {b.shield && <span className="chip cyan">보호막</span>}
                    {b.enraged && <span className="chip red">광폭</span>}
                    <span className="pct">{b.hpPct}%</span>
                  </div>
                  <div className="bar"><i style={{ width: `${b.hpPct}%` }} /></div>
                  {b.warning && <div className="warn-line">⚠ 곧 「{b.warning}」</div>}
                </div>
              ))}
            </div>
          )}
          {over && <ResultPanel hud={hud!} onRestart={() => ctl()?.restart()} onRecords={() => setShowRecords(true)} />}
          {confirmMulti && (
            <div className="overlay">
              <h3>일괄 판매 확인</h3>
              <p>
                선택한 유닛 <b>{confirmMulti.ids.length}개</b>를 총 <b className="price">{confirmMulti.total.toLocaleString()}G</b>에 판매할까요?
                <br /><span className="muted small">잠금 유닛은 제외되며, 판매 직전에 상태가 바뀐 유닛(합성 등)은 판매하지 않습니다.</span>
              </p>
              <div className="row">
                <button className="danger" onClick={() => { const c = confirmMulti; setConfirmMulti(null); ctl()?.sellMany(c.ids); }}>판매</button>
                <button onClick={() => setConfirmMulti(null)}>취소</button>
              </div>
            </div>
          )}
          {confirmSell && (
            <div className="overlay">
              <h3>판매 확인</h3>
              <p>
                <b style={{ color: confirmSell.color }}>{confirmSell.name}</b> <Stars n={confirmSell.star} /> 을(를){' '}
                <b className="price">{confirmSell.sellPrice.toLocaleString()}G</b>에 판매할까요?
              </p>
              <div className="row">
                <button className="danger" onClick={() => { setConfirmSell(null); ctl()?.sell(confirmSell.id); }}>판매</button>
                <button onClick={() => setConfirmSell(null)}>취소</button>
              </div>
            </div>
          )}
        </div>

        <aside className="panel">
          <section className="sel-section">
            {sel ? <UnitInfo key={sel.id} sel={sel} /> : (
              <p className="hint">유닛을 클릭하면 정보가 표시됩니다.<br />드래그로 전투 칸·보관함 사이를 옮길 수 있습니다.</p>
            )}
            {hud?.moveMode && <p className="hint small">이동할 전투 칸 또는 보관함 칸을 클릭하세요. (Esc 취소)</p>}
            {multi.on && <p className="hint small multi-hint">다중 판매 모드: 전투 칸·보관함에서 판매할 유닛을 클릭해 선택/해제하세요. 잠금 유닛은 선택되지 않습니다. (Esc 종료)</p>}
          </section>
          <section className="storage-section">
            <h3>보관함 <span className="muted">{hud?.storage.filter(Boolean).length ?? 0}/20 · 공격 안 함</span></h3>
            <div className={`storage ${hud?.moveMode || hud?.dragging ? 'moving' : ''} ${multi.on ? 'multi' : ''}`}>
              {(hud?.storage ?? Array(20).fill(null)).map((u, i) => (
                <button
                  key={i}
                  className={`slot ${u?.id === sel?.id && u ? 'selected' : ''} ${u?.mergeable ? 'mergeable' : ''} ${u?.locked ? 'locked' : ''} ${u?.picked ? 'picked' : ''}`}
                  data-slot={i}
                  onPointerDown={(e) => u && !multi.on && pressStorage(u.id, e)}
                  onClick={() => ctl()?.clickSlot('storage', i)}
                  title={u ? `${u.name} ${u.star}성${u.locked ? ' · 잠금' : ''}${u.mergeable ? ' · 합성 가능' : ''}` : '빈 칸'}
                >
                  {u && (
                    <>
                      <span className="s">{'★'.repeat(u.star)}</span>
                      <CharAvatar memberId={u.memberId} star={u.star} color={u.color} size={26} />
                      {u.mergeable && <span className="merge-badge" title="합성 가능">▲</span>}
                      <span className="n">{u.name}</span>
                      {u.locked && <span className="lock">🔒</span>}
                      {u.picked && <span className="pick">✓</span>}
                    </>
                  )}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </main>

      <DragLayer />
      <footer className="controls">
        <div className="group">
          <button className={`speed ${hud?.speed === 2 ? 'on' : ''}`} onClick={() => ctl()?.setSpeed(hud?.speed === 2 ? 1 : 2)} disabled={!playing}>
            {hud?.speed === 2 ? '2배속' : '1배속'} <Kbd k="F" />
          </button>
          <button className={hud?.paused ? 'on' : ''} onClick={() => ctl()?.togglePause()} disabled={!playing}>
            {hud?.paused ? '계속' : '일시정지'} <Kbd k="Space" />
          </button>
        </div>
        <div className="group main">
          <button className="summon" onClick={() => ctl()?.summon()} disabled={!playing}>
            일반 소환 <small className={gold < SUMMON_COST ? 'lack' : ''}>{SUMMON_COST}G</small> <Kbd k="Q" />
          </button>
          <select value={focusId} onChange={(e) => setFocusId(e.target.value)} disabled={!playing || !hud?.focusUnlocked} title="집중 소환 대상">
            {MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button className="summon" onClick={() => ctl()?.summon(focusId)} disabled={!playing || !hud?.focusUnlocked}>
            {hud?.focusUnlocked
              ? <>집중 소환 <small className={gold < FOCUS_COST ? 'lack' : ''}>{FOCUS_COST}G</small> <Kbd k="W" /></>
              : <>🔒 집중 <small>{FOCUS_UNLOCK_WAVE}웨이브</small></>}
          </button>
          <button className={hud?.anyMergeable && !multi.on ? 'glow' : ''} onClick={() => ctl()?.mergeAll()} disabled={!playing || multi.on} title={multi.on ? '다중 판매 모드에서는 사용할 수 없습니다' : ''}>원클릭 합성 <Kbd k="E" /></button>
          <button className={hud?.autoMerge ? 'on' : ''} onClick={() => ctl()?.toggleAutoMerge()} disabled={!playing}>
            자동 합성 {hud?.autoMerge ? 'ON' : 'OFF'} <Kbd k="A" />
          </button>
        </div>
        {multi.on ? (
          <div className="group unit multi">
            <span className="glabel">다중 판매</span>
            <button className="on" onClick={() => ctl()?.toggleMultiSell()} disabled={!playing} title="다중 판매 모드 끄기 (Esc)">다중 판매 ON</button>
            <span className="multi-sum"><b>{multi.ids.length}</b>개 · <b className="price">+{multi.total.toLocaleString()}G</b></span>
            <button onClick={() => ctl()?.clearMultiSell()} disabled={!multi.ids.length || !playing}>선택 해제</button>
            <button className="danger" onClick={() => setConfirmMulti({ ids: multi.ids, total: multi.total })} disabled={!multi.ids.length || !playing}>선택 판매</button>
          </div>
        ) : (
          <div className={`group unit ${sel ? '' : 'idle'}`} title={sel ? '' : '유닛을 선택하면 사용할 수 있습니다'}>
            <span className="glabel">선택 유닛</span>
            <button className={hud?.moveMode ? 'on' : ''} onClick={() => ctl()?.toggleMoveMode()} disabled={!sel || !playing}>{hud?.moveMode ? '이동 취소' : '이동'}</button>
            <button className={sel?.locked ? 'on' : ''} onClick={() => ctl()?.toggleLock()} disabled={!sel || !playing}>{sel?.locked ? '잠금 해제' : '잠금'}</button>
            <button onClick={() => ctl()?.mergeSelected()} disabled={!sel?.mergeable || !playing}>합성</button>
            <button className="danger" onClick={onSell} disabled={!sel || sel.locked || !playing}>판매{sel ? ` +${sel.sellPrice.toLocaleString()}G` : ''}</button>
            <button className="multi-btn" onClick={() => ctl()?.toggleMultiSell()} disabled={!playing} title="여러 유닛을 골라 한 번에 판매">다중 판매</button>
          </div>
        )}
      </footer>
    </div>
  );
}
