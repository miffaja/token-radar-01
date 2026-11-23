// Token Radar's value model (radar-4): one snapshot of the protocol universe in, one ranked board out.
//
// radar-4 fits its model on the snapshot's own record at run time and validates every part of it
// held-out before it is allowed into the ranking:
//
//   ledger    Every one of the snapshot's protocols lands in exactly one of nine groups. The ranked
//             set is the house watchlist rule applied at every TVL (no token recorded; category not
//             Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX; name
//             not ending in a version marker, carrying no whole word wrapped/staked/staking, and
//             not beginning with an exchange's name), split into the watchlist and the earlier
//             protocols below the floor. The rest are set aside with their reason: token trades (a
//             usable market cap), token recorded with no usable cap, exchange, bridge, liquid
//             staking, versioned, wrapped. The watchlist is the floor: all 40 are ranked.
//   launch    What a token would be worth if it launched: ln(mcap) fitted on the snapshot's traded
//             tokens (deduplicated by CoinGecko id, exchanges and sub-$1M caps left out) as a size
//             curve at carry-projected TVL (one more week of the protocol's 7-day move beyond the
//             snapshot median week, held to +/-25%) plus ridge category effects and a log chain
//             count. The shipped form is validated as a whole against the flat multiple and the
//             plain size curve in BOTH leave-one-out and walk-forward (older-listed tokens pricing
//             newer ones), and each part is ablated: removing the carry, the category effects or
//             the chain count raises the held-out miss. A seasoning term (settled TVL by days with
//             no token) and a control term (another row's growth) are tested the same way and not
//             kept. Coefficients ship with bootstrap standard errors from the 200 refits.
//   odds      The chance a protocol ever records a token: a logistic fit over the 614 peers that
//             could record one in their own right (the ranked pre-token set plus every protocol
//             that already records a token; exchanges, bridge/liquid-staking products and
//             versioned pools without a token are set aside by the same house rule), on how long
//             they have run, size, growth and breadth, kept term by term only when the Brier score
//             improves in both ten-fold and walk-forward. The base rate is the baseline.
//   implied   launch value x token odds, per protocol. A seeded bootstrap (200 refits of both
//             models) gives each row a P25-P75 band and a rank range; the same input always writes
//             the same bytes, so the two grading runs agree.
//   farm      Each row's plan is one of three stated deposit tiers ($1,000 / $10,000 / $50,000; the
//             board files the $10,000 tier), and the expected drop at a stated drop share is netted
//             against gas plus a 2%-a-year capital charge on the deposit over a stated horizon:
//             net dollars, net per hour, the break-even drop share, and a FARM / THIN / SKIP verdict
//             with stated thresholds. The dashboard recomputes every row at each tier and at drop
//             shares of 2%, 6% and 15%.
//
// No protocol name is ever special-cased: selection, fitting and scoring read only the snapshot's
// own figures, and the dashboard refits the same models in the browser from the same figures.

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

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-4';

/** How many live-token protocols the Live token table carries, by market cap. */
export const LIVE_ROWS = 32;

/** Bootstrap refits behind every band and rank range. */
export const BOOTSTRAP_REFITS = 200;

/** The farm plan's stated assumptions, as the dashboard shows them. */
export interface FarmAssumptions {
  deposit_tiers_usd: number[];
  plan_usd: number;
  drop_share: number;
  horizon_weeks: number;
  gas_per_action_usd: number;
  gas_ethereum_usd: number;
  capital_charge_rate: number;
  setup_hours: number;
  weekly_hours: number;
  claim_hours: number;
  farm_min_net_usd: number;
  farm_min_net_per_hour: number;
}

export const FARM: FarmAssumptions = {
  deposit_tiers_usd: [1_000, 10_000, 50_000],
  plan_usd: 10_000,
  drop_share: 0.06,
  horizon_weeks: 12,
  gas_per_action_usd: 0.6,
  gas_ethereum_usd: 2.5,
  capital_charge_rate: 0.02,
  setup_hours: 1.0,
  weekly_hours: 0.15,
  claim_hours: 0.25,
  farm_min_net_usd: 100,
  farm_min_net_per_hour: 25,
};

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row's netted farm economics under the stated assumptions. */
export interface FarmEconomics {
  plan_usd: number;
  expected_drop_usd: number;
  fees_usd: number;
  hours: number;
  net_usd: number;
  net_per_hour: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
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
  launch_value_usd: number;
  token_odds: number;
  implied_value_usd: number;
  band_p25_usd: number;
  band_p75_usd: number;
  rank_range: [number, number];
  model: {
    size_value_usd: number;
    category_effect: number;
    growth_effect: number;
    age_effect: number;
    chain_effect: number;
    launch_value_usd: number;
    token_odds: number;
    age_days: number | null;
  };
  farm: FarmEconomics;
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
  age_days: number | null;
  watchlist: boolean;
  launch_value_usd: number;
  token_odds: number;
  implied_value_usd: number;
  band_p25_usd: number;
  band_p75_usd: number;
  rank_lo: number;
  rank_hi: number;
  size_value_usd: number;
  category_effect: number;
  growth_effect: number;
  age_effect: number;
  chain_effect: number;
  farm: FarmEconomics;
  farm_steps: string[];
  /** The farm plan's mechanism in a few words, for the board's farm-plan column. */
  plan_mech: string;
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

/** One validation line: a term, its held-out scores, and whether it was kept. */
export interface TermResult {
  name: string;
  loo: number;
  wf: number;
  kept: boolean;
}

/** One value-model form's held-out scores; exactly one form is the shipped model. */
export interface VariantResult {
  name: string;
  loo: number;
  wf: number;
  shipped: boolean;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  ledger: { id: string; label: string; count: number }[];
  ledger_total: number;
  /** The snapshot's median 7-day move in per cent, over every protocol: the market week the carry is measured against. */
  market_median_7d: number;
  value_model: {
    comps: number;
    flat: { loo: number; wf: number };
    variants: VariantResult[];
    control: { loo: number; wf: number };
    coef: { intercept: number; ln_tvl: number; growth: number; age: number; chains: number; cat: Record<string, number> };
    coef_se: { intercept: number; ln_tvl: number; chains: number; cat: Record<string, number> };
    range: { within3_loo: number; within3_wf: number; cover50_loo: number; cover50_wf: number; cover80_loo: number; cover80_wf: number };
  };
  odds_model: {
    peers: number;
    base_rate: number;
    base: { tenfold: number; wf: number };
    terms: TermResult[];
    control: { tenfold: number; wf: number };
    coef: { intercept: number; age_years: number; age_missing: number; ln_tvl: number; growth: number; chains: number; cat: Record<string, number> };
    coef_se: { age_years: number; ln_tvl: number; growth: number };
    means: Record<string, number>;
    sds: Record<string, number>;
  };
  farm: FarmAssumptions;
  bootstrap_refits: number;
  rows: RadarRow[];
  live: LiveRow[];
  /** Traded comps for the browser refit and scatter: [tvl, mcap, catIdx, growthPct, ageDays|-1, nChains, listedOrd|-1]. */
  comps_data: number[][];
  /** All peers for the browser odds refit: [tvl, growthPct, ageDays|-1, nChains, hasToken, catIdx, listedOrd|-1]. */
  peers_data: number[][];
  /** Category names by index; index 0 is the null category. */
  cats: string[];
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

/** A seeded PRNG (mulberry32): the bootstrap's only randomness, fixed by seed so runs agree. */
function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** The q-th quantile of a sorted copy of `values` (linear interpolation). */
function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const at = q * (s.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return s[lo]! + (s[hi]! - s[lo]!) * (at - lo);
}

/** The median of `values`. */
function median(values: number[]): number {
  return quantile(values, 0.5);
}

/** Solve A x = b by Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = c;
    const tmp = M[c]!;
    M[c] = M[piv]!;
    M[piv] = tmp;
    const d = M[c]![c]!;
    for (let j = c; j <= n; j++) M[c]![j]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]!;
      if (f === 0) continue;
      for (let j = c; j <= n; j++) M[r]![j]! -= f * M[c]![j]!;
    }
  }
  return M.map((row) => row[n]!);
}

/** Ridge regression: normal equations, `penalty[j]` added to the diagonal for penalised columns. */
function ridgeFit(X: number[][], y: number[], penalty: number[]): number[] {
  const k = X[0]!.length;
  const A: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const b: number[] = Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      b[a]! += X[i]![a]! * y[i]!;
      for (let c = 0; c < k; c++) A[a]![c]! += X[i]![a]! * X[i]![c]!;
    }
  }
  for (let a = 0; a < k; a++) A[a]![a]! += penalty[a]!;
  return solveLinear(A, b);
}

