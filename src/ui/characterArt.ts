/**
 * 캐릭터 이미지 해석: 멤버 ID + 별 등급 → 이미지 URL (없으면 null → 임시 캐릭터 표시)
 * 파일 규칙: src/assets/characters/{memberId}/star-{1~5}.webp (전투용 256×256, png 허용, webp 우선)
 * 고화질 원본은 src/assets/characters-full/ 에 별도 보관 (번들에 포함되지 않음, tools/assets/optimize-characters.cjs 입력)
 * Vite가 빌드 시 존재하는 파일만 수집하므로 누락 파일 요청·오류가 발생하지 않음. 전투 로직과 무관(UI 전용).
 */
import { artKey, buildArtMap } from './artPaths';

const files = import.meta.glob('../assets/characters/*/star-*.{webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const ART = buildArtMap(files);
export { artKey };

/** 이미지 URL 또는 null(임시 표시) */
export const characterImage = (memberId: string, star: number, map: Map<string, string> = ART) => map.get(artKey(memberId, star)) ?? null;
/** 텍스처 키 → URL (Phaser 지연 로딩용) */
export const artUrl = (key: string) => ART.get(key) ?? null;
