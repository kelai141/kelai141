/**
 * 极简 SVG 拼装工具（零依赖）。
 *
 * 只做两件事：XML 转义 + 元素拼装。刻意不引入任何图形库，
 * 保证 GitHub Actions 里 `node` 直接可跑，也便于人工审阅生成的 SVG。
 */

/** XML 文本/属性转义。& 必须最先替换，否则会把后续生成的实体二次转义。 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 数字取 2 位小数，避免浮点噪声写进 SVG 文本。 */
export function round(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** 属性表 → 字符串；值为 null/undefined/false/'' 的属性会被丢弃。 */
function attrs(map) {
  return Object.entries(map)
    .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== '')
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
}

/** 自闭合元素，如 <rect/>。 */
export function el(name, attrMap = {}, children = null) {
  const a = attrs(attrMap);
  if (children === null) return `<${name}${a}/>`;
  const inner = Array.isArray(children) ? children.filter(Boolean).join('') : children;
  return `<${name}${a}>${inner}</${name}>`;
}

/** <text> 简写。y 为基线位置（不用 dominant-baseline，跨渲染器更稳）。 */
export function text(x, y, content, opts = {}) {
  const { size = 14, weight = null, anchor = null, cls = null, fill = null } = opts;
  return el('text', { x: round(x), y: round(y), 'font-size': size, 'font-weight': weight, 'text-anchor': anchor, class: cls, fill }, esc(content));
}

/** <rect> 简写。 */
export function rect(x, y, w, h, opts = {}) {
  const { rx = null, fill = null, stroke = null, strokeWidth = null, cls = null } = opts;
  return el('rect', { x: round(x), y: round(y), width: round(w), height: round(h), rx, fill, stroke, 'stroke-width': strokeWidth, class: cls });
}

/** 拼装完整 SVG 文档：声明 + 标题 + 可选样式 + 主体。 */
export function svgDoc({ width, height, title, style = '', body }) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}" viewBox="0 0 ${round(width)} ${round(height)}" role="img" aria-label="${esc(title)}">`,
    `<title>${esc(title)}</title>`,
    style ? `<style>${style}</style>` : '',
    body,
    '</svg>',
    '',
  ].join('\n');
}
