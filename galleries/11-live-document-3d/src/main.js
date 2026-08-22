// 11. 살아 있는 문서를 3D 공간에.
//
// 07 에서는 카드 한 장을 텍스처로 올렸다. 여기서는 같은 출처 iframe 을 올린다.
// 안에서 도는 문서 전체가 GPU 텍스처가 되고, 정점 셰이더가 그 종이를 말아 넘긴다.
//
// 핵심은 두 가지다.
//   1. 교차 출처는 빠지지만 같은 출처 iframe 은 그대로 그려진다
//   2. iframe 안쪽이 바뀌면 바깥 캔버스의 paint 가 저절로 온다. 폴링이 필요 없다

import { ensureSupport, guardPaint } from '../../_shared/support.js';

const VERTEX_SHADER = `#version 300 es
in vec2 grid;
out vec2 uv;
out float shade;

uniform float progress;
uniform float sheetDepth;

const float PI = 3.14159265;
const float RADIUS = 0.17;

/**
 * 종이를 원기둥에 감는다.
 * 말리는 선(cx)을 오른쪽 밖에서 왼쪽 밖까지 옮기면 한 장이 넘어간다.
 */
void main() {
  uv = grid;

  float cx = mix(1.0 + RADIUS * PI, -RADIUS * PI, progress);
  float d = grid.x - cx;

  vec3 p = vec3(grid, 0.0);
  vec3 normal = vec3(0.0, 0.0, 1.0);

  if (d > 0.0) {
    float theta = d / RADIUS;
    if (theta <= PI) {
      // 원기둥에 감기는 구간
      p.x = cx + RADIUS * sin(theta);
      p.z = RADIUS - RADIUS * cos(theta);
      normal = vec3(-sin(theta), 0.0, cos(theta));
    } else {
      // 반 바퀴를 넘어 뒤로 평평하게 눕는 구간
      p.x = cx - (d - PI * RADIUS);
      p.z = 2.0 * RADIUS;
      normal = vec3(0.0, 0.0, -1.0);
    }
  }

  // 종이 두께만큼 뒤로 밀어 아래 장과 겹치지 않게 한다
  p.z += sheetDepth;

  vec3 light = normalize(vec3(-0.35, 0.45, 1.0));
  shade = 0.55 + 0.45 * clamp(dot(normal, light), 0.0, 1.0);

  // 약한 원근. 앞으로 나온 부분이 조금 커 보인다.
  float perspective = 1.0 / (1.0 - p.z * 0.34);
  vec2 screen = (p.xy - vec2(0.5)) * perspective + vec2(0.5);

  gl_Position = vec4(screen.x * 2.0 - 1.0, 1.0 - screen.y * 2.0, -p.z, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 uv;
in float shade;
out vec4 color;

uniform sampler2D page;
uniform float shadowStrength;
uniform float curlAt;

void main() {
  vec3 rgb;

  if (gl_FrontFacing) {
    rgb = texture(page, uv).rgb;
  } else {
    // 종이 뒷면. 잉크가 아주 옅게 비치고 접힌 쪽으로 갈수록 어둡다.
    vec3 paper = vec3(0.95, 0.94, 0.91);
    vec3 bleed = texture(page, vec2(1.0 - uv.x, uv.y)).rgb;
    rgb = mix(paper, bleed, 0.07);
  }

  // 들린 종이가 아래 장에 드리우는 그림자
  float shadow = 1.0;
  if (shadowStrength > 0.0) {
    float dist = uv.x - curlAt;
    shadow = dist > 0.0 ? mix(0.42, 1.0, clamp(dist / 0.2, 0.0, 1.0)) : 1.0;
  }

  color = vec4(rgb * shade * shadow, 1.0);
}`;

const GRID = 72;

const stage = document.querySelector('#stage');
const frontFrame = document.querySelector('#front');
const backFrame = document.querySelector('#back');
const progressInput = document.querySelector('#progress');
const pauseToggle = document.querySelector('#pause-back');
const metrics = {
  paints: document.querySelector('#m-paints'),
  uploads: document.querySelector('#m-uploads'),
  clock: document.querySelector('#m-clock'),
  changed: document.querySelector('#m-changed'),
};

let paintCount = 0;
let uploadCount = 0;
let progress = 0;
let animating = null;

if (ensureSupport({ webgl: true })) {
  start();
}

function start() {
  const gl = stage.getContext('webgl2');
  const program = buildProgram(gl);
  const uniforms = {
    progress: gl.getUniformLocation(program, 'progress'),
    sheetDepth: gl.getUniformLocation(program, 'sheetDepth'),
    shadowStrength: gl.getUniformLocation(program, 'shadowStrength'),
    curlAt: gl.getUniformLocation(program, 'curlAt'),
  };
  const indexCount = setupGrid(gl, program);

  const textures = new Map([
    [frontFrame, createTexture(gl)],
    [backFrame, createTexture(gl)],
  ]);

  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE); // 뒷면도 그려야 종이가 넘어가는 것이 보인다

  stage.layoutSubtree = true;
  stage.addEventListener(
    'paint',
    guardPaint((event) => {
      paintCount += 1;

      // 04 에서 배운 것. 바뀐 문서만 다시 올린다.
      const changed = Array.from(event.changedElements ?? []);
      const targets = changed.length > 0 ? changed : [frontFrame, backFrame];
      for (const frame of targets) {
        if (!textures.has(frame)) continue;
        uploadPage(gl, textures.get(frame), frame);
        uploadCount += 1;
      }

      metrics.paints.textContent = String(paintCount);
      metrics.uploads.textContent = String(uploadCount);
      metrics.changed.textContent =
        changed.length === 0 ? '(빈 배열)' : changed.map((el) => el.id).join(', ');
    }),
  );
  stage.requestPaint();

  wireControls();
  wirePauseToggle();
  readInnerClock();

  requestAnimationFrame(function frame() {
    render(gl, uniforms, indexCount, textures);
    requestAnimationFrame(frame);
  });
}

