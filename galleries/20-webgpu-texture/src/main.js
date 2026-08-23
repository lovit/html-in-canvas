// 20. WebGPU 로 요소 텍스처 올리기.
//
// 07 에서 WebGL2 의 texElementImage2D() 로 카드를 텍스처에 올렸다.
// 명세에는 WebGPU 쪽 진입점도 있다. 하는 일은 같고 부르는 방법만 다르다.
//
//   device.queue.copyElementImageToTexture({ source }, { destination: { texture } }, size)
//
// 이 예제의 절반은 WebGPU 자체다. WGSL 셰이더, 렌더 파이프라인, 샘플러, 바인드 그룹을
// 라이브러리 없이 직접 만든다. 07 과 나란히 놓고 보면 어디가 같고 어디가 다른지 보인다.

import { ensureSupport, guardPaint, showUnsupportedBanner } from '../../_shared/support.js';

/** 카드의 CSS 크기. 요소는 이 크기 그대로 올라간다 (디바이스 픽셀이 아니다). */
const CARD_W = 380;
const CARD_H = 240;

/**
 * 텍스처는 조금 넉넉하게 잡는다.
 *
 * 실제로 올라가는 크기가 CSS 크기와 딱 맞지 않을 때가 있다. 이 카드는 380×240 인데
 * 둥근 모서리 때문에 382×242 가 올라온다. 텍스처가 그보다 작으면 복사가 통째로 실패한다.
 * 셰이더에서는 앞쪽 CARD_W×CARD_H 만 읽으므로 남는 자리는 보이지 않는다.
 */
const TEXTURE_W = CARD_W + 4;
const TEXTURE_H = CARD_H + 4;

const HEADLINES = ['이 카드가 GPU 텍스처다', '같은 그림, 다른 경로', 'WGSL 이 이 픽셀을 만졌다'];

const stage = document.querySelector('#stage');
const card = document.querySelector('#card');
const swatch = document.querySelector('#swatch');
const headline = document.querySelector('#headline');
const inputs = {
  wave: document.querySelector('#wave'),
  period: document.querySelector('#period'),
  vignette: document.querySelector('#vignette'),
  hue: document.querySelector('#hue'),
};
const metrics = {
  adapter: document.querySelector('#m-adapter'),
  format: document.querySelector('#m-format'),
  texture: document.querySelector('#m-texture'),
  uploads: document.querySelector('#m-uploads'),
  css: document.querySelector('#m-css'),
  gpu: document.querySelector('#m-gpu'),
};

const WGSL = `
struct Effect {
  wave: f32,
  period: f32,
  vignette: f32,
  time: f32,
};

@group(0) @binding(0) var textureSampler: sampler;
@group(0) @binding(1) var cardTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> effect: Effect;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

// 화면을 덮는 삼각형 하나. 정점 버퍼가 필요 없다.
@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOut {
  var points = array(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let point = points[index];

  var out: VertexOut;
  out.position = vec4f(point, 0.0, 1.0);
  out.uv = vec2f((point.x + 1.0) * 0.5, (1.0 - point.y) * 0.5);
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  // 카드가 캔버스 가운데에 놓이도록 좌표를 옮긴다.
  let cardSize = vec2f(380.0, 240.0);
  let canvasSize = vec2f(760.0, 480.0);
  let margin = (canvasSize - cardSize) * 0.5 / canvasSize;
  var uv = (in.uv - margin) / (cardSize / canvasSize);

  // 물결. 세로 위치에 따라 가로로 민다.
  uv.x = uv.x + sin(uv.y * effect.period * 6.2831 + effect.time) * effect.wave * 0.02;

  // 카드 밖인지 여기서 판정만 해 둔다.
  //
  // WGSL 은 textureSample 을 uniform control flow 에서만 부르게 한다.
  // if 안에서 일찍 return 하면 "must only be called from uniform control flow" 로 컴파일이
  // 막힌다. GLSL 과 다른 점이다. 그래서 항상 샘플하고, 고르는 일은 뒤에서 한다.
  let inside = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;

  // 텍스처는 카드보다 조금 크다. 카드에 해당하는 앞쪽만 읽는다.
  let used = vec2f(380.0 / 384.0, 240.0 / 244.0);
  var color = textureSample(cardTexture, textureSampler, clamp(uv, vec2f(0.0), vec2f(1.0)) * used).rgb;

  // 비네트. 가장자리를 어둡게 눌러 종이가 떠 보이게 한다.
  let center = distance(uv, vec2f(0.5, 0.5));
  color = color * (1.0 - effect.vignette * center * 0.9);

  let background = vec3f(0.043, 0.071, 0.125);
  return vec4f(select(background, color, inside), 1.0);
}`;

let uploads = 0;
let started = performance.now();

if (ensureSupport({ webgpu: true })) {
  start().catch((error) => {
    showUnsupportedBanner(`WebGPU 를 준비하지 못했습니다: ${error.message}`);
  });
}

async function start() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('사용할 수 있는 어댑터가 없습니다');
  const device = await adapter.requestDevice();

  // WebGPU 의 검증 오류는 예외로 오지 않는다. 이것을 달아 두지 않으면
  // 잘못 부른 것이 조용히 빈 텍스처가 되어 원인을 찾기 어렵다.
  device.addEventListener('uncapturederror', (event) => {
    metrics.gpu.textContent = `GPU 검증 오류: ${event.error.message.split('\n')[0]}`;
  });

  const context = stage.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const gpu = buildPipeline(device, format);
  reportEnvironment(adapter, format, gpu.texture);

  stage.layoutSubtree = true;
  stage.addEventListener(
    'paint',
    guardPaint(() => {
      // 07 의 texElementImage2D 와 같은 자리다. paint 밖에서는 부를 수 없다.
      device.queue.copyElementImageToTexture(
        { source: card },
        { destination: { texture: gpu.texture } },
        [CARD_W, CARD_H],
      );
      uploads += 1;
      metrics.uploads.textContent = String(uploads);
    }),
  );
  stage.requestPaint();

  wireControls(device, gpu);

  requestAnimationFrame(function frame() {
    render(device, context, gpu);
    requestAnimationFrame(frame);
  });
}

