import { useState } from 'react';
import { characterImage } from './characterArt';

/** 보관함·선택 정보·드래그 고스트 공통: 멤버+등급 이미지, 없거나 로드 실패 시 임시 원형 */
export default function CharAvatar({ memberId, star, color, size }: { memberId: string; star: number; color: string; size: number }) {
  const src = characterImage(memberId, star);
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src) {
    return <img className="char-img" src={src} width={size} height={size} alt="" draggable={false} onError={() => setFailed(src)} />;
  }
  return <i className="avatar" style={{ background: color, width: size, height: size }} />;
}
