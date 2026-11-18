import { useState } from 'react';
import { MEMBERS, memberById } from '../data/members';
import { MERGE_COUNT, SELL_PRICE, STAR_DAMAGE_MULT, STAR_SKILL_DAMAGE_BONUS, unitStats } from '../data/units';
import { DISABLED_TIERS, SYNERGIES, SYNERGY_CAPS, TIER_RULES, isTierEnabled } from '../data/synergies';
import { UPGRADES, UPGRADE_IDS, UPGRADE_MAX } from '../data/upgrades';
import { DIFFICULTIES } from '../data/difficulty';
import { FOCUS_COST, FOCUS_RATE, FOCUS_UNLOCK_WAVE, START_GOLD, SUMMON_COST } from '../data/economy';
import { MAX_ALIVE, FINAL_BOSS_TIME, WAVES } from '../data/waves';
import CharAvatar from './CharAvatar';

/** 게임 설명·조합법. 모든 수치는 게임 데이터에서 직접 읽어 표시 (데이터 변경 시 자동 반영) */
type Tab = 'rules' | 'merge' | 'members' | 'synergy' | 'upgrade';
const TABS: [Tab, string][] = [['rules', '기본 규칙'], ['merge', '합성법'], ['members', '멤버·스킬'], ['synergy', '시너지 조합'], ['upgrade', '강화·난이도']];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const TIER_TEXT = (t: 2 | 3 | 5 | 10) => {
  const r = TIER_RULES[t];
  return t === 10 ? '멤버 10명 모두 전투 칸에 배치 (1성 이상)' : `전원 ${r.minStar}성 이상${r.highCount ? ` + 서로 다른 멤버 ${r.highCount}명 3성 이상` : ''}`;
};