/** 파이프라인, 텍스처, 샘플러, 바인드 그룹. WebGPU 에서 준비해야 하는 것들이다. */
function buildPipeline(device, format) {
  const module = device.createShaderModule({ code: WGSL });

  const texture = device.createTexture({
    size: [TEXTURE_W, TEXTURE_H],
    format: 'rgba8unorm',
    // 네 가지가 모두 필요하다.
    //   TEXTURE_BINDING  셰이더에서 읽기
    //   COPY_DST         요소를 받기
    //   COPY_SRC         나중에 색을 되읽기
    //   RENDER_ATTACHMENT 복사 대상이 되기 위한 조건. 빠뜨리면 조용히 빈 텍스처가 된다
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const uniform = device.createBuffer({
    size: 16, // f32 네 개
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vertexMain' },
    fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: { buffer: uniform } },
    ],
  });

  return { pipeline, texture, sampler, uniform, bindGroup };
}

function render(device, context, gpu) {
  const values = new Float32Array([
    Number(inputs.wave.value) / 100,
    Number(inputs.period.value),
    Number(inputs.vignette.value) / 100,
    (performance.now() - started) / 900,
  ]);
  device.queue.writeBuffer(gpu.uniform, 0, values);

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.043, g: 0.071, b: 0.125, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  pass.setPipeline(gpu.pipeline);
  pass.setBindGroup(0, gpu.bindGroup);
  pass.draw(3);
  pass.end();

  device.queue.submit([encoder.finish()]);
}

/* 조작 --------------------------------------------------------------------- */

function wireControls(device, gpu) {
  for (const input of Object.values(inputs)) {
    input.addEventListener('input', showOutputs);
  }

  // 색상은 소스 쪽을 바꾼다. CSS 가 바뀌면 paint 가 오고, 그 안에서 다시 올라간다.
  inputs.hue.addEventListener('input', () => {
    card.style.filter = `hue-rotate(${inputs.hue.value}deg)`;
  });

  let headlineIndex = 0;
  document.querySelector('#swap').addEventListener('click', () => {
    headlineIndex = (headlineIndex + 1) % HEADLINES.length;
    headline.textContent = HEADLINES[headlineIndex];
  });

  document.querySelector('#sample').addEventListener('click', () => {
    sampleTexture(device, gpu).catch((error) => {
      metrics.gpu.textContent = `읽지 못함: ${error.message}`;
    });
  });

  showOutputs();
  metrics.css.textContent = getComputedStyle(swatch).backgroundColor;
}

/**
 * 텍스처에서 색을 직접 읽어 CSS 값과 맞는지 본다.
 *
 * 텍스처를 버퍼로 복사한 뒤 CPU 로 매핑한다. bytesPerRow 는 256 의 배수여야 하므로
 * 64픽셀 너비만 떠 온다. 견본 한 조각을 확인하는 데는 그것으로 충분하다.
 */
async function sampleTexture(device, gpu) {
  const cardBox = card.getBoundingClientRect();
  const swatchBox = swatch.getBoundingClientRect();
  // 요소는 CSS 크기 그대로 올라간다. 좌표를 두 배로 키우면 안 된다.
  const x = Math.round(swatchBox.left - cardBox.left + 10);
  const y = Math.round(swatchBox.top - cardBox.top + 8);

  const buffer = device.createBuffer({
    size: 256 * 32,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer(
    { texture: gpu.texture, origin: { x, y } },
    { buffer, bytesPerRow: 256, rowsPerImage: 32 },
    [64, 32],
  );
  device.queue.submit([encoder.finish()]);

  await buffer.mapAsync(GPUMapMode.READ);
  const pixels = new Uint8Array(buffer.getMappedRange());
  const color = `rgb(${pixels[0]}, ${pixels[1]}, ${pixels[2]})`;
  buffer.unmap();
  buffer.destroy();

  const expected = getComputedStyle(swatch).backgroundColor;
  metrics.css.textContent = expected;

  // hue-rotate 가 걸려 있으면 다른 것이 정상이다. 계산된 스타일에는 필터가 반영되지 않고,
  // 텍스처에는 필터까지 적용된 그림이 올라간다.
  const filtered = card.style.filter && card.style.filter !== 'none' && inputs.hue.value !== '0';
  const verdict = filtered
    ? '(색상 필터가 걸려 있어 달라야 맞다)'
    : color === expected
      ? '(일치)'
      : '(다름)';
  metrics.gpu.textContent = `${color} ${verdict}`;
}

function reportEnvironment(adapter, format, texture) {
  const info = adapter.info ?? {};
  const parts = [info.vendor, info.architecture].filter(Boolean);
  metrics.adapter.textContent = parts.length > 0 ? parts.join(' / ') : '정보를 주지 않음';
  metrics.format.textContent = format;
  metrics.texture.textContent = `${texture.width}×${texture.height} (rgba8unorm)`;
}

function showOutputs() {
  document.querySelector('output[for="wave"]').textContent = `${inputs.wave.value}%`;
  document.querySelector('output[for="period"]').textContent = `${inputs.period.value}회`;
  document.querySelector('output[for="vignette"]').textContent = `${inputs.vignette.value}%`;
  document.querySelector('output[for="hue"]').textContent = `${inputs.hue.value}°`;
}
