# 캐릭터 전투용 이미지 (자동 생성)

경로 규칙: `src/assets/characters/{멤버ID}/star-{1~5}.webp` — 256×256, 투명 배경, 손실 WebP

멤버 ID: yappu, harunotsuki, manjo, moya, yuntami, yamuji, nanwony, kkutinho, kimokdok, damyu

- 이 폴더는 `tools/assets/optimize-characters.cjs`가 `src/assets/characters-full/`(고화질 원본)에서 생성합니다. 직접 수정하지 말고 원본을 바꾼 뒤 스크립트를 다시 실행하세요.
- 빌드 시 자동 인식(`import.meta.glob`) — 코드 수정 불필요. 없는 등급은 임시 원형 캐릭터로 표시.
- 투명 여백만 잘라내고(인물 픽셀은 자르지 않음) 비율을 유지한 채 정사각 캔버스 중앙에 배치합니다.
