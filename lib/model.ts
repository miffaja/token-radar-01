// Token Radar's value model (radar-2): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds every
// rankable pre-token protocol below the watchlist floor, by TVL. A protocol is pre-token when its
// record carries no token (no market cap, no CoinGecko id, no symbol); the live-token protocols are
// kept apart in their own ranked table, shown with the market's own capitalisation, never mixed into
// the pre-token ranking.
//
// Implied value follows only from the snapshot's own figures, one function for every protocol:
//
//   base      = (tvl_usd / 1e6) ^ 0.6 x $1,000,000
//               TVL to the 0.6 power: a $2.7B protocol is worth ~11x a $50M one, not 55x.
//               Scale is set so the top implied value lands near $130M, a plausible launch value.
//   growth    = dampened: sign(g) x sqrt(|g|) x 0.5, where g is clamp(change_7d, -50, +50) / 100
//               A week's move is real but noisy, and a single extreme week should not dominate the
//               ranking. The square-root transform compresses the extremes relative to the middle:
//               a +50% week lifts ~35% instead of 50%, a -50% week cuts ~35% instead of 50%, while
//               an ordinary +8% week still lifts ~14%. No growth reported means 0%.
//   momentum  = 1 + 0.05 x min(change_7d, 20) / 20, only where the protocol is BOTH large
//               (TVL at or above the watchlist floor) AND growing (change_7d > 0). Sustained growth
//               at scale is worth more than a spike on a tiny base: a large protocol growing 20% or
//               more in the week earns the full 1.05x, a large one growing 10% earns 1.025x, and a
//               small or shrinking protocol earns nothing extra.
//   age       = 0.75 + 0.25 x log(1 + age_days / 30) / log(1 + 1095 / 30)
//               How long the protocol has run with no token, with diminishing returns: a year of
//               waiting is worth most of the premium, three years the rest. Unknown age takes 0.85.
//   category  = 1.10 where a token most plausibly captures the protocol's economics
//               (perpetuals, derivatives, lending, CDP, collateral markets, risk curators,
//               restaking), 0.90 where a token is least likely to be the point (bridges, payments,
//               liquid staking), 1.00 everywhere else. A small, stated tilt, never a verdict.
//   chains    = 1 + 0.02 x min(chains, 5)
//               Breadth of deployment, capped: one chain 1.02, five or more 1.10.
//   implied   = max(1, round(base x growth x momentum x age x category x chains))
//
// No protocol name is ever special-cased: the same function scores every row, and the dashboard
// recomputes each row from the snapshot figures so the page and board.json visibly agree.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  tvl_exponent: number;
  tvl_scale_usd: number;
  growth_damp: number;
  growth_floor: number;
  growth_cap: number;
  momentum_bonus: number;
  momentum_cap_pct: number;
  age_floor: number;
  age_range: number;
  age_scale_days: number;
  age_cap_days: number;
  unknown_age_multiplier: number;
  category_high: number;
  category_low: number;
  chain_step: number;
  chain_cap: number;
}

