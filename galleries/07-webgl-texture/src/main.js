// 07. WebGL 텍스처 — HTML 을 GPU 텍스처로 올린다.
//
// 2D 컨텍스트의 drawElementImage() 에 해당하는 것이 WebGL 에서는
// gl.texElementImage2D() 다. 규칙은 같다. 대상은 이 캔버스의 직계 자식이어야 하고,
// 텍스처를 새로 올리는 일은 paint 이벤트 안에서 한다.

import { ensureSupport, guardPaint } from '../../_shared/support.js';

const VERTEX_SHADER = `#version 300 es
in vec2 position;
out vec2 uv;
void main() {
  // 화면을 덮는 삼각형 하나. 사각형 두 개보다 간단하다.
  // 텍스처는 위아래가 뒤집혀 올라오므로 y 를 여기서 뒤집는다.
  uv = vec2(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 uv;
out vec4 color;

uniform sampler2D source;
uniform vec2 pointer;
uniform float time;
uniform float bulge;
uniform float wave;
uniform float aberration;

/** 마우스 주변을 볼록하게 밀어내고, 세로로 물결을 준다. */
vec2 warp(vec2 point) {
  vec2 offset = point - pointer;
  float distance = length(offset);
  float push = 1.0 - bulge * exp(-distance * distance * 16.0);
  vec2 warped = pointer + offset * push;
  warped.x += wave * 0.02 * sin(warped.y * 22.0 + time * 2.2);
  return warped;
}

void main() {
  vec2 point = warp(uv);

  // 색수차: R 과 B 를 좌우로 조금씩 어긋나게 뽑는다.
  float shift = aberration * 0.008;
  float r = texture(source, point + vec2(shift, 0.0)).r;
  vec4 base = texture(source, point);
  float b = texture(source, point - vec2(shift, 0.0)).b;

  color = vec4(r, base.g, b, base.a);
}`;

const canvas = document.querySelector('#gl');
const card = document.querySelector('#card');
const cardTitle = document.querySelector('#card-title');
const cardBody = document.querySelector('#card-body');
const status = document.querySelector('#status');

const sliders = {
  bulge: document.querySelector('#bulge'),
  wave: document.querySelector('#wave'),
  aberration: document.querySelector('#aberration'),
};
const animateToggle = document.querySelector('#animate');

const SAMPLES = [
  {
    title: '이 카드는 텍스처다',
    body: '글자와 그라디언트와 둥근 모서리를 CSS 가 만들고, GPU 가 그것을 잡아 늘린다.',
  },
  {
    title: '텍스트는 살아 있다',
    body: '내용을 바꾸면 paint 가 오고, 그때 텍스처를 다시 올린다. 셰이더 코드는 그대로다.',
  },
  {
    title: 'مرحبا 안녕 Hello',
    body: '레이아웃 엔진이 만든 결과를 그대로 GPU 에 넘기므로 다국어 텍스트도 그대로 따라온다.',
  },
];

let sampleIndex = 0;
let pointer = [0.5, 0.5];
const startedAt = performance.now();

if (ensureSupport({ webgl: true })) {
  start();
}

function start() {
  const gl = canvas.getContext('webgl2');
  const program = buildProgram(gl);
  const uniforms = {
    pointer: gl.getUniformLocation(program, 'pointer'),
    time: gl.getUniformLocation(program, 'time'),
    bulge: gl.getUniformLocation(program, 'bulge'),
    wave: gl.getUniformLocation(program, 'wave'),
    aberration: gl.getUniformLocation(program, 'aberration'),
  };

  setupGeometry(gl, program);
  const texture = setupTexture(gl);

  canvas.layoutSubtree = true;
  // 텍스처 업로드는 반드시 paint 안에서 한다. 밖에서 부르면
  // InvalidStateError: No cached paint record for element 가 난다.
  canvas.addEventListener(
    'paint',
    guardPaint(() => uploadTexture(gl, texture)),
  );
  canvas.requestPaint();

  canvas.addEventListener('pointermove', (event) => {
    const box = canvas.getBoundingClientRect();
    pointer = [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height];
    status.textContent = `포인터 (${pointer[0].toFixed(2)}, ${pointer[1].toFixed(2)})`;
  });

  for (const input of Object.values(sliders)) input.addEventListener('input', syncOutputs);
  document.querySelector('#zero').addEventListener('click', () => {
    for (const input of Object.values(sliders)) input.value = '0';
    syncOutputs();
  });
  document.querySelector('#swap').addEventListener('click', swapSample);

  syncOutputs();
  // 그리기는 매 프레임, 텍스처 업로드는 paint 가 올 때만. 둘을 분리한다.
  requestAnimationFrame(function frame() {
    render(gl, uniforms);
    requestAnimationFrame(frame);
  });
}

function render(gl, uniforms) {
  const elapsed = animateToggle.checked ? (performance.now() - startedAt) / 1000 : 0;
  gl.uniform2f(uniforms.pointer, pointer[0], pointer[1]);
  gl.uniform1f(uniforms.time, elapsed);
  gl.uniform1f(uniforms.bulge, Number(sliders.bulge.value) / 100);
  gl.uniform1f(uniforms.wave, Number(sliders.wave.value) / 100);
  gl.uniform1f(uniforms.aberration, Number(sliders.aberration.value) / 100);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/**
 * 이 예제의 핵심 한 줄.
 * internalformat 으로 gl.RGBA 를 넘기면 거부된다. 크기가 정해진 형식만 받는다.
 */
function uploadTexture(gl, texture) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texElementImage2D(gl.TEXTURE_2D, gl.RGBA8, card, {
    width: canvas.width,
    height: canvas.height,
  });
}

function setupTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function setupGeometry(gl, program) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const location = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
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

function swapSample() {
  sampleIndex = (sampleIndex + 1) % SAMPLES.length;
  cardTitle.textContent = SAMPLES[sampleIndex].title;
  cardBody.textContent = SAMPLES[sampleIndex].body;
  // 여기서 텍스처를 올리려 하면 실패한다. 내용이 바뀌었으니 paint 가 올 것이고,
  // 업로드는 그 안에서 일어난다.
}

function syncOutputs() {
  for (const [name, input] of Object.entries(sliders)) {
    document.querySelector(`output[for="${name}"]`).textContent = input.value;
  }
}