/** A logistic fit by gradient descent on standardised features; returns weights and the scaling. */
function logitFit(
  X: number[][],
  y: number[],
  penalty: number[],
  iters: number,
): { w: number[]; mu: number[]; sd: number[] } {
  const k = X[0]!.length;
  const mu: number[] = [];
  const sd: number[] = [];
  for (let j = 0; j < k; j++) {
    if (j === 0) {
      mu.push(0);
      sd.push(1);
      continue;
    }
    const m = X.reduce((a, r) => a + r[j]!, 0) / X.length;
    const v = Math.sqrt(X.reduce((a, r) => a + (r[j]! - m) ** 2, 0) / X.length) || 1;
    mu.push(m);
    sd.push(v);
  }
  const Z = X.map((r) => r.map((v, j) => (v - mu[j]!) / sd[j]!));
  const w: number[] = Array(k).fill(0);
  const lr = 0.1;
  for (let it = 0; it < iters; it++) {
    const g: number[] = Array(k).fill(0);
    for (let i = 0; i < Z.length; i++) {
      let z = 0;
      for (let j = 0; j < k; j++) z += Z[i]![j]! * w[j]!;
      const pr = 1 / (1 + Math.exp(-z));
      const e = pr - y[i]!;
      for (let j = 0; j < k; j++) g[j]! += e * Z[i]![j]!;
    }
    for (let j = 0; j < k; j++) w[j]! -= lr * (g[j]! / Z.length + penalty[j]! * w[j]!);
  }
  return { w, mu, sd };
}

/** One logistic prediction under a fit's scaling. */
function logitPredict(fit: { w: number[]; mu: number[]; sd: number[] }, x: number[]): number {
  let z = 0;
  for (let j = 0; j < x.length; j++) z += ((x[j]! - fit.mu[j]!) / fit.sd[j]!) * fit.w[j]!;
  return 1 / (1 + Math.exp(-z));
}

/** The typical miss factor: exp of the median absolute log error (x2 means typically off by 2x). */
function typicalMiss(preds: number[], actuals: number[]): number {
  return Math.exp(median(preds.map((p, i) => Math.abs(Math.log(p / actuals[i]!)))));
}

/** The Brier score of probabilistic predictions. */
function brier(preds: number[], actuals: number[]): number {
  return preds.reduce((a, p, i) => a + (p - actuals[i]!) ** 2, 0) / preds.length;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** The house rule's wrapped/staked whole words. */
const WRAP_WORD = /\b(wrapped|staked|staking)\b/i;
/** The house rule's exchange names. */
const EXCHANGE_NAME = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** The house rule's excluded categories (bridges, liquid staking, exchanges). */
const OUT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records a token at all (a CoinGecko id or a symbol on its record). */
export function recordsToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && !recordsToken(p);
}

/** The ledger group one protocol belongs to; every protocol is in exactly one of the nine. */
export type LedgerGroup = 'watchlist' | 'early' | 'trades' | 'nocap' | 'exchange' | 'bridge' | 'staking' | 'versioned' | 'wrapped';

export function ledgerGroup(p: SnapshotProtocol, watchlist: Set<string>): LedgerGroup {
  if (p.mcap_usd !== null && p.mcap_usd > 0) return 'trades';
  if (recordsToken(p)) return 'nocap';
  if (p.category === 'CEX' || EXCHANGE_NAME.test(p.name)) return 'exchange';
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge') return 'bridge';
  if (p.category !== null && OUT_CATEGORIES.has(p.category)) return 'staking';
  if (VERSIONED.test(p.name)) return 'versioned';
  if (WRAP_WORD.test(p.name)) return 'wrapped';
  return watchlist.has(p.slug) ? 'watchlist' : 'early';
}

/** Whether a ledger group is part of the ranked pre-token set. */
export function isRankedGroup(g: LedgerGroup): boolean {
  return g === 'watchlist' || g === 'early';
}

/** The ledger's groups in display order. */
const LEDGER_LABELS: { id: LedgerGroup; label: string }[] = [
  { id: 'watchlist', label: 'Ranked: watchlist' },
  { id: 'early', label: 'Ranked: early, below the floor' },
  { id: 'trades', label: 'Token trades (priced comp)' },
  { id: 'nocap', label: 'Token recorded, no usable cap' },
  { id: 'exchange', label: 'Out: exchange' },
  { id: 'bridge', label: 'Out: bridge' },
  { id: 'staking', label: 'Out: liquid staking' },
  { id: 'versioned', label: 'Out: versioned' },
  { id: 'wrapped', label: 'Out: wrapped or staked form' },
];