export const MODEL: ModelConstants = {
  tvl_exponent: 0.6,
  tvl_scale_usd: 1_000_000,
  growth_damp: 0.5,
  growth_floor: -50,
  growth_cap: 50,
  momentum_bonus: 0.05,
  momentum_cap_pct: 20,
  age_floor: 0.75,
  age_range: 0.25,
  age_scale_days: 30,
  age_cap_days: 1095,
  unknown_age_multiplier: 0.85,
  category_high: 1.1,
  category_low: 0.9,
  chain_step: 0.02,
  chain_cap: 5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2.1';

/** How many live-token protocols the Live token table carries, by market cap. */
export const LIVE_ROWS = 32;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    tvl_base_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    momentum_multiplier: number;
    age_multiplier: number;
    category_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  tvl_base_usd: number;
  growth_multiplier: number;
  momentum_multiplier: number;
  age_multiplier: number;
  category_multiplier: number;
  chain_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The category tilt: 1.10 where a token most plausibly captures the economics, 0.90 where it least does. */
export function categoryMultiplier(category: string | null, model: ModelConstants): number {
  const c = (category ?? '').toLowerCase();
  if (
    c.includes('perpetual') ||
    c.includes('derivative') ||
    c.includes('lend') ||
    c.includes('cdp') ||
    c.includes('collateral') ||
    c.includes('risk curator') ||
    c.includes('restak')
  ) {
    return model.category_high;
  }
  if (c.includes('bridge') || c.includes('payment') || c.includes('liquid staking')) {
    return model.category_low;
  }
  return 1;
}

/** The age multiplier: diminishing returns on waiting with no token. */
export function ageMultiplier(age: number | null, model: ModelConstants): number {
  if (age === null) return model.unknown_age_multiplier;
  const capped = Math.min(Math.max(age, 0), model.age_cap_days);
  const ratio = Math.log(1 + capped / model.age_scale_days) / Math.log(1 + model.age_cap_days / model.age_scale_days);
  return model.age_floor + model.age_range * ratio;
}

/** The dampened growth multiplier: a square-root transform on the clamped week's move, so one
 * extreme week cannot dominate the ranking. The transform compresses the extremes relative to
 * the middle: a +50% week lifts ~35% instead of 50%, a -50% week cuts ~35% instead of 50%,
 * while an ordinary +8% week still lifts ~14%. `growthPct` is the clamped change in per cent. */
export function dampenedGrowth(growthPct: number, model: ModelConstants): number {
  const g = growthPct / 100;
  return 1 + Math.sign(g) * Math.sqrt(Math.abs(g)) * model.growth_damp;
}

/** The momentum-times-scale multiplier: only a protocol that is BOTH large (TVL at or above the
 * watchlist floor) AND growing (a positive week's move) earns it. Sustained growth at scale is
 * worth more than a spike on a tiny base: growing by the cap or more earns the full bonus, growing
 * half that earns half of it, and a small or shrinking protocol earns nothing extra. */
export function momentumMultiplier(
  protocol: SnapshotProtocol,
  floorUsd: number,
  model: ModelConstants,
): number {
  const change = finite(protocol.change_7d, 0);
  if (protocol.tvl_usd < floorUsd || change <= 0) return 1;
  return 1 + model.momentum_bonus * (Math.min(change, model.momentum_cap_pct) / model.momentum_cap_pct);
}

/** The six factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  floorUsd: number,
): {
  implied: number;
  base: number;
  growthPct: number;
  growthMult: number;
  momentumMult: number;
  ageMult: number;
  catMult: number;
  chainMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const base = Math.pow(protocol.tvl_usd / 1_000_000, model.tvl_exponent) * model.tvl_scale_usd;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = dampenedGrowth(growthPct, model);
  const momentumMult = momentumMultiplier(protocol, floorUsd, model);
  const ageMult = ageMultiplier(age, model);
  const catMult = categoryMultiplier(protocol.category, model);
  const chainMult = 1 + model.chain_step * Math.min(protocol.chains.length, model.chain_cap);
  const implied = Math.max(1, Math.round(base * growthMult * momentumMult * ageMult * catMult * chainMult));
  return { implied, base, growthPct, growthMult, momentumMult, ageMult, catMult, chainMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor, by TVL. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, snapshot.floor_usd);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      tvl_base_usd: Math.round(s.base),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      momentum_multiplier: round4(s.momentumMult),
      age_multiplier: round4(s.ageMult),
      category_multiplier: s.catMult,
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** A second, smaller position, for a protocol whose main action is a single deposit. */
function secondCapitalFor(p: SnapshotProtocol): number {
  return Math.max(25, Math.round(capitalFor(p) / 2));
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name}'s main lending market on ${chain}, check the supply APY before you commit, and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name}, open one small hedged perp position, and check the funding rate before you size it.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} curator vault on ${chain}, read which strategies the curator runs and what fee it takes, and keep the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('payment')) return `Route $${capital} of payments through ${name} on ${chain} and keep the flow going.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second qualifying action, complementary to the first, so the plan is not one deposit and done. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $${capital} of a stable asset against the deposit on ${name} and loop it back into supply only if the borrow rate is below the supply APY, then repay half of it a week later.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap $${capital} through ${name}'s router on ${chain} and add the proceeds to a second pool.`;
  if (c.includes('bridge')) return `Bridge $${capital} back the other way through ${name} so the round trip is recorded.`;
  if (c.includes('staking') || c.includes('restak')) return `Delegate or restake $${capital} more through ${name} and keep the new receipt alongside the first.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Provide $${capital} of liquidity to ${name}'s perp market if it pays makers, then close the first trade and open a second one half the size on the opposite side.`;
  if (c.includes('prediction')) return `Settle the first market on ${name} and place a second position in a different market.`;
  if (c.includes('curator') || c.includes('allocator')) return `Move $${capital} into a second ${name} vault on ${chain} with a different strategy, and compare the two curators' allocations and fees.`;
  if (c.includes('stable')) return `Redeem $${capital} of the stable asset through ${name} and re-mint it a week later.`;
  if (c.includes('rwa')) return `Claim the yield accrued on the first mint and reinvest $${capital} of it through ${name}.`;
  if (c.includes('insurance')) return `File a test claim on the ${name} policy and renew the cover for another term.`;
  if (c.includes('payment')) return `Send a second $${capital} payment through ${name} to a different recipient on ${chain}.`;
  return `Vote or sign one governance action on ${name} if it offers one, then repeat the deposit with $${capital} more.`;
}

