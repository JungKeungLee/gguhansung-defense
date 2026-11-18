import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { BattleScene } from '../game/BattleScene';
import { MAP_H, MAP_W } from '../game/layout';

export default function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
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
    return () => game.destroy(true);
  }, []);
  return <div ref={ref} className="canvas" />;
}