export default function GuideModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('rules');
  // 1성 기준 필요 개수: 2성 2, 3성 6, 4성 18, 5성 54
  const need = [1];
  for (let s = 1; s < 5; s++) need.push(need[s - 1] * MERGE_COUNT[s - 1]);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal guide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>게임 설명</h3>
          <button className="close" onClick={onClose}>닫기</button>
        </div>
        <div className="guide-tabs">
          {TABS.map(([id, name]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{name}</button>
          ))}
        </div>
        <div className="guide-body">
          {tab === 'rules' && (
            <>
              <h4>목표</h4>
              <ul>
                <li>{WAVES.length}웨이브의 몬스터를 모두 처치하면 승리합니다. 몬스터는 외곽 경로를 시계 방향으로 계속 돌며 사라지지 않습니다.</li>
                <li>살아 있는 몬스터가 <b>{MAX_ALIVE}마리</b>에 도달하면 즉시 패배합니다.</li>
                <li>{WAVES.length}웨이브 최종 보스가 등장하면 <b>{FINAL_BOSS_TIME}초</b> 안에 남은 몬스터를 모두 처치해야 합니다. 보스만 잡고 다른 몬스터가 남으면 승리가 아닙니다.</li>
                <li>5·10·15·20·25·30웨이브에 보스가 등장합니다. 이전 웨이브 몬스터가 남아 있어도 다음 웨이브는 진행됩니다.</li>
              </ul>
              <h4>진행 방법</h4>
              <ul>
                <li>게임은 <b>기본 2배속</b>으로 진행되며 [배속] 버튼 또는 <b>F키</b>로 2배속 ↔ 3배속을 바꿉니다. 웨이브·이동·공격·스킬 쿨타임 모두 같은 배속이 적용되고, 최종 보스 제한시간 180초는 게임 시간 기준입니다.</li>
                <li>시작 골드 {START_GOLD}G. 몬스터 처치·웨이브 출현 완료 시 골드를 얻습니다.</li>
                <li><b>일반 소환 {SUMMON_COST}G</b>: 10명 중 무작위 1성. <b>집중 소환 {FOCUS_COST}G</b>({FOCUS_UNLOCK_WAVE}웨이브부터): 고른 멤버 {pct(FOCUS_RATE)} 확률.</li>
                <li>소환된 유닛은 전투 칸(20칸)에 먼저, 가득 차면 보관함(20칸)에 들어갑니다. <b>보관함 유닛은 공격하지 않습니다.</b></li>
                <li>유닛을 <b>드래그</b>하거나 선택 후 [이동]으로 전투 칸·보관함 사이를 옮기고, 유닛이 있는 칸에 놓으면 서로 교환됩니다.</li>
                <li>[잠금]한 유닛은 합성·판매에서 제외됩니다. 2성 이상 판매 시 확인창이 뜹니다.</li>
                <li><b>[다중 판매]</b>를 켜면 전투 칸·보관함 유닛을 여러 개 클릭해 고른 뒤 [선택 판매]로 한 번에 팔 수 있습니다. (잠금 유닛 제외, Esc로 종료)</li>
                <li>모든 유닛은 사거리 안에서 <b>가장 앞서 가는 몬스터</b>를 자동 공격하고, 스킬은 쿨타임마다 자동 발동합니다.</li>
              </ul>
            </>
          )}

          {tab === 'merge' && (
            <>
              <h4>합성 규칙</h4>
              <p>같은 멤버 · 같은 등급 · 잠금되지 않은 유닛을 모으면 다음 등급 1개가 됩니다. 비용은 없습니다.</p>
              <table className="stats">
                <thead><tr><th>결과</th><th>재료</th><th>1성 기준 필요 수</th><th>공격력 배율</th><th>스킬 피해 보너스</th><th>판매가</th></tr></thead>
                <tbody>
                  <tr><td>1성</td><td>소환</td><td>1</td><td>×{STAR_DAMAGE_MULT[0]}</td><td>-</td><td>{SELL_PRICE[0]}G</td></tr>
                  {[2, 3, 4, 5].map((s) => (
                    <tr key={s}>
                      <td>{'★'.repeat(s)} {s}성</td><td>{s - 1}성 {MERGE_COUNT[s - 2]}개</td><td>{need[s - 1]}</td>
                      <td>×{STAR_DAMAGE_MULT[s - 1]}</td><td>+{pct(STAR_SKILL_DAMAGE_BONUS[s - 1])}</td><td>{SELL_PRICE[s - 1].toLocaleString()}G</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul>
                <li><b>수동 합성</b>: 유닛 선택 후 [합성]. 재료가 전투 칸에 있으면 그 위치에 결과가 남습니다.</li>
                <li><b>원클릭 합성</b>: 가능한 모든 조합을 낮은 등급부터 연쇄로 합성합니다.</li>
                <li><b>자동 합성</b>: 켜 두면 소환할 때마다 원클릭 합성을 실행합니다. (기본 OFF)</li>
                <li>합성 가능한 유닛은 초록 테두리와 ▲ 표시가 붙습니다. 5성은 더 합성할 수 없습니다.</li>
                <li>판매가는 재료 가치와 같아서 합성 전후 판매 금액이 같습니다.</li>
              </ul>
            </>
          )}

          {tab === 'members' && (
            <div className="guide-members">
              {MEMBERS.map((m) => (
                <div key={m.id} className="g-member">
                  <div className="g-head">
                    <CharAvatar memberId={m.id} star={1} color={hex(m.color)} size={28} />
                    <b style={{ color: hex(m.color) }}>{m.name}</b>
                    <span className="muted">{m.role} · 공격력 {m.damage} · {m.attackSpeed}회/초 · 사거리 {Math.round(unitStats(m.id, 1).range)}</span>
                  </div>
                  <p>기본 공격: {m.attackDesc}</p>
                  <p>스킬 <b>「{m.skill.name}」</b> (쿨타임 {m.skill.cooldown}초): {m.skill.desc}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'synergy' && (
            <>
              <h4>발동 조건 (전투 칸 기준, 같은 멤버가 여럿이면 최고 등급으로 판정)</h4>
              <ul>
                {([2, 3, 5, 10] as const).filter(isTierEnabled).map((t) => <li key={t}><b>{t}인</b>: {TIER_TEXT(t)}</li>)}
                {DISABLED_TIERS.length > 0 && <li className="muted">{DISABLED_TIERS.map((t) => `${t}인`).join('·')} 시너지는 현재 버전에서 비활성입니다.</li>}
                <li>여러 시너지를 동시에 발동할 수 있으며, 한 멤버가 여러 조합에 동시에 참여할 수 있습니다.</li>
                <li>보너스 합산 상한: 공격력 계열 +{pct(SYNERGY_CAPS.atk)}, 스킬·광역 계열 +{pct(SYNERGY_CAPS.skill)}, 둘의 합계 +{pct(SYNERGY_CAPS.damageTotal)}, 공격속도 +{pct(SYNERGY_CAPS.attackSpeed)}, 쿨타임 감소 {pct(SYNERGY_CAPS.cooldown)}</li>
              </ul>
              <div className="guide-syn">
                {SYNERGIES.map((s) => (
                  <div key={s.id} className="g-syn">
                    <div className="syn-title"><span className="tier">{s.tier}인</span><b>{s.name}</b></div>
                    <div className="syn-members">{s.members.map((id) => <span key={id}>{memberById(id).name}</span>)}</div>
                    <p className="syn-desc">{s.desc}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'upgrade' && (
            <>
              <h4>전역 강화 (전투 칸 유닛 전체 적용, 최대 {UPGRADE_MAX}단계, 재시작 시 초기화)</h4>
              <table className="stats">
                <thead><tr><th>항목</th><th>단계당</th><th>단계별 비용</th><th>적용 대상</th></tr></thead>
                <tbody>
                  {UPGRADE_IDS.map((id) => (
                    <tr key={id}><td>{UPGRADES[id].name}</td><td>+{pct(UPGRADES[id].perLevel)}</td><td>{UPGRADES[id].costs.map((c) => `${c}G`).join(' → ')}</td><td>{UPGRADES[id].desc}</td></tr>
                  ))}
                </tbody>
              </table>
              <h4>난이도</h4>
              <ul>
                {Object.values(DIFFICULTIES).map((d) => (
                  <li key={d.id}><b>{d.name}</b>: {d.desc}{d.id !== 'normal' && ` (체력 ×${d.hpMult}, 보스 ×${d.bossHpMult}, 이동속도 ×${d.speedMult})`}</li>
                ))}
                <li>난이도는 시작할 때만 고를 수 있고, 재시작하면 다시 선택합니다.</li>
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