function render(gl, uniforms, indexCount, textures) {
  gl.viewport(0, 0, stage.width, stage.height);
  gl.clearColor(0.043, 0.071, 0.125, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 정점 셰이더와 같은 식으로 말리는 선의 위치를 구한다. 그림자를 그 자리에 놓는다.
  const RADIUS = 0.17;
  const curlAt = (1 + RADIUS * Math.PI) * (1 - progress) + -RADIUS * Math.PI * progress;
  gl.uniform1f(uniforms.curlAt, curlAt);

  // 아래 장을 먼저 평평하게 그리고, 접힌 자리에 그림자를 드리운다
  gl.bindTexture(gl.TEXTURE_2D, textures.get(backFrame));
  gl.uniform1f(uniforms.progress, 0);
  gl.uniform1f(uniforms.sheetDepth, 0);
  gl.uniform1f(uniforms.shadowStrength, 1);
  gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);

  // 그 위에 앞장을 말아서 그린다
  gl.bindTexture(gl.TEXTURE_2D, textures.get(frontFrame));
  gl.uniform1f(uniforms.progress, progress);
  gl.uniform1f(uniforms.sheetDepth, 0.004);
  gl.uniform1f(uniforms.shadowStrength, 0);
  gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
}

/** iframe 을 통째로 텍스처에 올린다. 07 의 카드와 부르는 방법이 같다. */
function uploadPage(gl, texture, frame) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texElementImage2D(gl.TEXTURE_2D, gl.RGBA8, frame, { width: 720, height: 960 });
}

function createTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

/** 종이를 격자로 잘게 나눈다. 정점이 촘촘해야 말리는 곡면이 매끄럽다. */
function setupGrid(gl, program) {
  const positions = [];
  for (let y = 0; y <= GRID; y += 1) {
    for (let x = 0; x <= GRID; x += 1) positions.push(x / GRID, y / GRID);
  }

  const indices = [];
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const a = y * (GRID + 1) + x;
      const b = a + 1;
      const c = a + GRID + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  const location = gl.getAttribLocation(program, 'grid');
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);

  return indices.length;
}

function buildProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`셰이더 링크 실패: ${gl.getProgramInfoLog(program)}`);
  }
  gl.useProgram(program);
  return program;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`셰이더 컴파일 실패: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function setProgress(value) {
  progress = Math.min(1, Math.max(0, value));
  progressInput.value = String(Math.round(progress * 100));
  document.querySelector('output[for="progress"]').textContent = progressInput.value;
}

function animateTo(target) {
  if (animating !== null) cancelAnimationFrame(animating);
  const from = progress;
  const started = performance.now();

  const step = () => {
    const t = Math.min(1, (performance.now() - started) / 700);
    const eased = 1 - (1 - t) ** 3;
    setProgress(from + (target - from) * eased);
    if (t < 1) animating = requestAnimationFrame(step);
    else animating = null;
  };
  animating = requestAnimationFrame(step);
}

function wireControls() {
  progressInput.addEventListener('input', () => setProgress(Number(progressInput.value) / 100));
  document.querySelector('#turn').addEventListener('click', () => animateTo(1));
  document.querySelector('#reset').addEventListener('click', () => animateTo(0));

  let dragging = false;
  stage.addEventListener('pointerdown', (event) => {
    dragging = true;
    stage.setPointerCapture(event.pointerId);
    dragFrom(event);
  });
  stage.addEventListener('pointermove', (event) => dragging && dragFrom(event));
  stage.addEventListener('pointerup', () => {
    dragging = false;
  });

  function dragFrom(event) {
    const box = stage.getBoundingClientRect();
    setProgress(1 - (event.clientX - box.left) / box.width);
  }

  setProgress(0);
}

/**
 * 뒷장 문서의 애니메이션을 멈춘다. 같은 출처라서 바깥에서 안쪽 DOM 을 만질 수 있다.
 * 멈추면 그 문서는 더 이상 바뀌지 않으므로 changedElements 에서 빠지고 업로드도 줄어든다.
 */
function wirePauseToggle() {
  pauseToggle.addEventListener('change', () => {
    const dot = backFrame.contentDocument?.querySelector('.dot');
    if (dot) dot.style.animationPlayState = pauseToggle.checked ? 'paused' : 'running';
  });
}

/** 안쪽 문서의 시계를 읽어 화면에 같이 보여 준다. 같은 출처라서 읽을 수 있다. */
function readInnerClock() {
  setInterval(() => {
    const clock = frontFrame.contentDocument?.getElementById('clock');
    metrics.clock.textContent = clock ? `${clock.textContent}초` : '—';
  }, 150);
}
