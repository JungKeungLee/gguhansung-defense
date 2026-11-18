/** 몬스터 이미지 URL 해석 (Vite가 빌드 시 존재하는 파일만 수집 — 누락 시 null → 기존 도형 표시) */
import { MONSTER_ART_FILE } from './monsterArtMap';

const files = import.meta.glob('../assets/monsters/*/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const byName = new Map<string, string>();
for (const [p, url] of Object.entries(files)) {
  const m = p.match(/monsters\/((?:regular|bosses)\/[^/]+)\.webp$/);
  if (m) byName.set(m[1], url);
}
export const monsterArtUrl = (monsterId: string) => {
  const f = MONSTER_ART_FILE[monsterId];
  return f ? (byName.get(f) ?? null) : null;
};
