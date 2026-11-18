/** 스킬 이펙트 이미지 URL (Vite가 빌드 시 존재하는 파일만 수집 — 없으면 null → 기존 원·선 이펙트만 표시) */
const files = import.meta.glob('../assets/effects/skills-512/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const byId = new Map<string, string>();
for (const [p, url] of Object.entries(files)) { const m = p.match(/skills-512\/([^/]+)\.webp$/); if (m) byId.set(m[1], url); }
export const skillFxUrl = (memberId: string) => byId.get(memberId) ?? null;
