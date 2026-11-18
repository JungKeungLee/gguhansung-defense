import { useState } from 'react';
import type { SynergyView } from '../game/bridge';
import { memberById } from '../data/members';
import { TIER_RULES, tierRuleText, type SynergyTier } from '../data/synergies';

const TIER_LABEL: Record<number, string> = { 2: '2인', 3: '3인', 5: '5인', 10: '10인' };

/** 달성 진행도: (minStar 충족 멤버 수 + 충족한 상위 등급(highStar) 조건 수) / (멤버 수 + 필요 상위 등급 수) */
function progress(s: SynergyView) {
  const rule = TIER_RULES[s.tier as SynergyTier];
  const met = s.members.filter((m) => m.star >= rule.minStar).length;
  const high = Math.min(rule.highCount, s.members.filter((m) => m.star >= rule.highStar).length);
  return (met + high) / (s.members.length + rule.highCount);
}

function Item({ s, open, onToggle }: { s: SynergyView; open: boolean; onToggle: () => void }) {
  const p = s.active ? 1 : progress(s);
  const min = TIER_RULES[s.tier as SynergyTier].minStar;
  return (
    <div className={`syn-item ${s.active ? 'on' : ''} ${open ? 'open' : ''}`}>
      <button className="syn-row" onClick={onToggle} title={s.desc}>
        <span className="tier">{TIER_LABEL[s.tier]}</span>
        <b>{s.name}</b>
        <span className="state">{s.active ? '활성' : `${Math.round(p * 100)}%`}</span>
      </button>
      {!s.active && <div className="syn-prog"><i style={{ width: `${p * 100}%` }} /></div>}
      {open && (
        <div className="syn-detail">
          <p className="syn-desc">{s.desc}</p>
          <div className="syn-members">
            {s.members.map((m) => (
              <span key={m.id} className={m.star >= min ? 'ok' : m.star ? 'low' : 'none'}>{memberById(m.id).name}{m.star ? ` ${m.star}★` : ''}</span>
            ))}
          </div>
          {!s.active && (
            <p className="syn-need">
              {tierRuleText(s.tier as SynergyTier, true)}
              {s.missing.length > 0 && ` · 부족: ${s.missing.map((id) => memberById(id).name).join(', ')}`}
              {s.needHigh > 0 && ` · ${TIER_RULES[s.tier as SynergyTier].highStar}성 ${s.needHigh}명 더`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** 기본: 활성 + 달성이 가까운(진행도 50%↑) 시너지 최대 4개. 나머지는 '전체 보기'로 펼침. 항목 클릭 시 상세 */
export default function SynergyPanel({ list }: { list: SynergyView[] }) {
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const active = list.filter((s) => s.active);
  const rest = list.filter((s) => !s.active).sort((a, b) => progress(b) - progress(a) || a.tier - b.tier);
  const near = rest.filter((s) => progress(s) >= 0.5).slice(0, 4);
  const others = rest.filter((s) => !near.includes(s));
  const toggle = (id: string) => setOpenId(openId === id ? null : id);
  return (
    <aside className="synergy">
      <div className="syn-head">시너지 <b>{active.length}</b> / {list.length}</div>
      <div className="syn-list">
        {active.length > 0 && <div className="syn-group">활성</div>}
        {active.map((s) => <Item key={s.id} s={s} open={openId === s.id} onToggle={() => toggle(s.id)} />)}
        {near.length > 0 && <div className="syn-group">달성 임박</div>}
        {near.map((s) => <Item key={s.id} s={s} open={openId === s.id} onToggle={() => toggle(s.id)} />)}
        {!active.length && !near.length && <p className="muted small">조합 멤버를 모두 3성 이상으로 전투 칸에 배치하면 시너지가 활성화됩니다.</p>}
        <button className="syn-more" onClick={() => setShowAll(!showAll)}>{showAll ? '접기 ▴' : `나머지 ${others.length}개 보기 ▾`}</button>
        {showAll && others.map((s) => <Item key={s.id} s={s} open={openId === s.id} onToggle={() => toggle(s.id)} />)}
      </div>
    </aside>
  );
}
