import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { BattleScene } from '../game/BattleScene';
import { MAP_H, MAP_W } from '../game/layout';
import { gameControls } from '../game/bridge';

/**
 * Phaser 게임은 앱 전체에서 1개만 생성해 재사용 (메인·난이도 선택 화면에서도 유지).
 * active=false(메인·선택 화면)이면 게임 루프를 휴면시켜 렌더링·갱신을 멈추고, 전투 화면에서 다시 깨움.
 */
export default function GameCanvas({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ref.current!,
      width: MAP_W,
      height: MAP_H,
      backgroundColor: '#140a0d',
      scene: [BattleScene],
      banner: false,
      // 부모(.map) 크기에 맞춰 비율 유지 축소. 내부 좌표는 1000×700 그대로라 클릭·드래그 판정 불변
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    gameRef.current = game;
    return () => { gameRef.current = null; game.destroy(true); };
  }, []);
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    if (active) { game.loop.wake(); return; }
    // 씬 생성(첫 로딩) 전에는 재우지 않음: 프레임마다 씬 준비(조작 연결) 여부를 확인한 뒤 휴면
    if (gameControls.current) { game.loop.sleep(); return; }
    const onStep = () => {
      if (!gameControls.current) return;
      game.events.off(Phaser.Core.Events.POST_STEP, onStep);
      game.loop.sleep();
    };
    game.events.on(Phaser.Core.Events.POST_STEP, onStep);
    return () => { game.events.off(Phaser.Core.Events.POST_STEP, onStep); };
  }, [active]);
  return <div ref={ref} className="canvas" />;
}
