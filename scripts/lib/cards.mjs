/**
 * 总览统计卡：左侧「指标 → 数值」列表 + 右侧等级环。
 *
 * 版式对齐社区常见的 profile stats 卡片，但完全自绘：
 * 不依赖任何第三方图床，Actions 跑一次即可把结果提交回仓库，永不裂图。
 */

import { el, rect, round, svgDoc, text } from './svg.mjs';

/**
 * 配色取自用户头像：冷调深蓝 + 冰蓝点缀 + 近白文字。
 *
 * 关键约束：卡片底色不能等于 GitHub 深色主题的页面底色 #0D1117，否则卡片在深色主题下
 * 会「糊」在页面里（对比度 1.00，只剩一圈淡边框）。因此底色取比页面底略亮的蓝调表面
 * #1E2A3D（对 #0D1117 对比度 1.31），边框 #41587F（对比度 2.64），两种主题下都能看出轮廓。
 * 卡片本身是深色，明暗主题下表现一致，故不按 prefers-color-scheme 切换。
 */
export const THEME = {
  bg: '#1E2A3D',
  border: '#41587F',
  title: '#8FB3E8',
  label: '#8E9CB5',
  value: '#E8EDF7',
  accent: '#7FA8DF',
};

export const CARD_SIZE = {
  stats: { width: 760, height: 222 },
};

const STYLE = `
  .bg { fill: #1E2A3D; }
  .stroke { stroke: #41587F; }
  .title { fill: #8FB3E8; }
  .label { fill: #8E9CB5; }
  .value { fill: #E8EDF7; }
  text { font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', -apple-system, sans-serif; }
`;

/* ---------------------------------------------------------------- 等级环 */

/**
 * 加权归一化的经验评分（0~100，越低越好），仅用于右侧等级环。
 *
 * 重要说明：GitHub 官方**不提供**任何「等级/排名」指标，社区卡片上的等级环都是启发式
 * 公式算出来的。这里同样是自定口径，不是官方排名，也不代表真实百分位：
 * 每个维度按 1 - 2^(-x/median) 把「活跃度」归一到 0~1，再按权重加权平均，
 * 分值越低表示各项越接近饱和、等级越高。medians 为主观经验值，可按需要调整。
 */
const RANK_PARTS = [
  { of: 'commits', median: 250, weight: 2 },
  { of: 'pullRequests', median: 50, weight: 3 },
  { of: 'issues', median: 25, weight: 1 },
  { of: 'reviews', median: 2, weight: 1 },
  { of: 'stars', median: 50, weight: 4 },
  { of: 'followers', median: 10, weight: 1 },
];

export function rankScore(input) {
  let weighted = 0;
  let total = 0;
  for (const { of, median, weight } of RANK_PARTS) {
    const value = Math.max(0, Number(input[of]) || 0);
    weighted += weight * (1 - Math.pow(2, -value / median));
    total += weight;
  }
  return round(100 * (1 - weighted / total));
}

/** 分数 → 等级字母。 */
export function rankGrade(score) {
  const bands = [
    [12.5, 'S'], [25, 'A+'], [37.5, 'A'], [50, 'A-'],
    [62.5, 'B+'], [75, 'B'], [87.5, 'B-'], [100, 'C+'],
  ];
  return (bands.find(([max]) => score <= max) ?? [, 'C'])[1];
}

/** 等级环：底环 + 进度弧（用 dash 偏移画弧，避免手写 path 的弧度计算）。 */
function rankRing(cx, cy, r, score) {
  const circumference = 2 * Math.PI * r;
  const progress = Math.min(1, Math.max(0, 1 - score / 100));
  const stroke = 10;
  return [
    el('circle', { cx, cy, r, fill: 'none', stroke: THEME.border, 'stroke-width': stroke }),
    el('g', { transform: `rotate(-90 ${cx} ${cy})` }, [
      el('circle', {
        cx, cy, r,
        fill: 'none',
        stroke: THEME.accent,
        'stroke-width': stroke,
        'stroke-linecap': 'round',
        'stroke-dasharray': round(circumference),
        'stroke-dashoffset': round(circumference * (1 - progress)),
      }),
    ]),
  ].join('');
}

/* -------------------------------------------------------------- 统计卡片 */

/**
 * @param {object} data fetchProfile() 的返回值
 */
export function renderStatsCard(data) {
  const { width, height } = CARD_SIZE.stats;
  const c = data.contributions;
  const score = rankScore({
    commits: c.commits,
    pullRequests: c.pullRequests,
    issues: c.issues,
    reviews: c.reviews,
    stars: data.totalStars,
    followers: data.followers,
  });

  // 左列表右环：列表值统一右对齐到 valueX，环单独占右侧。
  // 注意 "Contributed to" 的口径是「近期」而非「近一年」：GraphQL 的
  // repositoriesContributedTo 连接没有时间窗口参数（见 github.mjs 注释），
  // 标成 (last year) 会与事实不符，故只标 (recent)。
  const rows = [
    ['Total Stars Earned', data.totalStars],
    ['Total Commits (last year)', c.commits],
    ['Total PRs', c.pullRequests],
    ['Total Issues', c.issues],
    ['Contributed to (recent)', c.contributedTo],
  ];
  const labelX = 28;
  const valueX = 420;
  const firstRowY = 88;
  const stepY = 27;

  const body = [
    rect(0, 0, width, height, { rx: 20, fill: THEME.bg, stroke: THEME.border, strokeWidth: 1.5, cls: 'bg stroke' }),
    // 主标题：冷蓝竖条 + 账号名
    rect(28, 30, 4, 18, { rx: 2, fill: THEME.accent }),
    text(40, 45, data.login, { size: 19, weight: 700, cls: 'title' }),
  ];

  rows.forEach(([label, value], i) => {
    const y = firstRowY + i * stepY;
    body.push(text(labelX, y, label, { size: 12.5, weight: 600, cls: 'label' }));
    body.push(text(valueX, y, String(value ?? 0), { size: 12.5, weight: 700, anchor: 'end', cls: 'value' }));
  });

  const ringCx = 610;
  const ringCy = 118;
  const ringR = 48;
  body.push(rankRing(ringCx, ringCy, ringR, score));
  body.push(text(ringCx, ringCy + 11, rankGrade(score), { size: 30, weight: 800, anchor: 'middle', cls: 'value' }));

  return svgDoc({ width, height, title: `${data.login} 的 GitHub 统计`, style: STYLE, body: body.join('') });
}
