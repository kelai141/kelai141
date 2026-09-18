/**
 * GitHub 数据采集（零依赖，只用 GraphQL）。
 *
 * 一次查询即可拿到统计卡所需的全部数据：账号信息、公开仓库列表、近一年贡献汇总。
 * Actions 里用内置的 GITHUB_TOKEN 即可，无需任何额外 secret。
 */

const API = 'https://api.github.com/graphql';

const QUERY = `
query ProfileData($login: String!, $after: String) {
  user(login: $login) {
    login
    followers { totalCount }
    repositories(
      privacy: PUBLIC
      ownerAffiliations: OWNER
      isFork: false
      first: 100
      after: $after
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        stargazerCount
        forkCount
        isArchived
      }
    }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
      }
    }
    # 用户「近期」贡献过的仓库数（含他人仓库）。
    # 注意：该连接没有 from/to 时间参数，官方口径是 "recently contributed to"，
    # 因此卡片上只能标 (recent)，不能标 (last year)。
    repositoriesContributedTo(
      first: 1
      includeUserRepositories: true
      contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]
    ) {
      totalCount
    }
  }
}`;

async function graphql(token, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'User-Agent': 'kelai141-profile-readme',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query: QUERY, variables }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}：${raw.slice(0, 300)}`);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`GraphQL 返回非 JSON：${raw.slice(0, 300)}`);
  }

  if (payload.errors?.length) {
    throw new Error(`GraphQL 报错：${payload.errors.map((e) => e.message).join('; ')}`);
  }
  return payload.data;
}

/** 只取统计需要的字段，避免把整棵仓库对象带进后续流程。 */
function shorten(repo) {
  return {
    name: repo.name,
    stars: repo.stargazerCount ?? 0,
    forks: repo.forkCount ?? 0,
    archived: Boolean(repo.isArchived),
  };
}

/**
 * 抓取并派生主页所需的全部数据。
 * @param {{token: string, login: string, maxPages?: number, log?: (msg: string) => void}} options
 */
export async function fetchProfile({ token, login, maxPages = 5, log = () => {} }) {
  if (!token) throw new Error('缺少 GITHUB_TOKEN（Actions 中请传 secrets.GITHUB_TOKEN）');

  let user = null;
  const repos = [];

  let after = null;
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await graphql(token, { login, after });
    const u = data?.user;
    if (!u) throw new Error(`查不到用户 ${login}（token 是否可访问该账号？）`);

    if (!user) user = u;

    const conn = u.repositories;
    repos.push(...(conn.nodes ?? []).filter(Boolean).map(shorten));
    log(`  仓库第 ${page} 页：本页 ${conn.nodes?.length ?? 0} 个，累计 ${repos.length}/${conn.totalCount}`);

    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }

  // 排除同名的主页仓库本身，它不该被算进自己的统计里
  const own = repos.filter((r) => r.name.toLowerCase() !== login.toLowerCase());
  const totalStars = own.reduce((sum, r) => sum + r.stars, 0);
  const totalForks = own.reduce((sum, r) => sum + r.forks, 0);

  const contributions = {
    total: user.contributionsCollection?.contributionCalendar?.totalContributions ?? 0,
    commits: user.contributionsCollection?.totalCommitContributions ?? 0,
    pullRequests: user.contributionsCollection?.totalPullRequestContributions ?? 0,
    issues: user.contributionsCollection?.totalIssueContributions ?? 0,
    reviews: user.contributionsCollection?.totalPullRequestReviewContributions ?? 0,
    // 该连接是分页的，totalCount 才是准确总数
    contributedTo: user.repositoriesContributedTo?.totalCount ?? 0,
  };

  return {
    login: user.login,
    followers: user.followers?.totalCount ?? 0,
    repos: own,
    reposPublic: repos.length,
    totalStars,
    totalForks,
    contributions,
    generatedAt: new Date().toISOString(),
  };
}
