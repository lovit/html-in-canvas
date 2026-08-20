# 용어 대응표

번역하면 오히려 헷갈리는 말이 있다. 이 저장소는 아래 원어를 그대로 쓴다.

| 원어 | 이 저장소에서 쓰는 말 | 설명 |
| --- | --- | --- |
| hit testing | 히트 테스트 | 화면의 어느 좌표가 어느 엘리먼트인지 판정하는 일. 클릭과 커서 모양이 여기에 달려 있다 |
| accessibility tree | 접근성 트리 | 스크린리더가 읽는, DOM 과 별개로 유지되는 구조 |
| fallback content | fallback content | `<canvas>` 안에 넣는 대체 콘텐츠. 이 API 에서는 실제로 그려지는 대상이기도 하다 |
| current transformation matrix (CTM) | 현재 변환 행렬 | 캔버스에 누적된 `translate`/`scale`/`rotate` 상태 |
| invalidation | 무효화 | "다시 그려야 함" 표시가 붙는 일 |
| origin trial | origin trial | 특정 사이트에 한해 실험 기능을 켜 주는 크롬의 제도 |
| read-back-allowed rendering | read-back-allowed 렌더링 | 픽셀을 읽어도 정보가 새지 않는 것만 그리는 규칙 |
| taint | 오염 | 캔버스가 교차 출처 데이터로 더럽혀져 `getImageData()` 가 막히는 상태 |
| device pixel ratio | 디바이스 픽셀 비율 | CSS 픽셀 하나가 실제 화면 픽셀 몇 개인지 |
| transferable | transferable | 워커로 소유권째 넘길 수 있는 객체 |
| shader | 셰이더 | GPU 에서 도는 작은 프로그램 |
| texture | 텍스처 | GPU 메모리에 올린 이미지 |