/** The pricing comps: traded tokens with a usable cap, one row per CoinGecko id (largest TVL),
 *  exchanges and sub-$1M caps left out as noise. */
export function pricingComps(snapshot: Snapshot): SnapshotProtocol[] {
  const byGecko = new Map<string, SnapshotProtocol>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd < 1_000_000 || p.tvl_usd <= 0 || p.category === 'CEX') continue;
    const key = p.gecko_id ?? p.slug;
    const cur = byGecko.get(key);
    if (cur === undefined || p.tvl_usd > cur.tvl_usd) byGecko.set(key, p);
  }
  return [...byGecko.values()].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** The clamped week's move in per cent; unreported counts as flat. */
function growthPct(p: SnapshotProtocol): number {
  return Math.min(50, Math.max(-50, finite(p.change_7d, 0)));
}

/** A protocol's age in years, or null. */
function ageYears(asOf: string, p: SnapshotProtocol): number | null {
  const d = ageDays(asOf, p.listed_at);
  return d === null ? null : d / 365.25;
}

/** The value model's parts; a form is a set of parts. 'carry' is not a column of its own: it
 *  projects the size curve's TVL one week forward at the protocol's excess 7-day move beyond the
 *  snapshot median week, held to +/-25%. */
type ValuePart = 'size' | 'carry' | 'category' | 'chains' | 'seasoning' | 'age' | 'growth';

/** The shipped form: size curve at carry-projected TVL, ridge category effects, log chain count. */
const SHIPPED_FORM: ReadonlySet<ValuePart> = new Set(['size', 'carry', 'category', 'chains']);

/** The growth carry: one more week of the protocol's excess 7-day move beyond the snapshot median
 *  week (`medAll`, in per cent), held to +/-25%. */
function carryOf(p: SnapshotProtocol, medAll: number): number {
  return Math.min(0.25, Math.max(-0.25, (growthPct(p) - medAll) / 100));
}

/** How settled a protocol's TVL is after its days with no token: 1 - exp(-days/365), with the
 *  comps' median age (`medDays`) standing in when no listing date is recorded. */
function settledOf(p: SnapshotProtocol, asOf: string, medDays: number): number {
  return 1 - Math.exp(-(ageDays(asOf, p.listed_at) ?? medDays) / 365);
}

/** One value-model design row under a form (intercept first; columns in a fixed order). */
function valueRow(p: SnapshotProtocol, asOf: string, form: ReadonlySet<ValuePart>, cats: string[], medAll: number, medDays: number): number[] {
  const x = [1];
  if (form.has('size')) x.push(Math.log(p.tvl_usd * (form.has('carry') ? 1 + carryOf(p, medAll) : 1)));
  if (form.has('category')) for (const c of cats) x.push((p.category ?? 'Other') === c ? 1 : 0);
  if (form.has('chains')) x.push(Math.log1p(Math.min(p.chains.length, 10)));
  if (form.has('seasoning')) x.push(settledOf(p, asOf, medDays));
  if (form.has('age')) x.push(Math.log1p(ageYears(asOf, p) ?? 1));
  if (form.has('growth')) x.push(growthPct(p) / 100);
  return x;
}

/** The ridge penalty per column for a form: category effects and seasoning shrink, the rest do not. */
function valuePenalty(form: ReadonlySet<ValuePart>, cats: string[]): number[] {
  const pen = [0];
  if (form.has('size')) pen.push(0);
  if (form.has('category')) for (let i = 0; i < cats.length; i++) pen.push(10);
  if (form.has('chains')) pen.push(0);
  if (form.has('seasoning')) pen.push(10);
  if (form.has('age')) pen.push(0);
  if (form.has('growth')) pen.push(0);
  return pen;
}

/** Fit the value model on comps; returns weights for `valueRow`'s columns. */
function fitValue(comps: SnapshotProtocol[], asOf: string, form: ReadonlySet<ValuePart>, cats: string[], medAll: number, medDays: number): number[] {
  const X = comps.map((p) => valueRow(p, asOf, form, cats, medAll, medDays));
  const y = comps.map((p) => Math.log(p.mcap_usd!));
  return ridgeFit(X, y, valuePenalty(form, cats));
}

/** The launch value one protocol gets under fitted weights. */
function launchValue(p: SnapshotProtocol, asOf: string, form: ReadonlySet<ValuePart>, cats: string[], medAll: number, medDays: number, w: number[]): number {
  const x = valueRow(p, asOf, form, cats, medAll, medDays);
  let z = 0;
  for (let j = 0; j < x.length; j++) z += x[j]! * w[j]!;
  return Math.exp(z);
}

/** Held-out typical miss of a value form: leave-one-out over all comps, and walk-forward
 *  (fit on the older-listed half, test on the newer half; comps with no listing date sit out). */
