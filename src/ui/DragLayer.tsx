import { useEffect, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from 'react';
import { gameControls, hudStore } from '../game/bridge';
import type { Area } from '../game/combat';
import { MAP_H, MAP_W, cellAt } from '../game/layout';
import CharAvatar from './CharAvatar';

/** 보관함에서 누른 위치 (8px 이상 움직이면 드래그 시작) */
let press: { id: number; x: number; y: number } | null = null;

export function pressStorage(id: number, e: RPointerEvent) {
  if (e.button === 0) press = { id, x: e.clientX, y: e.clientY };
}

/** 드롭 위치 판정: 캔버스 → 전투 칸, data-slot → 보관함, 그 외 null(원위치) */
function dropTarget(x: number, y: number): { area: Area; index: number } | null {
  const el = document.elementFromPoint(x, y);
  if (el instanceof HTMLCanvasElement) {
    const r = el.getBoundingClientRect();
    const i = cellAt(((x - r.left) * MAP_W) / r.width, ((y - r.top) * MAP_H) / r.height);
    return i >= 0 ? { area: 'field', index: i } : null;
  }
  const slot = el?.closest<HTMLElement>('[data-slot]');
  return slot ? { area: 'storage', index: Number(slot.dataset.slot) } : null;
}

/** 드래그 고스트 + 드롭 처리. 실제 이동은 Scene.endDrag → moveUnit 한 경로 */
export default function DragLayer() {
  const hud = useSyncExternalStore(hudStore.subscribe, hudStore.get);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) {
        gameControls.current?.beginDrag(press.id);
        press = null;
      }
      if (hudStore.get()?.dragging) setPos({ x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      press = null;
      if (!hudStore.get()?.dragging) return;
      gameControls.current?.endDrag(e.type === 'pointerup' ? dropTarget(e.clientX, e.clientY) : null);
      setPos(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);
  const d = hud?.dragging;
  if (!d || !pos) return null;
  return (
    <div className="drag-ghost" style={{ left: pos.x + 14, top: pos.y + 14 }}>
      <CharAvatar memberId={d.memberId} star={d.star} color={d.color} size={24} />
      {d.name} <span className="stars">{'★'.repeat(d.star)}</span>{d.locked && ' 🔒'}
    </div>
  );
}
