#!/usr/bin/env node
/**
 * 主页数据生成器（零依赖）。
 *
 * 流程：GitHub GraphQL → 渲染统计卡 SVG → 回填 README 的标记块。
 * 只改标记块之间的内容，标记块之外的文案可以随意手改，不会被覆盖。
 *
 * 本地用法：
 *   GITHUB_TOKEN=ghp_xxx node scripts/generate-readme.mjs
 * Actions 里用内置的 secrets.GITHUB_TOKEN 即可。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchProfile } from './lib/github.mjs';
import { CARD_SIZE, renderStatsCard } from './lib/cards.mjs';
import { esc } from './lib/svg.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS_DIR = path.join(ROOT, 'assets');
const README_PATH = path.join(ROOT, 'README.md');

const LOGIN = process.env.PROFILE_LOGIN || process.env.GITHUB_REPOSITORY_OWNER || 'kelai141';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

/** 标记块之间的内容由脚本接管；块外内容一律保留。 */
const STATS_START = '<!-- STATS:START -->';
const STATS_END = '<!-- STATS:END -->';

/** 用新内容替换标记块内部；标记缺失时抛错，避免静默生成半成品。 */
function replaceBlock(text, start, end, inner) {
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from === -1 || to === -1 || to < from) {
    throw new Error(`README.md 里找不到标记块 ${start} … ${end}`);
  }
  return `${text.slice(0, from + start.length)}\n${inner}\n${text.slice(to)}`;
}

/**
 * 用相对路径引用仓库内的 SVG，避免任何第三方图床。
 * 宽度取自 CARD_SIZE，保证与原图 1:1 不被缩放；alt 必须转义，
 * 否则含引号/尖括号的账号名会把 HTML 属性提前闭合（防御性处理）。
 */
function imgTag(file, width, alt) {
  return `<img src="./assets/${file}" alt="${esc(alt)}" width="${width}">`;
}

/**
 * 只放总览统计卡。
 * 贡献热力图不再自绘：GitHub 个人主页本身就带同一数据源的贡献图，
 * 重复渲染只会增加维护面。
 */
function buildStatsBlock() {
  return imgTag('stats.svg', CARD_SIZE.stats.width, `${LOGIN} 的 GitHub 统计`);
}

async function main() {
  if (!TOKEN) {
    throw new Error('缺少 GITHUB_TOKEN 环境变量（Actions 中由 secrets.GITHUB_TOKEN 提供）');
  }

  console.log(`抓取 ${LOGIN} 的 GitHub 数据…`);
  const data = await fetchProfile({ token: TOKEN, login: LOGIN, log: console.log });

  console.log(`仓库 ${data.reposPublic} 个 · ★${data.totalStars} · 近一年贡献 ${data.contributions.total} 次`);

  // 先渲染再写盘：渲染抛错时不会留下「图已更新、README 没更新」的半新工作树
  const statsSvg = renderStatsCard(data);

  let readme = fs.readFileSync(README_PATH, 'utf8');
  readme = replaceBlock(readme, STATS_START, STATS_END, buildStatsBlock(data));

  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.writeFileSync(path.join(ASSETS_DIR, 'stats.svg'), statsSvg, 'utf8');
  console.log('  写入 assets/stats.svg');

  fs.writeFileSync(README_PATH, readme, 'utf8');
  console.log('  更新 README.md');
  console.log('完成。');
}

main().catch((err) => {
  console.error(`生成失败：${err.message}`);
  process.exitCode = 1;
});