/** What to check on the protocol's own rewards page, by category. */
function verifyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Open ${name}'s rewards page and confirm the supply position, the borrow and the loop all show as active, and the borrow rate is still below the supply APY.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Open ${name}'s points page and confirm both pools show liquidity and the swaps are counted.`;
  if (c.includes('bridge')) return `Open ${name}'s activity page and confirm both bridge legs show as completed.`;
  if (c.includes('staking') || c.includes('restak')) return `Open ${name}'s staking page and confirm both receipts show the same wallet.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Open ${name}'s trading page and confirm the trade volume, the margin and the liquidity position all show.`;
  if (c.includes('prediction')) return `Open ${name}'s positions page and confirm both markets show as settled or open.`;
  if (c.includes('curator') || c.includes('allocator')) return `Open ${name}'s vault page and confirm both vault shares show in the wallet, and check each curator's current allocation and fee.`;
  if (c.includes('stable')) return `Open ${name}'s dashboard and confirm the mint and the re-mint both show.`;
  if (c.includes('rwa')) return `Open ${name}'s holdings page and confirm the yield accrued and the reinvestment both show.`;
  if (c.includes('insurance')) return `Open ${name}'s policy page and confirm the cover and the claim both show.`;
  if (c.includes('payment')) return `Open ${name}'s history and confirm both payments show as settled.`;
  return `Open ${name}'s rewards page and confirm the deposit and the governance action both show.`;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * Its shape follows the farm-quest pattern: the wallet step carries its own approval warning (approve
 * only what you deposit, never an unlimited spend), and a proof step records the transaction hash and
 * a screenshot in the farm log, so every step is checkable after the fact.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const second = secondCapitalFor(p);
  const hold = holdDaysFor(age);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: `${actionFor(p, capital, chain)} When the wallet asks, approve only the amount you are depositing, never an unlimited spend.`,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `After the position lands, open the protocol's page and confirm it shows with the amount you deposited, then save the transaction hash and a screenshot of the page in your farm log.`,
      cost: 'no fee to check',
      time: '5 minutes',
    },
    {
      text: secondActionFor(p, second, chain),
      cost: `$${second} of capital and about $3 of gas`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: verifyFor(p),
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Before you withdraw, claim only from the link the protocol itself publishes, never from a message or a search result, and write the wallet, the dates and every transaction in a farm log.`,
      cost: 'no fee to claim, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token table. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    tvl_base_usd: row.model.tvl_base_usd,
    growth_multiplier: row.model.growth_multiplier,
    momentum_multiplier: row.model.momentum_multiplier,
    age_multiplier: row.model.age_multiplier,
    category_multiplier: row.model.category_multiplier,
    chain_multiplier: row.model.chain_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
