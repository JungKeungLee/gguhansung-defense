import { useState } from 'react';
import { gameControls, type UpgradeView } from '../game/bridge';

const pct = (v: number) => `+${Math.round(v * 100)}%`;

/** 전역 강화 (표시값은 Scene이 전투 계산과 같은 데이터·함수로 만든 값) */
export default function UpgradePanel({ list, gold, disabled }: { list: UpgradeView[]; gold: number; disabled: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="upgrade">
      <button className="syn-head" onClick={() => setOpen(!open)}>
        전역 강화 <b>{list.reduce((s, u) => s + u.level, 0)}</b> / {list.length * 5} <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="upg-list">
          {list.map((u) => {
            const max = u.nextCost === null;
            const lack = !max && gold < u.nextCost!;
            const state = max ? 'max' : lack ? 'lack' : 'can';
            return (
              <div key={u.id} className={`upg-row ${state}`}>
                <div className="upg-info">
                  <b>{u.name}</b> <span className="lv">Lv{u.level}/{u.max}</span>
                  <div className="pips">{Array.from({ length: u.max }, (_, i) => <i key={i} className={i < u.level ? 'on' : ''} />)}</div>
                  <div className="eff">{max ? `${pct(u.bonus)} (최대)` : <>{pct(u.bonus)} → <b>{pct(u.bonus + u.perLevel)}</b></>}</div>
                </div>
                <button disabled={max || lack || disabled} onClick={() => gameControls.current?.buyUpgrade(u.id)}
                  title={max ? '최대 단계' : lack ? `골드 부족 (${u.nextCost! - gold}G 더 필요)` : '강화'}>
                  {max ? 'MAX' : <>{u.nextCost}G{lack && <small>부족</small>}</>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