function valueMiss(
  comps: SnapshotProtocol[],
  asOf: string,
  form: ReadonlySet<ValuePart>,
  cats: string[],
  medAll: number,
  medDays: number,
): { loo: number; wf: number; looPreds: number[] } {
  const actuals = comps.map((p) => p.mcap_usd!);
  const looPreds = comps.map((p, i) => {
    const train = comps.filter((_, j) => j !== i);
    return launchValue(p, asOf, form, cats, medAll, medDays, fitValue(train, asOf, form, cats, medAll, medDays));
  });
  const dated = comps
    .map((p, i) => ({ p, i }))
    .filter((o) => o.p.listed_at !== null)
    .sort((a, b) => (a.p.listed_at! < b.p.listed_at! ? -1 : a.p.listed_at! > b.p.listed_at! ? 1 : a.p.slug < b.p.slug ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const w = fitValue(dated.slice(0, half).map((o) => o.p), asOf, form, cats, medAll, medDays);
  const wfPreds = dated.slice(half).map((o) => launchValue(o.p, asOf, form, cats, medAll, medDays, w));
  return {
    loo: typicalMiss(looPreds, actuals),
    wf: typicalMiss(wfPreds, dated.slice(half).map((o) => o.p.mcap_usd!)),
    looPreds,
  };
}

/** The odds model's candidate terms, in the order they are tested. */
type OddsTerm = 'age' | 'size' | 'growth' | 'chains' | 'category';
const ODDS_TERMS: { id: OddsTerm; name: string }[] = [
  { id: 'age', name: 'age, years listed' },
  { id: 'size', name: 'size curve, ln TVL' },
  { id: 'growth', name: '7-day TVL growth' },
  { id: 'chains', name: 'chain count' },
  { id: 'category', name: 'category effect, ridge' },
];

/** One odds design row under a set of kept terms (intercept first); missing age takes the train
 *  median (passed in) and sets its own flag column, which travels with the age term. */
function oddsRow(p: SnapshotProtocol, asOf: string, terms: Set<OddsTerm>, cats: string[], ageMedian: number): number[] {
  const x = [1];
  if (terms.has('age')) {
    const a = ageYears(asOf, p);
    x.push(a ?? ageMedian, a === null ? 1 : 0);
  }
  if (terms.has('size')) x.push(Math.log(p.tvl_usd));
  if (terms.has('growth')) x.push(growthPct(p) / 100);
  if (terms.has('chains')) x.push(Math.min(p.chains.length, 10));
  if (terms.has('category')) for (const c of cats) x.push((p.category ?? 'Other') === c ? 1 : 0);
  return x;
}

/** The logistic penalty per column: a whisper on the main terms, real shrinkage on categories. */
function oddsPenalty(terms: Set<OddsTerm>, cats: string[]): number[] {
  const pen = [0];
  if (terms.has('age')) pen.push(0.001, 0.001);
  if (terms.has('size')) pen.push(0.001);
  if (terms.has('growth')) pen.push(0.001);
  if (terms.has('chains')) pen.push(0.001);
  if (terms.has('category')) for (let i = 0; i < cats.length; i++) pen.push(0.05);
  return pen;
}

/** Fit the odds model on peers. */
function fitOdds(
  peers: SnapshotProtocol[],
  asOf: string,
  terms: Set<OddsTerm>,
  cats: string[],
  iters: number,
): { fit: { w: number[]; mu: number[]; sd: number[] }; ageMedian: number } {
  const ages = peers.map((p) => ageYears(asOf, p)).filter((a): a is number => a !== null);
  const ageMedian = ages.length > 0 ? median(ages) : 1;
  const X = peers.map((p) => oddsRow(p, asOf, terms, cats, ageMedian));
  const y = peers.map((p) => (recordsToken(p) ? 1 : 0));
  return { fit: logitFit(X, y, oddsPenalty(terms, cats), iters), ageMedian };
}

/** The standard deviation of a sample (the bootstrap standard error of a coefficient). */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

/** An odds fit's coefficients on the raw feature scale, named: logit = w0 + sum wj (xj - muj)/sdj
 *  = (w0 - sum wj muj/sdj) + sum (wj/sdj) xj. */
function unstandardiseOdds(
  model: { fit: { w: number[]; mu: number[]; sd: number[] }; ageMedian: number },
  terms: Set<OddsTerm>,
  cats: string[],
): { intercept: number; age_years: number; age_missing: number; ln_tvl: number; growth: number; chains: number; cat: Record<string, number> } {
  const { w, mu, sd } = model.fit;
  let j = 1;
  let intercept = w[0]!;
  const raw = (idx: number): number => {
    intercept -= (w[idx]! * mu[idx]!) / sd[idx]!;
    return w[idx]! / sd[idx]!;
  };
  const coef = { intercept: 0, age_years: 0, age_missing: 0, ln_tvl: 0, growth: 0, chains: 0, cat: {} as Record<string, number> };
  if (terms.has('age')) {
    coef.age_years = raw(j++);
    coef.age_missing = raw(j++);
  }
  if (terms.has('size')) coef.ln_tvl = raw(j++);
  if (terms.has('growth')) coef.growth = raw(j++);
  if (terms.has('chains')) coef.chains = raw(j++);
  if (terms.has('category')) for (const c of cats) coef.cat[c] = raw(j++);
  coef.intercept = intercept;
  return coef;
}

/** The token odds one protocol gets under a fitted odds model. */
function tokenOdds(
  p: SnapshotProtocol,
  asOf: string,
  terms: Set<OddsTerm>,
  cats: string[],
  model: { fit: { w: number[]; mu: number[]; sd: number[] }; ageMedian: number },
): number {
  return logitPredict(model.fit, oddsRow(p, asOf, terms, cats, model.ageMedian));
}

/** Held-out Brier of an odds term set: ten-fold over all peers (slug order), and walk-forward
 *  (fit on the older-listed half, test on the newer half). */
function oddsBrier(
  peers: SnapshotProtocol[],
  asOf: string,
  terms: Set<OddsTerm>,
  cats: string[],
): { tenfold: number; wf: number } {
  const y = peers.map((p) => (recordsToken(p) ? 1 : 0));
  const preds: number[] = Array(peers.length).fill(0);
  for (let f = 0; f < 10; f++) {
    const train = peers.filter((_, i) => i % 10 !== f);
    const m = fitOdds(train, asOf, terms, cats, 400);
    peers.forEach((p, i) => {
      if (i % 10 === f) preds[i] = tokenOdds(p, asOf, terms, cats, m);
    });
  }
  const dated = peers
    .map((p, i) => ({ p, i }))
    .filter((o) => o.p.listed_at !== null)
    .sort((a, b) => (a.p.listed_at! < b.p.listed_at! ? -1 : a.p.listed_at! > b.p.listed_at! ? 1 : a.p.slug < b.p.slug ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const m = fitOdds(dated.slice(0, half).map((o) => o.p), asOf, terms, cats, 400);
  const wfPreds = dated.slice(half).map((o) => tokenOdds(o.p, asOf, terms, cats, m));
  return { tenfold: brier(preds, y), wf: brier(wfPreds, dated.slice(half).map((o) => y[o.i]!)) };
}

/** The farm plan's size: the stated deposit tier the board files (the dashboard switches tiers). */
export function planSize(p: SnapshotProtocol, farm: FarmAssumptions): number {
  void p;
  return farm.plan_usd;
}

/** The capital charge on a deposit held for the horizon: 2% a year, pro-rated by weeks. */
export function capitalCharge(plan: number, farm: FarmAssumptions): number {
  return (plan * farm.capital_charge_rate * farm.horizon_weeks) / 52;
}

/** The gas one action costs on the protocol's first named chain (Ethereum mainnet costs more). */
export function gasPerAction(p: SnapshotProtocol, farm: FarmAssumptions): number {
  return chainOf(p) === 'Ethereum' ? farm.gas_ethereum_usd : farm.gas_per_action_usd;
}

/** One row's netted farm economics: expected drop at the stated share, minus gas and the capital
 *  charge on the deposit, over the horizon. `fees_usd` carries both costs so the filed arithmetic
 *  (net = drop - fees) holds; the dashboard breaks the two out. */
export function farmEconomics(p: SnapshotProtocol, implied: number, farm: FarmAssumptions): FarmEconomics {
  const plan = planSize(p, farm);
  const drop = (implied * farm.drop_share * plan) / Math.max(1, p.tvl_usd);
  const fees = gasPerAction(p, farm) * (2 + farm.horizon_weeks) + capitalCharge(plan, farm);
  const hours = farm.setup_hours + farm.weekly_hours * farm.horizon_weeks + farm.claim_hours;
  const net = drop - fees;
  const rate = net / hours;
  const verdict: FarmEconomics['verdict'] =
    net >= farm.farm_min_net_usd && rate >= farm.farm_min_net_per_hour ? 'FARM' : net > 0 ? 'THIN' : 'SKIP';
  return {
    plan_usd: plan,
    expected_drop_usd: round4(drop),
    fees_usd: round4(fees),
    hours: round4(hours),
    net_usd: round4(net),
    net_per_hour: round4(rate),
    verdict,
  };
}

/** The drop share at which one row's plan breaks even, in per cent: (gas + capital charge) scaled
 *  by TVL over (implied value x deposit). Above 100% the plan cannot pay at any share. */
export function breakEvenPct(p: SnapshotProtocol, implied: number, farm: FarmAssumptions): number {
  const plan = planSize(p, farm);
  const costs = gasPerAction(p, farm) * (2 + farm.horizon_weeks) + capitalCharge(plan, farm);
  if (implied <= 0 || plan <= 0) return Infinity;
  return (costs * Math.max(1, p.tvl_usd) * 100) / (implied * plan);
}

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

/** Money in a sentence: whole dollars, grouped. */
function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** The farm plan's mechanism in a few words, for the board's farm-plan column. */
export function mechFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Supply and borrow';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return 'Liquidity and swaps';
  if (c.includes('bridge')) return 'Bridge round trip';
  if (c.includes('staking') || c.includes('restak')) return 'Stake and hold receipt';
  if (c.includes('perpetual') || c.includes('derivative')) return 'Margin and hedged perp';
  if (c.includes('prediction')) return 'Market positions';
  if (c.includes('curator') || c.includes('allocator')) return 'Curated vault';
  if (c.includes('stable')) return 'Mint and hold stable';
  if (c.includes('rwa')) return 'Tokenised asset';
  if (c.includes('insurance')) return 'Cover policy';
  if (c.includes('payment')) return 'Payment flow';
  return 'Deposit and hold';
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, plan: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply ${money(plan)} of USDC to ${name}'s main lending market on ${chain}, check the supply APY before you commit, and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide ${money(plan)} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge ${money(plan)} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake ${money(plan)} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit ${money(plan)} of USDC as margin on ${name}, open one small hedged perp position, and check the funding rate before you size it.`;
  if (c.includes('prediction')) return `Fund ${money(plan)} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit ${money(plan)} into a ${name} curator vault on ${chain}, read which strategies the curator runs and what fee it takes, and keep the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit ${money(plan)} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint ${money(plan)} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy ${money(plan)} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('payment')) return `Route ${money(plan)} of payments through ${name} on ${chain} and keep the flow going.`;
  return `Deposit ${money(plan)} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second qualifying action, complementary to the first, so the plan is not one deposit and done. */
function secondActionFor(p: SnapshotProtocol, plan: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const half = Math.max(250, Math.round(plan / 2));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow ${money(half)} of a stable asset against the deposit on ${name} and loop it back into supply only if the borrow rate is below the supply APY, then repay half of it a week later.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap ${money(half)} through ${name}'s router on ${chain} and add the proceeds to a second pool.`;
  if (c.includes('bridge')) return `Bridge ${money(half)} back the other way through ${name} so the round trip is recorded.`;
  if (c.includes('staking') || c.includes('restak')) return `Delegate or restake ${money(half)} more through ${name} and keep the new receipt alongside the first.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Provide ${money(half)} of liquidity to ${name}'s perp market if it pays makers, then close the first trade and open a second one half the size on the opposite side.`;
  if (c.includes('prediction')) return `Settle the first market on ${name} and place a second position in a different market.`;
  if (c.includes('curator') || c.includes('allocator')) return `Move ${money(half)} into a second ${name} vault on ${chain} with a different strategy, and compare the two curators' allocations and fees.`;
  if (c.includes('stable')) return `Redeem ${money(half)} of the stable asset through ${name} and re-mint it a week later.`;
  if (c.includes('rwa')) return `Claim the yield accrued on the first mint and reinvest ${money(half)} of it through ${name}.`;
  if (c.includes('insurance')) return `File a test claim on the ${name} policy and renew the cover for another term.`;
  if (c.includes('payment')) return `Send a second ${money(half)} payment through ${name} to a different recipient on ${chain}.`;
  return `Vote or sign one governance action on ${name} if it offers one, then repeat the deposit with ${money(half)} more.`;
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
 * A protocol's farm plan: eight steps, each an action with a cost and a time, sized to the protocol
 * and netted under the stated assumptions. The first step carries the economics (plan size, expected
 * drop at the stated share, gas, net and verdict), so the plan is a claim a reader can check, not a
 * slogan. Derived from the protocol's own record, never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, econ: FarmEconomics, farm: FarmAssumptions): FarmStep[] {
  const chain = chainOf(p);
  const weeks = farm.horizon_weeks;
  const days = weeks * 7;
  const sharePct = Math.round(farm.drop_share * 1000) / 10;
  const gas = gasPerAction(p, farm) * (2 + weeks);
  const charge = capitalCharge(econ.plan_usd, farm);
  const exitTvl = money(p.tvl_usd * 0.7);
  return [
    {
      text: `Day 0 - Size the plan first: ${money(econ.plan_usd)} into ${p.name} (the middle of three deposit tiers, $1,000 / $10,000 / $50,000). At a ${sharePct}% drop share the expected drop is ${money(econ.expected_drop_usd)} against about ${money(gas)} of gas and ${money(charge)} of capital charge (2% a year on the deposit) over ${weeks} weeks: net ${money(econ.net_usd)}, ${money(econ.net_per_hour)} an hour - verdict ${econ.verdict}.`,
      cost: 'no fee to size the plan',
      time: '5 minutes',
    },
    {
      text: `Day 0 - Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: `Day 1 - ${actionFor(p, econ.plan_usd, chain)} When the wallet asks, approve only the amount you are depositing, never an unlimited spend.`,
      cost: `${money(econ.plan_usd)} of capital and about $1 of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Day 1 - After the position lands, open the protocol's page and confirm it shows with the amount you deposited, then save the transaction hash and a screenshot of the page in your farm log.`,
      cost: 'no fee to check',
      time: '5 minutes',
    },
    {
      text: `Day 8 - ${secondActionFor(p, econ.plan_usd, chain)}`,
      cost: 'about $1 of gas',
      time: '10 minutes',
    },
    {
      text: `Weekly - Make one qualifying action each week for ${weeks} weeks, such as a deposit, a borrow, a swap or a vote, so the activity is counted in more than one snapshot. Leave early if TVL drops under ${exitTvl} (30% below today): withdraw and stop.`,
      cost: `about ${money(gasPerAction(p, farm))} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Day ${days} - ${verifyFor(p)}`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Claim - Before you withdraw, claim only from the link the protocol itself publishes, never from a message or a search result, and write the wallet, the dates and every transaction in a farm log.`,
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
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** Everything the dashboard renders, from the snapshot: the fitted models, their held-out evidence,
 *  the ranked board with bands and netted farm economics, and the raw comp/peer figures the page
 *  refits from so the screenshots and the code agree. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const asOf = snapshot.as_of;
  const protocols = snapshot.protocols;
  const watchlist = new Set(snapshot.watchlist);

  // The ledger: every protocol in exactly one of the nine groups.
  const groups = new Map<LedgerGroup, SnapshotProtocol[]>();
  for (const p of protocols) {
    const g = ledgerGroup(p, watchlist);
    const arr = groups.get(g) ?? [];
    arr.push(p);
    groups.set(g, arr);
  }
  const ranked = [...(groups.get('watchlist') ?? []), ...(groups.get('early') ?? [])];
  const comps = pricingComps(snapshot);
  // The odds peers: every protocol that records a token, plus the ranked pre-token set.
  const peers = protocols.filter((p) => {
    const g = ledgerGroup(p, watchlist);
    return isRankedGroup(g) || g === 'trades' || g === 'nocap';
  });
  // The market week: the snapshot's median 7-day move over every protocol, and the comps' median
  // age in days (the seasoning stand-in for a missing listing date).
  const medAll = median(protocols.map((p) => growthPct(p)));
  const medDays = median(comps.map((p) => ageDays(asOf, p.listed_at)).filter((d): d is number => d !== null));

  // Ridge categories: those with at least 3 comps (value) / 10 peers (odds), in name order.
  const compCatCount = new Map<string, number>();
  for (const p of comps) compCatCount.set(p.category ?? 'Other', (compCatCount.get(p.category ?? 'Other') ?? 0) + 1);
  const valueCats = [...compCatCount.entries()].filter(([, n]) => n >= 3).map(([c]) => c).sort();
  const peerCatCount = new Map<string, number>();
  for (const p of peers) peerCatCount.set(p.category ?? 'Other', (peerCatCount.get(p.category ?? 'Other') ?? 0) + 1);
  const oddsCats = [...peerCatCount.entries()].filter(([, n]) => n >= 10).map(([c]) => c).sort();

  // Value model: flat multiple baseline, the plain size curve, and the shipped form (size curve at
  // carry-projected TVL + ridge category effects + log chain count), each scored held-out in both
  // tests; the shipped form's parts are ablated one at a time, and a seasoning term is tested on
  // top of it.
  const flatLoo = (() => {
    const preds = comps.map((p, i) => p.tvl_usd * median(comps.filter((_, j) => j !== i).map((q) => q.mcap_usd! / q.tvl_usd)));
    return typicalMiss(preds, comps.map((p) => p.mcap_usd!));
  })();
  const flatWf = (() => {
    const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
    const half = Math.floor(dated.length / 2);
    const m = median(dated.slice(0, half).map((p) => p.mcap_usd! / p.tvl_usd));
    return typicalMiss(dated.slice(half).map((p) => p.tvl_usd * m), dated.slice(half).map((p) => p.mcap_usd!));
  })();
  const formMiss = (form: ReadonlySet<ValuePart>) => valueMiss(comps, asOf, form, valueCats, medAll, medDays);
  const sizeOnlyMiss = formMiss(new Set(['size']));
  const shippedMiss = formMiss(SHIPPED_FORM);
  const valueVariants: VariantResult[] = [
    { name: 'size curve, ln TVL', loo: round4(sizeOnlyMiss.loo), wf: round4(sizeOnlyMiss.wf), shipped: false },
    { name: 'shipped: size at carry-projected TVL + category + chain count (log)', loo: round4(shippedMiss.loo), wf: round4(shippedMiss.wf), shipped: true },
    { name: 'shipped form without the carry', ...(() => { const m = formMiss(new Set(['size', 'category', 'chains'])); return { loo: round4(m.loo), wf: round4(m.wf) }; })(), shipped: false },
    { name: 'shipped form without category effects', ...(() => { const m = formMiss(new Set(['size', 'carry', 'chains'])); return { loo: round4(m.loo), wf: round4(m.wf) }; })(), shipped: false },
    { name: 'shipped form without chain count', ...(() => { const m = formMiss(new Set(['size', 'carry', 'category'])); return { loo: round4(m.loo), wf: round4(m.wf) }; })(), shipped: false },
    { name: 'shipped form + seasoning (settled TVL by no-token days)', ...(() => { const m = formMiss(new Set([...SHIPPED_FORM, 'seasoning'])); return { loo: round4(m.loo), wf: round4(m.wf) }; })(), shipped: false },
  ];
  // The control: the shipped form plus another row's growth must not help.
  const controlMiss = (() => {
    const rotated = comps.map((p, i) => ({ ...p, change_7d: comps[(i + 1) % comps.length]!.change_7d }));
    return valueMiss(rotated, asOf, new Set([...SHIPPED_FORM, 'growth']), valueCats, medAll, medDays);
  })();
  const valueWeights = fitValue(comps, asOf, SHIPPED_FORM, valueCats, medAll, medDays);
  const finalMiss = shippedMiss;

  // Range honesty: residual quantiles from the leave-one-out predictions, coverage checked
  // leave-one-out (quantiles recomputed without each comp) and walk-forward (train-half quantiles).
  const residuals = comps.map((p, i) => Math.log(p.mcap_usd! / finalMiss.looPreds[i]!));
  const cover = (preds: number[], actuals: number[], lo: number, hi: number): number =>
    preds.filter((pr, i) => actuals[i]! >= pr * Math.exp(lo) && actuals[i]! <= pr * Math.exp(hi)).length / preds.length;
  const looCover = (qLo: number, qHi: number): number => {
    let inside = 0;
    comps.forEach((p, i) => {
      const rest = residuals.filter((_, j) => j !== i);
      const lo = quantile(rest, qLo);
      const hi = quantile(rest, qHi);
      const pr = finalMiss.looPreds[i]!;
      if (p.mcap_usd! >= pr * Math.exp(lo) && p.mcap_usd! <= pr * Math.exp(hi)) inside++;
    });
    return inside / comps.length;
  };
  const wfRange = (() => {
    const dated = comps
      .map((p, i) => ({ p, i }))
      .filter((o) => o.p.listed_at !== null)
      .sort((a, b) => (a.p.listed_at! < b.p.listed_at! ? -1 : a.p.listed_at! > b.p.listed_at! ? 1 : a.p.slug < b.p.slug ? -1 : 1));
    const half = Math.floor(dated.length / 2);
    const w = fitValue(dated.slice(0, half).map((o) => o.p), asOf, SHIPPED_FORM, valueCats, medAll, medDays);
    const trainRes = dated.slice(0, half).map((o) => Math.log(o.p.mcap_usd! / launchValue(o.p, asOf, SHIPPED_FORM, valueCats, medAll, medDays, w)));
    const testPreds = dated.slice(half).map((o) => launchValue(o.p, asOf, SHIPPED_FORM, valueCats, medAll, medDays, w));
    const testActuals = dated.slice(half).map((o) => o.p.mcap_usd!);
    return {
      within3: testPreds.filter((pr, i) => Math.abs(Math.log(testActuals[i]! / pr)) <= Math.log(3)).length / testPreds.length,
      cover50: cover(testPreds, testActuals, quantile(trainRes, 0.25), quantile(trainRes, 0.75)),
      cover80: cover(testPreds, testActuals, quantile(trainRes, 0.1), quantile(trainRes, 0.9)),
    };
  })();
  const range = {
    within3_loo: round4(comps.filter((p, i) => Math.abs(residuals[i]!) <= Math.log(3)).length / comps.length),
    within3_wf: round4(wfRange.within3),
    cover50_loo: round4(looCover(0.25, 0.75)),
    cover50_wf: round4(wfRange.cover50),
    cover80_loo: round4(looCover(0.1, 0.9)),
    cover80_wf: round4(wfRange.cover80),
  };

  // Odds model: base rate baseline, then terms kept only if both Brier scores fall.
  const baseRate = peers.filter(recordsToken).length / peers.length;
  const baseBrier = (() => {
    const y = peers.map((p) => (recordsToken(p) ? 1 : 0));
    const preds: number[] = Array(peers.length).fill(0);
    for (let f = 0; f < 10; f++) {
      const train = y.filter((_, i) => i % 10 !== f);
      const rate = train.reduce((a, b) => a + b, 0) / train.length;
      y.forEach((_, i) => {
        if (i % 10 === f) preds[i] = rate;
      });
    }
    const dated = peers
      .map((p, i) => ({ p, i }))
      .filter((o) => o.p.listed_at !== null)
      .sort((a, b) => (a.p.listed_at! < b.p.listed_at! ? -1 : a.p.listed_at! > b.p.listed_at! ? 1 : a.p.slug < b.p.slug ? -1 : 1));
    const half = Math.floor(dated.length / 2);
    const rate = dated.slice(0, half).reduce((a, o) => a + y[o.i]!, 0) / half;
    return {
      tenfold: brier(preds, y),
      wf: brier(dated.slice(half).map(() => rate), dated.slice(half).map((o) => y[o.i]!)),
    };
  })();
  const keptOdds = new Set<OddsTerm>();
  const oddsTerms: TermResult[] = [];
  let currentBrier = { tenfold: baseBrier.tenfold, wf: baseBrier.wf };
  for (const t of ODDS_TERMS) {
    const trial = new Set(keptOdds);
    trial.add(t.id);
    const b = oddsBrier(peers, asOf, trial, oddsCats);
    const kept = b.tenfold < currentBrier.tenfold && b.wf < currentBrier.wf;
    if (kept) {
      keptOdds.add(t.id);
      currentBrier = { tenfold: b.tenfold, wf: b.wf };
    }
    oddsTerms.push({ name: t.name, loo: round4(b.tenfold), wf: round4(b.wf), kept });
  }
  const controlBrier = (() => {
    const rotated = peers.map((p, i) => ({ ...p, change_7d: peers[(i + 1) % peers.length]!.change_7d }));
    const withControl = new Set(keptOdds);
    withControl.add('growth');
    return oddsBrier(rotated, asOf, withControl, oddsCats);
  })();
  const oddsModel = fitOdds(peers, asOf, keptOdds, oddsCats, 400);

  // Point estimates for every ranked protocol.
  const point = ranked.map((p) => {
    const launch = launchValue(p, asOf, SHIPPED_FORM, valueCats, medAll, medDays, valueWeights);
    const odds = tokenOdds(p, asOf, keptOdds, oddsCats, oddsModel);
    return { p, launch, odds, implied: Math.max(1, Math.round(launch * odds)) };
  });

  // Seeded bootstrap: refit both models on resampled comps/peers, reprice and re-rank every row.
  // The refits' coefficients are kept too, for the shipped standard errors.
  const rand = rng(20261114);
  const samples = new Map<string, number[]>();
  const rankSamples = new Map<string, number[]>();
  const valueWeightSamples: number[][] = [];
  const oddsCoefSamples: { age_years: number; ln_tvl: number; growth: number }[] = [];
  for (const s of point) {
    samples.set(s.p.slug, []);
    rankSamples.set(s.p.slug, []);
  }
  for (let r = 0; r < BOOTSTRAP_REFITS; r++) {
    const compSample = comps.map(() => comps[Math.floor(rand() * comps.length)]!);
    const peerSample = peers.map(() => peers[Math.floor(rand() * peers.length)]!);
    const w = fitValue(compSample, asOf, SHIPPED_FORM, valueCats, medAll, medDays);
    valueWeightSamples.push(w);
    const om = fitOdds(peerSample, asOf, keptOdds, oddsCats, 300);
    const oc = unstandardiseOdds(om, keptOdds, oddsCats);
    oddsCoefSamples.push({ age_years: oc.age_years, ln_tvl: oc.ln_tvl, growth: oc.growth });
    const priced = ranked.map((p) => ({
      slug: p.slug,
      implied: launchValue(p, asOf, SHIPPED_FORM, valueCats, medAll, medDays, w) * tokenOdds(p, asOf, keptOdds, oddsCats, om),
    }));
    const order = [...priced].sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : 1));
    order.forEach((row, i) => rankSamples.get(row.slug)!.push(i + 1));
    for (const row of priced) samples.get(row.slug)!.push(row.implied);
  }

  // Factor decomposition under the shipped form's weights: the plain size value at this TVL, the
  // carry's multiplier on it, the category effect and the chain-count effect.
  const decompose = (p: SnapshotProtocol): { size: number; cat: number; growth: number; age: number; chains: number } => {
    const slope = valueWeights[1]!;
    const size = Math.exp(valueWeights[0]! + slope * Math.log(p.tvl_usd));
    const growth = Math.pow(1 + carryOf(p, medAll), slope);
    let cat = 1;
    const ci = valueCats.indexOf(p.category ?? 'Other');
    if (ci >= 0) cat = Math.exp(valueWeights[2 + ci]!);
    const chains = Math.exp(valueWeights[2 + valueCats.length]! * Math.log1p(Math.min(p.chains.length, 10)));
    return { size, cat, growth, age: 1, chains };
  };

  const sorted = [...point].sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = sorted.map((s, i) => {
    const p = s.p;
    const econ = farmEconomics(p, s.implied, FARM);
    const f = decompose(p);
    const band = samples.get(p.slug)!;
    const ranks = rankSamples.get(p.slug)!;
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      age_days: ageDays(asOf, p.listed_at),
      launch_value_usd: Math.round(s.launch),
      token_odds: round4(s.odds),
      implied_value_usd: s.implied,
      band_p25_usd: Math.round(quantile(band, 0.25)),
      band_p75_usd: Math.round(quantile(band, 0.75)),
      rank_range: [Math.round(quantile(ranks, 0.1)), Math.round(quantile(ranks, 0.9))],
      model: {
        size_value_usd: Math.round(f.size),
        category_effect: round4(f.cat),
        growth_effect: round4(f.growth),
        age_effect: round4(f.age),
        chain_effect: round4(f.chains),
        launch_value_usd: Math.round(s.launch),
        token_odds: round4(s.odds),
        age_days: ageDays(asOf, p.listed_at),
      },
      farm: econ,
      farm_steps: farmSteps(p, econ, FARM).map(stepText),
    };
  });

  // The shipped coefficients, named for the dashboard's refit check, with bootstrap standard
  // errors from the 200 refits (the shipped form's columns: intercept, size, categories, chains).
  const valueCoef = (() => {
    const coef = { intercept: round6(valueWeights[0]!), ln_tvl: round6(valueWeights[1]!), growth: 0, age: 0, chains: round6(valueWeights[2 + valueCats.length]!), cat: {} as Record<string, number> };
    valueCats.forEach((c, i) => {
      coef.cat[c] = round6(valueWeights[2 + i]!);
    });
    return coef;
  })();
  const valueCoefSe = (() => {
    const colSe = (j: number) => round6(stdDev(valueWeightSamples.map((w) => w[j]!)));
    const se = { intercept: colSe(0), ln_tvl: colSe(1), chains: colSe(2 + valueCats.length), cat: {} as Record<string, number> };
    valueCats.forEach((c, i) => {
      se.cat[c] = colSe(2 + i);
    });
    return se;
  })();
  const oddsCoef = (() => {
    const c = unstandardiseOdds(oddsModel, keptOdds, oddsCats);
    const cat: Record<string, number> = {};
    for (const k of Object.keys(c.cat)) cat[k] = round6(c.cat[k]!);
    return {
      intercept: round6(c.intercept),
      age_years: round6(c.age_years),
      age_missing: round6(c.age_missing),
      ln_tvl: round6(c.ln_tvl),
      growth: round6(c.growth),
      chains: round6(c.chains),
      cat,
    };
  })();
  const oddsCoefSe = {
    age_years: round6(stdDev(oddsCoefSamples.map((s) => s.age_years))),
    ln_tvl: round6(stdDev(oddsCoefSamples.map((s) => s.ln_tvl))),
    growth: round6(stdDev(oddsCoefSamples.map((s) => s.growth))),
  };

  // Compact comp/peer figures for the browser refit and the scatter.
  const catsAll = ['Other', ...[...new Set(protocols.map((p) => p.category).filter((c): c is string => c !== null))].sort()];
  const catIdx = (p: SnapshotProtocol): number => (p.category === null ? 0 : catsAll.indexOf(p.category));
  const listedOrd = (list: SnapshotProtocol[]): Map<string, number> => {
    const dated = list
      .filter((p) => p.listed_at !== null)
      .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
    return new Map(dated.map((p, i) => [p.slug, i]));
  };
  const compOrd = listedOrd(comps);
  const peerOrd = listedOrd(peers);
  const compsData = comps.map((p) => [
    p.tvl_usd,
    p.mcap_usd!,
    catIdx(p),
    round4(growthPct(p)),
    ageDays(asOf, p.listed_at) ?? -1,
    p.chains.length,
    compOrd.get(p.slug) ?? -1,
  ]);
  const peersData = peers.map((p) => [
    p.tvl_usd,
    round4(growthPct(p)),
    ageDays(asOf, p.listed_at) ?? -1,
    p.chains.length,
    recordsToken(p) ? 1 : 0,
    catIdx(p),
    peerOrd.get(p.slug) ?? -1,
  ]);

  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watchlist.has(r.slug)).length,
    live_size: live.length,
    ledger: LEDGER_LABELS.map((g) => ({ id: g.id, label: g.label, count: (groups.get(g.id) ?? []).length })),
    ledger_total: protocols.length,
    market_median_7d: medAll,
    value_model: {
      comps: comps.length,
      flat: { loo: round4(flatLoo), wf: round4(flatWf) },
      variants: valueVariants,
      control: { loo: round4(controlMiss.loo), wf: round4(controlMiss.wf) },
      coef: valueCoef,
      coef_se: valueCoefSe,
      range,
    },
    odds_model: {
      peers: peers.length,
      base_rate: round4(baseRate),
      base: { tenfold: round4(baseBrier.tenfold), wf: round4(baseBrier.wf) },
      terms: oddsTerms,
      control: { tenfold: round4(controlBrier.tenfold), wf: round4(controlBrier.wf) },
      coef: oddsCoef,
      coef_se: oddsCoefSe,
      means: {},
      sds: {},
    },
    farm: FARM,
    bootstrap_refits: BOOTSTRAP_REFITS,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      age_days: r.age_days,
      watchlist: watchlist.has(r.slug),
      launch_value_usd: r.launch_value_usd,
      token_odds: r.token_odds,
      implied_value_usd: r.implied_value_usd,
      band_p25_usd: r.band_p25_usd,
      band_p75_usd: r.band_p75_usd,
      rank_lo: r.rank_range[0],
      rank_hi: r.rank_range[1],
      size_value_usd: r.model.size_value_usd,
      category_effect: r.model.category_effect,
      growth_effect: r.model.growth_effect,
      age_effect: r.model.age_effect,
      chain_effect: r.model.chain_effect,
      farm: r.farm,
      farm_steps: r.farm_steps,
      plan_mech: mechFor({ category: r.category } as SnapshotProtocol),
    })),
    live,
    comps_data: compsData,
    peers_data: peersData,
    cats: catsAll,
  };
  return { board, radar };
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
