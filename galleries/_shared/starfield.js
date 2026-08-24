// 21·22 가 함께 쓰는 별 생성기.
//
// 미리 만들어 둔 별 목록이 없다. 화면에 보이는 칸마다 그 칸의 id 로 시드를 만들어
// 별을 그 자리에서 만든다. 그래서
//
//   - 같은 자리를 나갔다가 다시 확대하면 같은 별이 나온다
//   - 깊이가 늘 때마다 칸이 넷으로 쪼개지고 각 칸이 자기 별을 새로 낸다
//   - 미리 만들 것이 없으니 메모리와 로딩이 깊이와 무관하다
//
// 좌표계는 0~1 정사각형이다. 깊이 d 에서 칸 하나의 크기는 1 / 2^d 다.

/** 깊이가 깊을수록 칸마다 별이 더 촘촘해진다. 이 값이 "확대하면 새 별이 나온다" 를 만든다. */
const STARS_AT = (depth) => 5 + depth * 3;

/**
 * 별의 세계 좌표 반지름. 칸 크기(2^-d)와 같은 속도로 줄인다.
 *
 * 칸보다 천천히 줄이면 깊은 층의 별이 화면을 덮어 버린다. 처음에 0.66^d 로 뒀다가
 * 64배에서 별 하나가 26픽셀짜리 덩어리가 되는 것을 보고 고쳤다.
 * 확대할수록 별이 느는 것은 반지름이 아니라 STARS_AT 이 만든다.
 */
const RADIUS_AT = (depth) => 0.007 / 2 ** depth;

const TONES = [
  { key: 'O', color: '#a5b4fc', label: '청백색' },
  { key: 'A', color: '#e0e7ff', label: '흰색' },
  { key: 'G', color: '#fde68a', label: '노란색' },
  { key: 'K', color: '#fdba74', label: '주황색' },
  { key: 'M', color: '#fca5a5', label: '붉은색' },
];

const SYLLABLES = ['아', '레', '카', '니', '토', '샤', '무', '델', '라', '온', '베', '유'];

/** 32비트 해시. 칸 좌표를 시드 하나로 접는다. */
function hash(depth, cellX, cellY) {
  let value = (depth * 0x9e3779b1) ^ (cellX * 0x85ebca6b) ^ (cellY * 0xc2b2ae35);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** 시드 하나로 도는 난수. 같은 시드면 언제나 같은 수열이 나온다. */
function random(seed) {
  let state = seed || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 칸 하나의 별들. 같은 칸이면 언제나 같은 결과다.
 *
 * density 는 칸마다 별을 몇 배로 낼지다. 1 이 기본이고, 올리면 앞의 별들은 그대로 두고
 * 뒤에 더 붙는다. 시드 하나에서 순서대로 뽑기 때문이다. 그래서 밀도를 올려도
 * 원래 있던 별은 자리를 지킨다.
 */
export function starsInCell(depth, cellX, cellY, density = 1) {
  const seed = hash(depth, cellX, cellY);
  const next = random(seed);
  const size = 1 / 2 ** depth;
  const radius = RADIUS_AT(depth);
  const stars = [];
  const count = Math.round(STARS_AT(depth) * density);

  for (let index = 0; index < count; index += 1) {
    const tone = TONES[Math.floor(next() * TONES.length)];
    stars.push({
      id: `${depth}:${cellX}:${cellY}:${index}`,
      depth,
      x: (cellX + next()) * size,
      y: (cellY + next()) * size,
      radius: radius * (0.55 + next() * 0.9),
      tone,
      seed: hash(depth, cellX * 31 + index, cellY * 17 + index),
    });
  }
  return stars;
}

/**
 * 보이는 범위 안의 별을 깊이 0 부터 maxDepth 까지 모아 준다.
 *
 * 칸 결과는 cache 에 담아 둔다. 카메라가 조금 움직였다고 같은 칸을 다시 만들 이유가 없다.
 */
export function starsInView(bounds, maxDepth, cache, density = 1) {
  const found = [];

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const size = 1 / 2 ** depth;
    const fromX = Math.max(0, Math.floor(bounds.left / size));
    const toX = Math.min(2 ** depth - 1, Math.floor(bounds.right / size));
    const fromY = Math.max(0, Math.floor(bounds.top / size));
    const toY = Math.min(2 ** depth - 1, Math.floor(bounds.bottom / size));

    for (let cellY = fromY; cellY <= toY; cellY += 1) {
      for (let cellX = fromX; cellX <= toX; cellX += 1) {
        const key = `${depth}:${cellX}:${cellY}:${density}`;
        let cell = cache?.get(key);
        if (!cell) {
          cell = starsInCell(depth, cellX, cellY, density);
          cache?.set(key, cell);
        }
        for (const star of cell) {
          if (
            star.x >= bounds.left &&
            star.x <= bounds.right &&
            star.y >= bounds.top &&
            star.y <= bounds.bottom
          ) {
            found.push(star);
          }
        }
      }
    }
  }

  return found;
}

/** 별 하나의 지어낸 신상. 이것도 시드에서 나오므로 언제 물어도 같다. */
export function describeStar(star) {
  const next = random(star.seed);
  const name =
    SYLLABLES[Math.floor(next() * SYLLABLES.length)] +
    SYLLABLES[Math.floor(next() * SYLLABLES.length)] +
    SYLLABLES[Math.floor(next() * SYLLABLES.length)];

  return {
    name: `${name} ${(1000 + Math.floor(next() * 8999)).toString()}`,
    kind: `${star.tone.key}${Math.floor(next() * 9)}V`,
    color: star.tone.label,
    distance: `${(4 + next() * 9996).toFixed(1)} 광년`,
    mass: `태양의 ${(0.1 + next() * 24).toFixed(2)}배`,
    depth: star.depth,
  };
}
