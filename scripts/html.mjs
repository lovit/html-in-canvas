// HTML 로 내보내는 문자열에 쓰는 최소 이스케이프.
// serve.mjs 의 디렉터리 목록과 build-site.mjs 의 원문 폴백이 함께 쓴다.

const REPLACEMENTS = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => REPLACEMENTS[character]);
}
