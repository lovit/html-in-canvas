// 07 과 11 이 함께 쓰는 WebGL2 뒷정리용 코드.
//
// 셰이더를 컴파일하고 링크하는 일은 어느 예제에서나 똑같다.
// 여기로 모아 두면 각 예제의 main.js 에는 "이 예제에서 새로운 것" 만 남는다.
// 셰이더 소스와 texElementImage2D 호출은 예제마다 다르므로 그대로 둔다.

/** 셰이더 하나를 컴파일한다. 실패하면 컴파일러가 준 메시지를 그대로 올린다. */
function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`셰이더 컴파일 실패: ${log}`);
  }
  return shader;
}

/**
 * 정점·프래그먼트 셰이더로 프로그램을 만들고 바로 쓸 수 있게 바인딩한다.
 * 링크가 끝나면 셰이더 객체는 프로그램이 들고 있으므로 놓아준다.
 */
export function buildProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`셰이더 링크 실패: ${gl.getProgramInfoLog(program)}`);
  }

  for (const shader of [vertex, fragment]) {
    gl.detachShader(program, shader);
    gl.deleteShader(shader);
  }

  gl.useProgram(program);
  return program;
}

/** 엘리먼트를 올릴 텍스처. 밉맵 없이 선형 보간, 가장자리는 늘려 잡는다. */
export function createElementTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}
