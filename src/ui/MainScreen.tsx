import type { ReactNode } from 'react';
import mainBg from '../assets/backgrounds/main-menu.webp';
import { BALANCE_VERSION } from '../data/version';
import { WAVES } from '../data/waves';

/**
 * 메인·난이도 선택 공통 배경 (전투 화면 위를 덮는 전체 화면 레이어).
 * 전투 화면(Phaser)은 뒤에 한 번만 만들어 두고 재사용하므로 화면 전환 시 게임이 중복 생성되지 않음.
 */
export function MainScreen({ children }: { children: ReactNode }) {
  return (
    <div className="main-screen" style={{ backgroundImage: `url(${mainBg})` }}>
      {children}
      <span className="main-ver">밸런스 {BALANCE_VERSION}</span>
    </div>
  );
}

/** 메인 메뉴: 제목 + 게임 시작 / 게임 설명 / 기록 보기 */
export function MainMenu({ onStart, onGuide, onRecords }: { onStart: () => void; onGuide: () => void; onRecords: () => void }) {
  return (
    <div className="main-menu">
      <span className="mm-kicker">✦ 꾸한성 랜덤 디펜스 ✦</span>
      <h1 className="mm-title">꾸한성 디펜스</h1>
      <p className="mm-sub">멤버를 소환·합성하고 시너지를 맞춰 {WAVES.length}웨이브를 막아내세요</p>
      <div className="mm-buttons">
        <button className="mm-start" onClick={onStart}>게임 시작</button>
        <div className="mm-row">
          <button onClick={onGuide}>게임 설명</button>
          <button onClick={onRecords}>기록 보기</button>
        </div>
      </div>
    </div>
  );
}
