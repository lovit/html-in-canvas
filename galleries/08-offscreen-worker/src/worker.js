// 08. 워커 쪽. 메인 스레드에서 받은 ElementImage 를 OffscreenCanvas 에 합성한다.
//
// 이 파일은 DOM 을 모른다. 받은 것은 그림 조각이고, 그것을 어디에 어떻게 놓을지만 안다.

let ctx = null;
let width = 0;
let height = 0;
let sway = 0.45;
let frames = 0;

/** 카드 순번 → ElementImage. 새 스냅샷이 오면 옛것을 닫고 갈아 끼운다. */
const images = new Map();

// 아래쪽 44px 은 워커가 프레임 수를 적는 자리로 비워 둔다.
const SLOTS = [
  { x: 24, y: 18 },
  { x: 336, y: 18 },
  { x: 24, y: 190 },
  { x: 336, y: 190 },
];

// 워커에서 requestAnimationFrame 을 쓸 수 있으면 쓰고, 없으면 타이머로 대신한다.
const schedule =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (callback) => setTimeout(callback, 16);

self.addEventListener('message', (event) => {
  const message = event.data;

  if (message.type === 'canvas') {
    ctx = message.canvas.getContext('2d');
    width = message.canvas.width;
    height = message.canvas.height;
    schedule(render);
    self.postMessage({ type: 'ready' });
    return;
  }

  if (message.type === 'image') {
    // 같은 자리에 있던 옛 스냅샷은 닫아 준다. 안 닫으면 메모리가 쌓인다.
    images.get(message.index)?.close();
    images.set(message.index, message.image);
    return;
  }

  if (message.type === 'sway') {
    sway = message.value;
  }
});

function render(now) {
  schedule(render);
  if (!ctx) return;

  frames += 1;
  const seconds = now / 1000;

  ctx.reset();
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, width, height);

  for (const [index, image] of images) {
    const slot = SLOTS[index % SLOTS.length];
    const phase = seconds * 1.1 + index * 0.9;
    const angle = Math.sin(phase) * 0.06 * sway;
    const lift = Math.cos(phase) * 10 * sway;

    ctx.save();
    ctx.translate(slot.x + image.width / 2, slot.y + image.height / 2 + lift);
    ctx.rotate(angle);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    // ElementImage 도 엘리먼트와 똑같이 넘길 수 있다.
    ctx.drawElementImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
  }

  // 메인 스레드가 멈춰도 이 숫자는 계속 올라간다. 그것이 이 예제의 증거다.
  const label = `워커 프레임 ${frames}`;
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const textWidth = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.roundRect(width - textWidth - 34, height - 36, textWidth + 22, 26, 13);
  ctx.fill();

  ctx.fillStyle = 'rgba(248, 250, 252, 0.9)';
  ctx.fillText(label, width - 23, height - 23);
}
