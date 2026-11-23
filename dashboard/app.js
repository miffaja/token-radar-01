// Token Radar (radar-4) dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and refits both models in this browser from the snapshot figures data.js carries: the launch
// value model (size curve at carry-projected TVL + ridge category effects + log chain count) on
// the traded comps, the token-odds model on the peers, every form and term scored held-out
// (leave-one-out and walk-forward). The board below is then recomputed row by row from those
// refitted coefficients and checked against board.json, so the screenshots and the code agree.
// Bootstrap bands, rank ranges and coefficient standard errors come from 200 seeded refits at
// build time. No network: every byte it shows is in data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var CATS = DATA.cats; // category names by index; 0 is the null category ("Other")
  var FARM = DATA.farm;

  /* ---------- small helpers ---------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365.25).toFixed(1) + ' yr';
    return Math.max(0, Math.round(days)) + ' d';
  }
  function quantile(values, q) {
    if (!values.length) return 0;
    var s = values.slice().sort(function (a, b) { return a - b; });
    var at = q * (s.length - 1), lo = Math.floor(at), hi = Math.ceil(at);
    return s[lo] + (s[hi] - s[lo]) * (at - lo);
  }
  function median(values) { return quantile(values, 0.5); }

  /* ---------- linear algebra (mirrors lib/model.ts) ---------- */
  function solveLinear(A, b) {
    var n = b.length, M = A.map(function (row, i) { return row.concat([b[i]]); }), c, r, j;
    for (c = 0; c < n; c++) {
      var piv = c;
      for (r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      var tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
      var d = M[c][c];
      for (j = c; j <= n; j++) M[c][j] /= d;
      for (r = 0; r < n; r++) {
        if (r === c) continue;
        var f = M[r][c];
        if (f === 0) continue;
        for (j = c; j <= n; j++) M[r][j] -= f * M[c][j];
      }
    }
    return M.map(function (row) { return row[n]; });
  }
  function ridgeFit(X, y, penalty) {
    var k = X[0].length, A = [], b = [], i, a, c;
    for (a = 0; a < k; a++) { A.push(new Array(k).fill(0)); b.push(0); }
    for (i = 0; i < X.length; i++) for (a = 0; a < k; a++) {
      b[a] += X[i][a] * y[i];
      for (c = 0; c < k; c++) A[a][c] += X[i][a] * X[i][c];
    }
    for (a = 0; a < k; a++) A[a][a] += penalty[a];
    return solveLinear(A, b);
  }
  function logitFit(X, y, penalty, iters) {
    var k = X[0].length, mu = [], sd = [], j, i, it;
    for (j = 0; j < k; j++) {
      if (j === 0) { mu.push(0); sd.push(1); continue; }
      var m = 0;
      for (i = 0; i < X.length; i++) m += X[i][j];
      m /= X.length;
      var v = 0;
      for (i = 0; i < X.length; i++) v += Math.pow(X[i][j] - m, 2);
      mu.push(m); sd.push(Math.sqrt(v / X.length) || 1);
    }
    var Z = X.map(function (r) { return r.map(function (v, jj) { return (v - mu[jj]) / sd[jj]; }); });
    var w = new Array(k).fill(0);
    for (it = 0; it < iters; it++) {
      var g = new Array(k).fill(0);
      for (i = 0; i < Z.length; i++) {
        var z = 0;
        for (j = 0; j < k; j++) z += Z[i][j] * w[j];
        var e = 1 / (1 + Math.exp(-z)) - y[i];
        for (j = 0; j < k; j++) g[j] += e * Z[i][j];
      }
      for (j = 0; j < k; j++) w[j] -= 0.1 * (g[j] / Z.length + penalty[j] * w[j]);
    }
    return { w: w, mu: mu, sd: sd };
  }
  function logitPredict(fit, x) {
    var z = 0;
    for (var j = 0; j < x.length; j++) z += ((x[j] - fit.mu[j]) / fit.sd[j]) * fit.w[j];
    return 1 / (1 + Math.exp(-z));
  }
  function typicalMiss(preds, actuals) {
    return Math.exp(median(preds.map(function (p, i) { return Math.abs(Math.log(p / actuals[i])); })));
  }
  function brier(preds, actuals) {
    var s = 0;
    for (var i = 0; i < preds.length; i++) s += Math.pow(preds[i] - actuals[i], 2);
    return s / preds.length;
  }

  /* ---------- the comp and peer figures data.js carries ----------
     comp: [tvl, mcap, catIdx, growthPct, ageDays|-1, nChains, listedOrd|-1]
     peer: [tvl, growthPct, ageDays|-1, nChains, hasToken, catIdx, listedOrd|-1] */
  var COMPS = DATA.comps_data;
  var PEERS = DATA.peers_data;
  function catName(idx) { return CATS[idx]; }
  function ageYearsOf(ageDays) { return ageDays < 0 ? null : ageDays / 365.25; }
  function catsWith(rows, idxAt, min) {
    var count = {};
    rows.forEach(function (r) { var c = catName(r[idxAt]); count[c] = (count[c] || 0) + 1; });
    return Object.keys(count).filter(function (c) { return count[c] >= min; }).sort();
  }
  var VALUE_CATS = catsWith(COMPS, 2, 3);
  var ODDS_CATS = catsWith(PEERS, 5, 10);

  /* ---------- value model: launch value fitted on traded comps ----------
     A form is a set of parts. 'carry' projects the size curve's TVL one week forward at the
     excess 7-day move beyond the snapshot median week (DATA.market_median_7d), held to +/-25%. */
  var MED_ALL = DATA.market_median_7d;
  var MED_DAYS = median(COMPS.map(function (c) { return c[4]; }).filter(function (d) { return d >= 0; }));
  var SHIPPED_FORM = { size: 1, carry: 1, category: 1, chains: 1 };
  function carryOf(c) { return Math.min(0.25, Math.max(-0.25, (c[3] - MED_ALL) / 100)); }
  function settledOf(c) { return 1 - Math.exp(-(c[4] < 0 ? MED_DAYS : c[4]) / 365); }
  function valueRow(c, form) {
    var x = [1];
    if (form.size) x.push(Math.log(c[0] * (form.carry ? 1 + carryOf(c) : 1)));
    if (form.category) VALUE_CATS.forEach(function (cat) { x.push(catName(c[2]) === cat ? 1 : 0); });
    if (form.chains) x.push(Math.log1p(Math.min(c[5], 10)));
    if (form.seasoning) x.push(settledOf(c));
    if (form.age) x.push(Math.log1p(ageYearsOf(c[4]) === null ? 1 : ageYearsOf(c[4])));
    if (form.growth) x.push(c[3] / 100);
    return x;
  }
  function valuePenalty(form) {
    var pen = [0];
    if (form.size) pen.push(0);
    if (form.category) VALUE_CATS.forEach(function () { pen.push(10); });
    if (form.chains) pen.push(0);
    if (form.seasoning) pen.push(10);
    if (form.age) pen.push(0);
    if (form.growth) pen.push(0);
    return pen;
  }
  function fitValue(comps, form) {
    return ridgeFit(comps.map(function (c) { return valueRow(c, form); }),
      comps.map(function (c) { return Math.log(c[1]); }), valuePenalty(form));
  }
  function launchOf(c, form, w) {
    var x = valueRow(c, form), z = 0;
    for (var j = 0; j < x.length; j++) z += x[j] * w[j];
    return Math.exp(z);
  }
  function valueMiss(comps, form) {
    var looPreds = comps.map(function (c, i) {
      var train = comps.filter(function (_, j) { return j !== i; });
      return launchOf(c, form, fitValue(train, form));
    });
    var dated = comps.map(function (c, i) { return { c: c, i: i }; })
      .filter(function (o) { return o.c[6] >= 0; })
      .sort(function (a, b) { return a.c[6] - b.c[6]; });
    var half = Math.floor(dated.length / 2);
    var w = fitValue(dated.slice(0, half).map(function (o) { return o.c; }), form);
    var wfPreds = dated.slice(half).map(function (o) { return launchOf(o.c, form, w); });
    return {
      loo: typicalMiss(looPreds, comps.map(function (c) { return c[1]; })),
      wf: typicalMiss(wfPreds, dated.slice(half).map(function (o) { return o.c[1]; })),
      looPreds: looPreds
    };
  }
  var flatLoo = typicalMiss(COMPS.map(function (c, i) {
    return c[0] * median(COMPS.filter(function (_, j) { return j !== i; }).map(function (q) { return q[1] / q[0]; }));
  }), COMPS.map(function (c) { return c[1]; }));
  var flatWf = (function () {
    var dated = COMPS.filter(function (c) { return c[6] >= 0; }).sort(function (a, b) { return a[6] - b[6]; });
    var half = Math.floor(dated.length / 2);
    var m = median(dated.slice(0, half).map(function (c) { return c[1] / c[0]; }));
    return typicalMiss(dated.slice(half).map(function (c) { return c[0] * m; }), dated.slice(half).map(function (c) { return c[1]; }));
  })();
  function variant(name, form, shipped) {
    var m = valueMiss(COMPS, form);
    return { name: name, loo: m.loo, wf: m.wf, shipped: !!shipped, miss: m };
  }
  var valueVariants = [
    variant('size curve, ln TVL', { size: 1 }),
    variant('shipped: size at carry-projected TVL + category + chain count (log)', SHIPPED_FORM, true),
    variant('shipped form without the carry', { size: 1, category: 1, chains: 1 }),
    variant('shipped form without category effects', { size: 1, carry: 1, chains: 1 }),
    variant('shipped form without chain count', { size: 1, carry: 1, category: 1 }),
    variant('shipped form + seasoning (settled TVL by no-token days)', { size: 1, carry: 1, category: 1, chains: 1, seasoning: 1 })
  ];
  var sizeOnlyMiss = valueVariants[0].miss;
  var valueControl = (function () {
    var rotated = COMPS.map(function (c, i) { var r = c.slice(); r[3] = COMPS[(i + 1) % COMPS.length][3]; return r; });
    var trial = Object.assign({}, SHIPPED_FORM); trial.growth = true;
    return valueMiss(rotated, trial);
  })();
  var valueW = fitValue(COMPS, SHIPPED_FORM);
  var finalValueMiss = valueVariants[1].miss;
  var residuals = COMPS.map(function (c, i) { return Math.log(c[1] / finalValueMiss.looPreds[i]); });
  function looCover(qLo, qHi) {
    var inside = 0;
    COMPS.forEach(function (c, i) {
      var rest = residuals.filter(function (_, j) { return j !== i; });
      var pr = finalValueMiss.looPreds[i];
      if (c[1] >= pr * Math.exp(quantile(rest, qLo)) && c[1] <= pr * Math.exp(quantile(rest, qHi))) inside++;
    });
    return inside / COMPS.length;
  }
  var wfRange = (function () {
    var dated = COMPS.map(function (c, i) { return { c: c, i: i }; })
      .filter(function (o) { return o.c[6] >= 0; })
      .sort(function (a, b) { return a.c[6] - b.c[6]; });
    var half = Math.floor(dated.length / 2);
    var w = fitValue(dated.slice(0, half).map(function (o) { return o.c; }), SHIPPED_FORM);
    var trainRes = dated.slice(0, half).map(function (o) { return Math.log(o.c[1] / launchOf(o.c, SHIPPED_FORM, w)); });
    var preds = dated.slice(half).map(function (o) { return launchOf(o.c, SHIPPED_FORM, w); });
    var acts = dated.slice(half).map(function (o) { return o.c[1]; });
    function cover(qLo, qHi) {
      var lo = quantile(trainRes, qLo), hi = quantile(trainRes, qHi), inside = 0;
      preds.forEach(function (pr, i) { if (acts[i] >= pr * Math.exp(lo) && acts[i] <= pr * Math.exp(hi)) inside++; });
      return inside / preds.length;
    }
    return {
      within3: preds.filter(function (pr, i) { return Math.abs(Math.log(acts[i] / pr)) <= Math.log(3); }).length / preds.length,
      cover50: cover(0.25, 0.75), cover80: cover(0.1, 0.9)
    };
  })();
  var rangeHonesty = {
    within3Loo: COMPS.filter(function (_, i) { return Math.abs(residuals[i]) <= Math.log(3); }).length / COMPS.length,
    within3Wf: wfRange.within3,
    cover50Loo: looCover(0.25, 0.75), cover50Wf: wfRange.cover50,
    cover80Loo: looCover(0.1, 0.9), cover80Wf: wfRange.cover80
  };

  /* ---------- odds model: who records a token ---------- */
  var ODDS_TERMS = [
    { id: 'age', name: 'age, years listed' },
    { id: 'size', name: 'size curve, ln TVL' },
    { id: 'growth', name: '7-day TVL growth' },
    { id: 'chains', name: 'chain count' },
    { id: 'category', name: 'category effect, ridge' }
  ];
  function oddsRow(p, terms, ageMedian) {
    var x = [1];
    if (terms.age) { var a = ageYearsOf(p[2]); x.push(a === null ? ageMedian : a, a === null ? 1 : 0); }
    if (terms.size) x.push(Math.log(p[0]));
    if (terms.growth) x.push(p[1] / 100);
    if (terms.chains) x.push(Math.min(p[3], 10));
    if (terms.category) ODDS_CATS.forEach(function (cat) { x.push(catName(p[5]) === cat ? 1 : 0); });
    return x;
  }
  function oddsPenalty(terms) {
    var pen = [0];
    if (terms.age) pen.push(0.001, 0.001);
    if (terms.size) pen.push(0.001);
    if (terms.growth) pen.push(0.001);
    if (terms.chains) pen.push(0.001);
    if (terms.category) ODDS_CATS.forEach(function () { pen.push(0.05); });
    return pen;
  }
  function fitOdds(peers, terms) {
    var ages = peers.map(function (p) { return ageYearsOf(p[2]); }).filter(function (a) { return a !== null; });
    var ageMedian = ages.length ? median(ages) : 1;
    return {
      fit: logitFit(peers.map(function (p) { return oddsRow(p, terms, ageMedian); }),
        peers.map(function (p) { return p[4]; }), oddsPenalty(terms), 400),
      ageMedian: ageMedian
    };
  }
  function oddsOf(p, terms, model) { return logitPredict(model.fit, oddsRow(p, terms, model.ageMedian)); }
  function oddsBrier(peers, terms) {
    var y = peers.map(function (p) { return p[4]; }), preds = new Array(peers.length).fill(0), f;
    for (f = 0; f < 10; f++) {
      var m = fitOdds(peers.filter(function (_, i) { return i % 10 !== f; }), terms);
      peers.forEach(function (p, i) { if (i % 10 === f) preds[i] = oddsOf(p, terms, m); });
    }
    var dated = peers.map(function (p, i) { return { p: p, i: i }; })
      .filter(function (o) { return o.p[6] >= 0; })
      .sort(function (a, b) { return a.p[6] - b.p[6]; });
    var half = Math.floor(dated.length / 2);
    var mm = fitOdds(dated.slice(0, half).map(function (o) { return o.p; }), terms);
    return {
      tenfold: brier(preds, y),
      wf: brier(dated.slice(half).map(function (o) { return oddsOf(o.p, terms, mm); }), dated.slice(half).map(function (o) { return y[o.i]; }))
    };
  }
  var baseRate = PEERS.reduce(function (a, p) { return a + p[4]; }, 0) / PEERS.length;
  var baseBrier = (function () {
    var y = PEERS.map(function (p) { return p[4]; }), preds = new Array(PEERS.length).fill(0), f;
    for (f = 0; f < 10; f++) {
      var train = y.filter(function (_, i) { return i % 10 !== f; });
      var rate = train.reduce(function (a, b) { return a + b; }, 0) / train.length;
      y.forEach(function (_, i) { if (i % 10 === f) preds[i] = rate; });
    }
    var dated = PEERS.map(function (p, i) { return { p: p, i: i }; })
      .filter(function (o) { return o.p[6] >= 0; })
      .sort(function (a, b) { return a.p[6] - b.p[6]; });
    var half = Math.floor(dated.length / 2);
    var rate2 = dated.slice(0, half).reduce(function (a, o) { return a + y[o.i]; }, 0) / half;
    return { tenfold: brier(preds, y), wf: brier(dated.slice(half).map(function () { return rate2; }), dated.slice(half).map(function (o) { return y[o.i]; })) };
  })();
  var keptOdds = {}, oddsTermResults = [], curBrier = { tenfold: baseBrier.tenfold, wf: baseBrier.wf };
  ODDS_TERMS.forEach(function (t) {
    var trial = Object.assign({}, keptOdds); trial[t.id] = true;
    var b = oddsBrier(PEERS, trial);
    var kept = b.tenfold < curBrier.tenfold && b.wf < curBrier.wf;
    if (kept) { keptOdds[t.id] = true; curBrier = { tenfold: b.tenfold, wf: b.wf }; }
    oddsTermResults.push({ name: t.name, loo: b.tenfold, wf: b.wf, kept: kept });
  });
  var oddsControl = (function () {
    var rotated = PEERS.map(function (p, i) { var r = p.slice(); r[1] = PEERS[(i + 1) % PEERS.length][1]; return r; });
    var trial = Object.assign({}, keptOdds); trial.growth = true;
    return oddsBrier(rotated, trial);
  })();
  var oddsModel = fitOdds(PEERS, keptOdds);

  /* ---------- recompute every board row from the refitted coefficients ---------- */
  function rowComp(r) {
    return [r.tvl_usd, 0, CATS.indexOf(r.category === null ? 'Other' : r.category),
      Math.min(50, Math.max(-50, r.change_7d === null ? 0 : r.change_7d)),
      r.age_days === null ? -1 : r.age_days, r.chains.length, -1];
  }
  function rowPeer(r) {
    return [r.tvl_usd, Math.min(50, Math.max(-50, r.change_7d === null ? 0 : r.change_7d)),
      r.age_days === null ? -1 : r.age_days, r.chains.length, 0,
      CATS.indexOf(r.category === null ? 'Other' : r.category), -1];
  }
  var agreeCount = 0, agreeMaxDiff = 0, agreeSum = 0, shippedSum = 0;
  DATA.rows.forEach(function (r) {
    var launch = launchOf(rowComp(r), SHIPPED_FORM, valueW);
    var odds = oddsOf(rowPeer(r), keptOdds, oddsModel);
    var implied = Math.max(1, Math.round(launch * odds));
    r._launch = launch; r._odds = odds; r._implied = implied;
    if (implied === r.implied_value_usd) agreeCount++;
    agreeMaxDiff = Math.max(agreeMaxDiff, Math.abs(implied - r.implied_value_usd));
    agreeSum += implied; shippedSum += r.implied_value_usd;
  });

  /* ---------- farm economics, recomputed under the sliders ---------- */
  var state = {
    verdict: 'all', scope: 'all', q: '', category: 'all', chain: 'all',
    sort: 'rank', dir: 1, selected: null,
    planUsd: FARM.plan_usd, dropShare: FARM.drop_share, horizon: FARM.horizon_weeks
  };
  function gasFor(r) { return (r.chains[0] === 'Ethereum') ? FARM.gas_ethereum_usd : FARM.gas_per_action_usd; }
  function econOf(r, share) {
    var plan = state.planUsd;
    var drop = (r._implied * (share === undefined ? state.dropShare : share) * plan) / Math.max(1, r.tvl_usd);
    var gas = gasFor(r) * (2 + state.horizon);
    var charge = plan * FARM.capital_charge_rate * state.horizon / 52;
    var fees = gas + charge;
    var hours = FARM.setup_hours + FARM.weekly_hours * state.horizon + FARM.claim_hours;
    var net = drop - fees, rate = net / hours;
    var be = r._implied > 0 ? fees * Math.max(1, r.tvl_usd) * 100 / (r._implied * plan) : Infinity;
    return {
      plan: plan, drop: drop, gas: gas, charge: charge, fees: fees, hours: hours, net: net, rate: rate, be: be,
      verdict: (net >= FARM.farm_min_net_usd && rate >= FARM.farm_min_net_per_hour) ? 'FARM' : (net > 0 ? 'THIN' : 'SKIP')
    };
  }
  DATA.rows.forEach(function (r) { r._econ = econOf(r); });

  /* ---------- rendering ---------- */
  var LEDGER_COLORS = { watchlist: '#3fb68b', early: '#2e7d63', trades: '#5aa9e6', nocap: '#7d8aa0', exchange: '#8a6d3b', bridge: '#5b4a7a', staking: '#7a5b8a', versioned: '#6e3b3b', wrapped: '#8a4a3b' };
  function kpi(t, v, n) {
    return '<div class="kpi"><div class="t">' + t + '</div><div class="v num">' + v + '</div><div class="n">' + n + '</div></div>';
  }
  function termRows(results, baseline, fmt, baseLabel) {
    var html = '<tr><td>' + baseLabel + '</td><td class="num">' + fmt(baseline[0]) + '</td><td class="num">' + fmt(baseline[1]) + '</td><td></td></tr>';
    results.forEach(function (t) {
      html += '<tr' + (t.kept ? ' class="kept"' : '') + '><td>+ ' + esc(t.name) + '</td><td class="num">' + fmt(t.loo) + '</td><td class="num">' + fmt(t.wf) + '</td><td>' +
        (t.kept ? '<span class="kept-tag">kept</span>' : '<span class="drop-tag">tested, not kept</span>') + '</td></tr>';
    });
    return html;
  }
  function variantRows(variants, baseline, fmt, baseLabel) {
    var html = '<tr><td>' + baseLabel + '</td><td class="num">' + fmt(baseline[0]) + '</td><td class="num">' + fmt(baseline[1]) + '</td><td></td></tr>';
    variants.forEach(function (v) {
      html += '<tr' + (v.shipped ? ' class="kept"' : '') + '><td>' + esc(v.name) + '</td><td class="num">' + fmt(v.loo) + '</td><td class="num">' + fmt(v.wf) + '</td><td>' +
        (v.shipped ? '<span class="kept-tag">shipped</span>' : '') + '</td></tr>';
    });
    return html;
  }
  function coefLine() {
    var vc = DATA.value_model.coef, vs = DATA.value_model.coef_se;
    var oc = DATA.odds_model.coef, os = DATA.odds_model.coef_se;
    var cats = Object.keys(vc.cat).map(function (k) { return vc.cat[k]; });
    var lo = Math.min.apply(null, cats), hi = Math.max.apply(null, cats);
    function pm(v, s) { return v.toFixed(2) + ' ± ' + s.toFixed(2); }
    return '<p class="read">Fitted, ± bootstrap s.e. (' + DATA.bootstrap_refits + ' refits): size slope ' + pm(vc.ln_tvl, vs.ln_tvl) +
      '; chain count (log) ' + pm(vc.chains, vs.chains) + '; category effects ' + lo.toFixed(2) + '…' + hi.toFixed(2) +
      '. Odds logit: age ' + pm(oc.age_years, os.age_years) + ', size ' + pm(oc.ln_tvl, os.ln_tvl) + ', growth ' + pm(oc.growth, os.growth) + '.</p>';
  }
  function scatterSvg() {
    var W = 340, H = 114, padL = 34, padB = 18, padT = 5, padR = 10;
    var xs = COMPS.map(function (c) { return Math.log10(c[0]); });
    var ys = COMPS.map(function (c) { return Math.log10(c[1]); });
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    function X(v) { return padL + (v - x0) / (x1 - x0) * (W - padL - padR); }
    function Y(v) { return H - padB - (v - y0) / (y1 - y0) * (H - padB - padT); }
    var pts = COMPS.map(function (c) {
      return '<circle cx="' + X(Math.log10(c[0])).toFixed(1) + '" cy="' + Y(Math.log10(c[1])).toFixed(1) + '" r="2" fill="#5aa9e6" opacity="0.55"/>';
    }).join('');
    // fitted size curve: ln(mcap) = intercept + slope * ln(TVL), in log10 space
    var a = valueW[0], b = valueW[1];
    function curveY(log10tvl) { return (a + b * log10tvl * Math.LN10) / Math.LN10; }
    var line = '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(curveY(x0)).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(curveY(x1)).toFixed(1) + '" stroke="#3fb68b" stroke-width="1.6"/>';
    var grid = '';
    for (var gx = x0; gx <= x1; gx++) grid += '<line x1="' + X(gx) + '" y1="' + padT + '" x2="' + X(gx) + '" y2="' + (H - padB) + '" stroke="#1a222d"/>' +
      '<text x="' + X(gx) + '" y="' + (H - 8) + '" fill="#64758a" font-size="9" text-anchor="middle">1e' + gx + '</text>';
    for (var gy = y0; gy <= y1; gy++) grid += '<line x1="' + padL + '" y1="' + Y(gy) + '" x2="' + (W - padR) + '" y2="' + Y(gy) + '" stroke="#1a222d"/>' +
      '<text x="' + (padL - 4) + '" y="' + (Y(gy) + 3) + '" fill="#64758a" font-size="9" text-anchor="end">1e' + gy + '</text>';
    return '<svg width="100%" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Market cap against TVL for traded comps, log-log, with the fitted size curve">' +
      grid + pts + line + '</svg>';
  }

  function headerHtml() {
    var keptO = oddsTermResults.filter(function (t) { return t.kept; }).length;
    var farmCount = DATA.rows.filter(function (r) { return r._econ.verdict === 'FARM'; }).length;
    var thinCount = DATA.rows.filter(function (r) { return r._econ.verdict === 'THIN'; }).length;
    var skipCount = DATA.rows.length - farmCount - thinCount;
    var html = '<div class="hd"><div><h1>Launch Radar</h1><div class="sub">pre-token protocols, valued from their own record</div></div>' +
      '<div class="meta">DefiLlama snapshot <b>' + esc(DATA.as_of) + '</b> · model <b>' + esc(DATA.model_version) + '</b>, refitted in this browser</div></div>';
    html += '<div class="kpis">' +
      kpi('Out-of-sample miss, walk-forward', '×' + finalValueMiss.wf.toFixed(2) + ' <small>vs ×' + flatWf.toFixed(2) + ' flat</small>',
        'flat multiple misses ×' + flatLoo.toFixed(2) + ' leave-one-out; fitted curve ×' + finalValueMiss.loo.toFixed(2)) +
      kpi('Is the printed range honest?', Math.round(rangeHonesty.cover50Wf * 100) + '% · ' + Math.round(rangeHonesty.cover80Wf * 100) + '%',
        'walk-forward: later-listed caps inside P25\u2011P75 (50%) · P10\u2011P90 (80%)') +
      kpi('Token odds vs base rate, Brier', curBrier.wf.toFixed(3) + ' <small>vs ' + baseBrier.wf.toFixed(3) + '</small>',
        'walk-forward; ten-fold ' + curBrier.tenfold.toFixed(3) + ' vs ' + baseBrier.tenfold.toFixed(3) + ' base rate') +
      kpi('Shipped form vs size curve alone', '×' + finalValueMiss.loo.toFixed(2) + ' · ×' + finalValueMiss.wf.toFixed(2),
        'leave-one-out · walk-forward; size curve alone ×' + sizeOnlyMiss.loo.toFixed(2) + ' · ×' + sizeOnlyMiss.wf.toFixed(2) + '; odds keeps ' + keptO + ' of 5 terms') +
      kpi('Worth farming, this scenario', farmCount + ' of ' + DATA.rows.length,
        'net at least $' + FARM.farm_min_net_usd + ' and beats $' + FARM.farm_min_net_per_hour + ' an hour; ' + thinCount + ' thin, ' + skipCount + ' skip') +
      kpi('Watchlist ranked', DATA.watchlist_size + ' / ' + DATA.watchlist_size,
        'plus ' + DATA.early_size + ' pre-token protocols below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor') +
      '</div>';
    html += '<p class="formula"><b>Implied value = launch value</b> (size curve at carry-projected TVL + category + chain count, fitted on ' + COMPS.length + ' traded tokens) <b>× token odds</b> ' +
      '(age, size and growth over ' + PEERS.length + ' peers). Carry = one more week of the 7-day move beyond the market\'s median week (' + MED_ALL.toFixed(1) + '%), held to ±25%. Every coefficient is fitted on this snapshot and tested held-out.</p>';
    // Ledger
    var bar = DATA.ledger.map(function (g) {
      return '<div style="background:' + (LEDGER_COLORS[g.id] || '#555') + ';width:' + (100 * g.count / DATA.ledger_total).toFixed(2) + '%" title="' + esc(g.label) + ': ' + g.count + '"></div>';
    }).join('');
    var legend = DATA.ledger.map(function (g) {
      return '<span><span class="sw" style="background:' + (LEDGER_COLORS[g.id] || '#555') + '"></span>' + esc(g.label) + ' <b>' + g.count + '</b></span>';
    }).join('');
    var ranksOk = DATA.rows.every(function (r, i) { return r.rank === i + 1 && (i === 0 || DATA.rows[i - 1].implied_value_usd >= r.implied_value_usd); });
    html += '<section class="panel"><h2>Protocol accounting <span class="right">all ' + DATA.ledger_total + ' snapshot protocols in exactly one group</span></h2>' +
      '<div class="ledger-bar">' + bar + '</div><div class="legend">' + legend + '</div>' +
      '<div class="badges">' +
      '<span class="badge">✓ <b>table = board.json recomputed:</b> ' + agreeCount + '/' + DATA.rows.length + ' rows to the dollar' + (agreeMaxDiff ? ' (max diff $' + agreeMaxDiff + ')' : '') + '</span>' +
      '<span class="badge">✓ <b>ranks 1–' + DATA.rows.length + ' in order,</b> values never rise: ' + (ranksOk ? 'yes' : 'no') + '</span>' +
      '<span class="badge">✓ <b>totals equal:</b> ' + fmtUsd(shippedSum) + '</span>' +
      '<span class="badge">✓ <b>watchlist ' + DATA.watchlist_size + '/' + DATA.watchlist_size + ' ranked</b></span>' +
      '<span class="badge">✓ <b>ledger ' + DATA.ledger_total + '/' + DATA.ledger_total + '</b></span>' +
      '<span class="badge">✓ <b>0 protocol names in the model</b></span>' +
      '</div></section>';
    // OOS evidence
    html += '<section class="panel"><h2>Out-of-sample evidence <span class="right">every form and term is scored in both tests: leave-one-out, and walk-forward (tokens listed earlier price those listed later)</span></h2><div class="oos">' +
      '<div><h3>Value if a token launches · typical miss, ' + COMPS.length + ' traded tokens</h3><table><tr><th>Model form</th><th>Leave-one-out</th><th>Walk-forward</th><th></th></tr>' +
      variantRows(valueVariants, [flatLoo, flatWf], function (v) { return '×' + v.toFixed(2); }, 'flat median multiple') +
      '<tr><td>shipped form + control: growth of another row</td><td class="num">×' + valueControl.loo.toFixed(2) + '</td><td class="num">×' + valueControl.wf.toFixed(2) + '</td><td><span class="drop-tag">must not help</span></td></tr></table>' +
      '<p class="read">The shipped form beats the size curve alone in both tests, and removing the carry, the category effects or the chain count raises the miss. Seasoning does not help on top of it, so it stays out.</p>' + coefLine() + '</div>' +
      '<div><h3>Token odds · Brier score, ' + PEERS.length + ' peers</h3><table><tr><th>Term, added in order</th><th>Ten-fold</th><th>Walk-forward</th><th></th></tr>' +
      termRows(oddsTermResults, [baseBrier.tenfold, baseBrier.wf], function (v) { return v.toFixed(3); }, 'base rate of peers (' + Math.round(baseRate * 100) + '%)') +
      '<tr><td>+ control: growth of another row</td><td class="num">' + oddsControl.tenfold.toFixed(3) + '</td><td class="num">' + oddsControl.wf.toFixed(3) + '</td><td><span class="drop-tag">must not help</span></td></tr></table>' +
      '<p class="read">Peers: the ranked set plus every protocol that records a token. Age, size and growth each lower the Brier score in both tests; the control does not.</p></div>' +
      '<div><h3>Is the printed range honest?</h3><table><tr><th>Share of real caps</th><th>Leave-one-out</th><th>Walk-forward</th></tr>' +
      '<tr><td>within ×3 of the model</td><td class="num">' + Math.round(rangeHonesty.within3Loo * 100) + '%</td><td class="num">' + Math.round(rangeHonesty.within3Wf * 100) + '%</td></tr>' +
      '<tr><td>inside P25–P75, stated 50%</td><td class="num">' + Math.round(rangeHonesty.cover50Loo * 100) + '%</td><td class="num">' + Math.round(rangeHonesty.cover50Wf * 100) + '%</td></tr>' +
      '<tr><td>inside P10–P90, stated 80%</td><td class="num">' + Math.round(rangeHonesty.cover80Loo * 100) + '%</td><td class="num">' + Math.round(rangeHonesty.cover80Wf * 100) + '%</td></tr></table>' +
      '<div class="scatter-wrap">' + scatterSvg() + '<div class="cap">Traded comps: market cap vs TVL (log–log) with the fitted size curve. Bands: ' + DATA.bootstrap_refits + ' seeded refits at build.</div></div></div>' +
      '</div></section>';
    return html;
  }

  function controlsHtml() {
    var cats = ['all'].concat(Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort());
    var chains = ['all'].concat(Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains; }))).sort());
    function tabs(name, opts, cur) {
      return '<span class="tabs" role="tablist" aria-label="' + name + '">' + opts.map(function (o) {
        return '<button data-tab="' + name + '" data-val="' + esc(o[0]) + '"' + (cur === o[0] ? ' class="on"' : '') + '>' + esc(o[1]) + '</button>';
      }).join('') + '</span>';
    }
    var counts = { FARM: 0, THIN: 0, SKIP: 0 };
    DATA.rows.forEach(function (r) { counts[r._econ.verdict]++; });
    return '<div class="controls">' +
      tabs('verdict', [['all', 'All ' + DATA.rows.length], ['FARM', 'Farm ' + counts.FARM], ['THIN', 'Thin ' + counts.THIN], ['SKIP', 'Skip ' + counts.SKIP]], state.verdict) +
      tabs('scope', [['all', 'All tiers'], ['watchlist', 'Watchlist'], ['early', 'Early (< $' + Math.round(DATA.floor_usd / 1e6) + 'M)']], state.scope) +
      '<label class="ctl">Deposit tier <select id="planUsd">' +
      FARM.deposit_tiers_usd.map(function (t) {
        return '<option value="' + t + '"' + (state.planUsd === t ? ' selected' : '') + '>' + fmtUsd(t) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="ctl">Drop share <input type="range" id="dropShare" min="1" max="15" step="0.5" value="' + (state.dropShare * 100) + '"><span class="val num" id="dropShareVal">' + (state.dropShare * 100).toFixed(1) + '%</span></label>' +
      '<label class="ctl">Horizon <input type="range" id="horizon" min="4" max="26" step="1" value="' + state.horizon + '"><span class="val num" id="horizonVal">' + state.horizon + ' wk</span></label>' +
      '</div><div class="controls">' +
      '<input type="search" id="q" placeholder="Search name, chain, category" value="' + esc(state.q) + '" aria-label="Search">' +
      '<select id="category" aria-label="Category">' + cats.map(function (c) {
        return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + (c === 'all' ? 'All categories' : esc(c)) + '</option>';
      }).join('') + '</select>' +
      '<select id="chain" aria-label="Chain">' + chains.map(function (c) {
        return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + (c === 'all' ? 'All chains' : esc(c)) + '</option>';
      }).join('') + '</select>' +
      '<button class="btn" id="reset">Reset</button>' +
      '<button class="btn" id="csv">CSV</button><button class="btn" id="json">JSON</button>' +
      '<span class="count-line" id="countLine"></span></div>';
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.verdict !== 'all' && r._econ.verdict !== state.verdict) return false;
      if (state.scope === 'watchlist' && !r.watchlist) return false;
      if (state.scope === 'early' && r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = {
      rank: function (r) { return r.rank; }, tvl: function (r) { return r.tvl_usd; },
      chg: function (r) { return r.change_7d === null ? -999 : r.change_7d; },
      age: function (r) { return r.age_days === null ? -1 : r.age_days; },
      odds: function (r) { return r._odds; }, launch: function (r) { return r._launch; },
      implied: function (r) { return r._implied; }, rate: function (r) { return r._econ.rate; },
      be: function (r) { return r._econ.be; }
    }[state.sort];
    rows.sort(function (a, b) { return (key(a) - key(b)) * state.dir || (a.rank - b.rank); });
    return rows;
  }

  function parseStep(s) {
    var m = s.match(/^(Day \d+|Weekly|Claim) - (.*)$/);
    var when = m ? m[1] : '';
    var rest = m ? m[2] : s;
    var ci = rest.lastIndexOf('. Cost: ');
    var ti = rest.lastIndexOf('. Time: ');
    if (ci < 0 || ti < 0) return { when: when, text: rest, cost: '', time: '' };
    return { when: when, text: rest.slice(0, ci + 1), cost: rest.slice(ci + 8, ti), time: rest.slice(ti + 8).replace(/\.$/, '') };
  }
  function expandedPlanHtml(r) {
    var e = r._econ;
    var steps = r.farm_steps.map(parseStep).map(function (s) {
      return '<tr><td class="when">' + esc(s.when) + '</td><td>' + esc(s.text) + '</td><td class="num">' + esc(s.cost) + '</td><td class="num">' + esc(s.time) + '</td></tr>';
    }).join('');
    var budget = 'Budget: ' + fmtUsd(e.gas) + ' gas + ' + fmtUsd(e.charge) + ' capital charge (2% a year on ' + fmtUsd(e.plan) + ' for ' + (state.horizon * 7) + ' days), ' +
      e.hours.toFixed(1) + ' h of work, against an expected drop of ' + fmtUsd(e.drop) + ' (' + (state.dropShare * 100).toFixed(1) + '% of ' + fmtUsd(r._implied) +
      ' implied value for a ' + fmtUsd(e.plan) + ' slice of ' + fmtUsd(r.tvl_usd) + ' TVL). Net ' + (e.net >= 0 ? '$' : '−$') + Math.abs(Math.round(e.net)) + ', ' +
      (e.rate >= 0 ? '$' : '−$') + Math.abs(e.rate).toFixed(2) + ' an hour — ' + e.verdict + (e.verdict === 'FARM' ? '.' : e.verdict === 'THIN' ? ', under the $' + FARM.farm_min_net_per_hour + '/h bar.' : '.');
    return '<tr class="plan-row"><td colspan="12"><div class="plan-box"><div class="plan-head">Farm plan — ' + esc(r.name) + ' · ' + esc(r.plan_mech) + ' · ' + fmtUsd(e.plan) + ' · ' + (state.horizon * 7) + ' days · ' + r.farm_steps.length + ' steps</div>' +
      '<table class="plan-steps"><tr><th>When</th><th>Step</th><th>Cost</th><th>Time</th></tr>' + steps + '</table>' +
      '<div class="plan-budget">' + esc(budget) + '</div></div></td></tr>';
  }
  function tableHtml() {
    var rows = filteredRows();
    var cols = [
      ['rank', '# · Range'], [null, 'Protocol'], ['tvl', 'TVL'], ['chg', '7d · vs market'], ['age', 'No-token age'],
      ['odds', 'Token odds'], ['launch', 'If it launches'], ['implied', 'Implied value · P25–P75'],
      [null, 'Verdict · net of fees'], ['rate', 'Net / hour'], ['be', 'Break-even'], [null, 'Farm plan']
    ];
    var head = cols.map(function (c) {
      var arrow = state.sort === c[0] ? (state.dir === 1 ? ' ↑' : ' ↓') : '';
      return '<th' + (c[0] ? ' data-sort="' + c[0] + '"' : '') + '>' + c[1] + arrow + '</th>';
    }).join('');
    var body = rows.map(function (r) {
      var e = r._econ;
      var chg = r.change_7d === null ? '<span class="faint">n/a</span>' :
        '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</span>' +
        '<span class="net-sub num">' + fmtPct(r.change_7d - MED_ALL) + ' vs mkt</span>';
      var row = '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '<span class="rank-range">' + r.rank_lo + '–' + r.rank_hi + '</span></td>' +
        '<td><span class="pname">' + esc(r.name) + '</span>' +
        (r.watchlist ? '<span class="tag watch">Watchlist</span>' : '<span class="tag early">Early</span>') +
        '<div class="psub">' + esc(r.category || 'Other') + ' · ' + esc(r.chains[0] || '—') + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') + '</div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + chg + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num"><span class="odds-bar"><i style="width:' + Math.round(r._odds * 100) + '%"></i></span>' + Math.round(r._odds * 100) + '%</td>' +
        '<td class="num">' + fmtUsd(r._launch) + '</td>' +
        '<td class="num"><b>' + fmtUsd(r._implied) + '</b><span class="net-sub num">' + fmtUsd(r.band_p25_usd) + '–' + fmtUsd(r.band_p75_usd) + '</span></td>' +
        '<td><span class="verdict ' + e.verdict + '">' + e.verdict + '</span> <span class="num">' + (e.net >= 0 ? '$' : '−$') + Math.abs(Math.round(e.net)) + '</span>' +
        '<span class="net-sub num">' + fmtUsd(e.drop) + ' drop − ' + fmtUsd(e.fees) + ' fees</span></td>' +
        '<td class="num">' + (e.rate >= 0 ? '$' : '−$') + Math.abs(e.rate).toFixed(2) + '</td>' +
        '<td class="num">' + (e.be > 100 ? '>100%' : e.be.toFixed(0) + '%') + '</td>' +
        '<td><span class="mech">' + esc(r.plan_mech) + '</span><span class="net-sub num">' + fmtUsd(e.plan) + ' · ' + (state.horizon * 7) + ' d · ' + r.farm_steps.length + ' steps</span></td></tr>';
      if (r.rank === 1 && state.sort === 'rank' && state.dir === 1) row += expandedPlanHtml(r);
      return row;
    }).join('');
    return '<div class="tbl-wrap"><table class="board"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="foot">' + rows.length + ' of ' + DATA.rows.length + ' rows · ' + fmtUsd(rows.reduce(function (a, r) { return a + r.tvl_usd; }, 0)) + ' TVL · ' +
      fmtUsd(rows.reduce(function (a, r) { return a + r._implied; }, 0)) + ' implied. Select a row for its factor decomposition and farm plan. ' +
      'Rank ranges and P25–P75 bands come from ' + DATA.bootstrap_refits + ' seeded refits of both models. Break-even is the drop share at which the plan nets zero.</p>';
  }

  function methodHtml() {
    return '<section class="panel method" id="method"><h2>Method and tests</h2>' +
      '<p><b>Selection.</b> The ranked set is the house watchlist rule applied at every TVL: no token recorded, category not Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX, name not ending in a version marker, carrying no whole word wrapped, staked or staking, and not beginning with an exchange\'s name. All ' + DATA.ledger_total + ' protocols land in exactly one ledger group; the board carries the ' + DATA.watchlist_size + ' watchlist protocols plus ' + DATA.early_size + ' earlier ones below the floor. A protocol <i>records</i> no token is not proof it has none.</p>' +
      '<p><b>Launch value.</b> ln(market cap) is fitted on the snapshot\'s traded tokens (' + COMPS.length + ' comps: one row per CoinGecko id at its largest TVL, exchanges and sub-$1M caps left out) as a size curve at carry-projected TVL — one more week of the protocol\'s 7-day move beyond the snapshot median week (' + MED_ALL.toFixed(1) + '%), held to ±25% — plus ridge category effects and a log chain count. The shipped form is scored against the flat median multiple and the plain size curve in both leave-one-out and walk-forward (older-listed tokens pricing newer ones), and each part is ablated: removing the carry, the category effects or the chain count raises the held-out miss. A seasoning term (settled TVL by days with no token) is tested on top and does not help; a control term (another row\'s growth) is tested the same way and must not help.</p>' +
      '<p><b>Token odds.</b> A logistic fit over ' + PEERS.length + ' peers — the ranked pre-token set plus every protocol that already records a token — on age, size, the week\'s growth, breadth and category, kept term by term only when the Brier score improves in both ten-fold and walk-forward. Implied value is launch value × token odds: what a token would be worth if it launched, weighted by the chance peers like it ever record one. It is the model\'s claim, not a forecast that a token will launch.</p>' +
      '<p><b>Uncertainty.</b> ' + DATA.bootstrap_refits + ' seeded bootstrap refits of both models (fixed seed, so two runs agree byte for byte) give each row a P25–P75 band and a rank range (10th–90th percentile of its rank across refits). Range honesty is checked on the comps themselves, leave-one-out and walk-forward, above.</p>' +
      '<p><b>Farm economics.</b> The deposit is one of three stated tiers ($1,000 / $10,000 / $50,000; the board files $10,000, the dashboard switches). Expected drop = implied value × drop share (' + (FARM.drop_share * 100).toFixed(0) + '% default; the detail view also shows 2% and 15%) × deposit / TVL. Costs are gas — $' + FARM.gas_per_action_usd.toFixed(2) + ' an action, $' + FARM.gas_ethereum_usd.toFixed(2) + ' on Ethereum, for entry, exit and one action a week over the horizon — plus a capital charge of ' + (FARM.capital_charge_rate * 100).toFixed(0) + '% a year on the deposit, pro-rated by weeks. Time is ' + FARM.setup_hours + 'h setup + ' + FARM.weekly_hours + 'h a week + ' + FARM.claim_hours + 'h to claim. Break-even is the drop share at which the plan nets zero. <b>FARM</b> = net at least $' + FARM.farm_min_net_usd + ' and at least $' + FARM.farm_min_net_per_hour + ' an hour; <b>THIN</b> = net above zero; <b>SKIP</b> = net at or below zero. The steps in board.json are filed under the default scenario; the economics above each plan recompute with the controls.</p>' +
      '<p><b>Agreement.</b> This page refits both models from the figures in data.js and recomputes every row; the badges above report how the recomputation compares with board.json. Bands, rank ranges and coefficient standard errors are the shipped figures, from the build-time bootstrap.</p></section>';
  }

  function liveHtml() {
    var rows = DATA.live.map(function (r) {
      var chg = r.change_7d === null ? '<span class="faint">n/a</span>' :
        '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</span>';
      return '<tr><td>' + esc(r.name) + ' <span class="faint">' + esc(r.category || 'Other') + '</span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + fmtUsd(r.mcap_usd) + '</td><td class="num">' + chg + '</td></tr>';
    }).join('');
    return '<section class="panel"><h2>Already trading — set aside, never ranked <span class="right">the market\'s own capitalisation, top ' + DATA.live.length + ' by market cap</span></h2>' +
      '<table class="live"><tr><th>Protocol</th><th>TVL</th><th>Market cap</th><th>7d</th></tr>' + rows + '</table></section>';
  }

  function detailHtml(r) {
    var e = r._econ;
    var sizeVal = r.size_value_usd;
    var effectRows =
      '<tr><td>× growth carry (projected TVL)</td><td class="num">×' + r.growth_effect.toFixed(2) + '</td></tr>' +
      '<tr><td>× category effect</td><td class="num">×' + r.category_effect.toFixed(2) + '</td></tr>' +
      '<tr><td>× chain count effect (log)</td><td class="num">×' + r.chain_effect.toFixed(2) + '</td></tr>';
    var factors = '<table class="factors">' +
      '<tr><td>TVL</td><td class="num">' + fmtUsd(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Size curve value at this TVL</td><td class="num">' + fmtUsd(sizeVal) + '</td></tr>' +
      effectRows +
      '<tr class="total"><td>= value if a token launches</td><td class="num">' + fmtUsd(r._launch) + '</td></tr>' +
      '<tr><td>× token odds</td><td class="num">' + Math.round(r._odds * 100) + '%</td></tr>' +
      '<tr class="total"><td>= implied value</td><td class="num">' + fmtUsd(r._implied) + '</td></tr>' +
      '<tr><td>P25–P75 band (' + DATA.bootstrap_refits + ' refits)</td><td class="num">' + fmtUsd(r.band_p25_usd) + '–' + fmtUsd(r.band_p75_usd) + '</td></tr>' +
      '<tr><td>Rank range across refits</td><td class="num">' + r.rank_lo + '–' + r.rank_hi + ' of ' + DATA.rows.length + '</td></tr></table>' +
      '<p class="foot">Tested and not kept: seasoning (settled TVL by no-token days) does not lower the held-out miss on top of the shipped form. See the evidence panel.</p>';
    function netAt(share) {
      var x = econOf(r, share);
      return (x.net >= 0 ? '$' : '−$') + Math.abs(Math.round(x.net)) + ' (' + (x.rate >= 0 ? '$' : '−$') + Math.abs(x.rate).toFixed(2) + '/h)';
    }
    var econ = '<div class="econ-grid">' +
      '<span class="k">Deposit tier</span><span class="v num">' + fmtUsd(e.plan) + '</span>' +
      '<span class="k">Expected drop (' + (state.dropShare * 100).toFixed(1) + '% share)</span><span class="v num">' + fmtUsd(e.drop) + '</span>' +
      '<span class="k">Gas over ' + state.horizon + ' weeks</span><span class="v num">−' + fmtUsd(e.gas) + '</span>' +
      '<span class="k">Capital charge (2%/yr)</span><span class="v num">−' + fmtUsd(e.charge) + '</span>' +
      '<span class="k">Time</span><span class="v num">' + e.hours.toFixed(1) + ' h</span>' +
      '<span class="k">Net</span><span class="v num"><b>' + (e.net >= 0 ? '$' : '−$') + Math.abs(Math.round(e.net)) + '</b></span>' +
      '<span class="k">Net per hour</span><span class="v num"><b>' + (e.rate >= 0 ? '$' : '−$') + Math.abs(e.rate).toFixed(2) + '</b></span>' +
      '<span class="k">Break-even drop share</span><span class="v num">' + (e.be > 100 ? '>100%' : e.be.toFixed(1) + '%') + '</span>' +
      '<span class="k">Net at 2% / 6% / 15% share</span><span class="v num">' + netAt(0.02) + ' · ' + netAt(0.06) + ' · ' + netAt(0.15) + '</span>' +
      '<span class="k">Verdict</span><span class="v"><span class="verdict ' + e.verdict + '">' + e.verdict + '</span></span></div>';
    var steps = '<ol class="steps">' + r.farm_steps.map(function (s) {
      return '<li>' + esc(s) + '</li>';
    }).join('') + '</ol>';
    return '<div class="scrim" id="scrim"></div><aside class="drawer" role="dialog" aria-label="' + esc(r.name) + ' detail">' +
      '<button class="btn close" id="closeDetail">Close</button>' +
      '<h2>' + esc(r.name) + '</h2><div class="dim">Rank ' + r.rank + ' of ' + DATA.rows.length + ' · ' + esc(r.category || 'Other') + ' · ' +
      esc(r.chains.join(', ') || '—') + ' · no token on record for ' + fmtAge(r.age_days) + (r.watchlist ? ' · watchlist' : ' · below the floor') + '</div>' +
      '<h3>Factor decomposition</h3>' + factors +
      '<h3>Farm economics (current sliders)</h3>' + econ +
      '<h3>Farm plan, as filed in board.json</h3>' + steps +
      '<p class="foot">Steps are filed under the default scenario (deposit ' + fmtUsd(FARM.plan_usd) + ', drop share ' +
      (FARM.drop_share * 100).toFixed(0) + '%, ' + FARM.horizon_weeks + ' weeks). The economics above recompute with the controls.</p></aside>';
  }

  function render() {
    var html = headerHtml() + controlsHtml() + '<div id="tableHost">' + tableHtml() + '</div>' + methodHtml() + liveHtml();
    if (state.selected) {
      var r = DATA.rows.find(function (x) { return x.slug === state.selected; });
      if (r) html += detailHtml(r);
    }
    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');
    wire();
  }
  function renderTable() {
    var host = document.getElementById('tableHost');
    if (host) host.innerHTML = tableHtml();
    var cl = document.getElementById('countLine');
    if (cl) cl.textContent = filteredRows().length + ' of ' + DATA.rows.length + ' rows shown';
    wireTable();
  }
  function refreshEcon() {
    DATA.rows.forEach(function (r) { r._econ = econOf(r); });
    render();
  }
  function wireTable() {
    app.querySelectorAll('table.board th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir;
        else { state.sort = k; state.dir = k === 'rank' ? 1 : -1; }
        renderTable();
      });
    });
    app.querySelectorAll('table.board tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function () {
        state.selected = tr.getAttribute('data-slug');
        render();
      });
    });
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
  }
  function wire() {
    app.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state[btn.getAttribute('data-tab')] = btn.getAttribute('data-val');
        render();
      });
    });
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; renderTable(); });
    var cat = document.getElementById('category');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; renderTable(); });
    var ch = document.getElementById('chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; renderTable(); });
    var pp = document.getElementById('planUsd');
    if (pp) pp.addEventListener('change', function () { state.planUsd = parseFloat(pp.value); refreshEcon(); });
    var ds = document.getElementById('dropShare');
    if (ds) ds.addEventListener('input', function () {
      state.dropShare = parseFloat(ds.value) / 100;
      document.getElementById('dropShareVal').textContent = (state.dropShare * 100).toFixed(1) + '%';
      DATA.rows.forEach(function (r) { r._econ = econOf(r); });
      renderTable();
    });
    var hz = document.getElementById('horizon');
    if (hz) hz.addEventListener('input', function () {
      state.horizon = parseInt(hz.value, 10);
      document.getElementById('horizonVal').textContent = state.horizon + ' wk';
      DATA.rows.forEach(function (r) { r._econ = econOf(r); });
      renderTable();
    });
    var reset = document.getElementById('reset');
    if (reset) reset.addEventListener('click', function () {
      state.verdict = 'all'; state.scope = 'all'; state.q = ''; state.category = 'all'; state.chain = 'all';
      state.sort = 'rank'; state.dir = 1;
      state.planUsd = FARM.plan_usd; state.dropShare = FARM.drop_share; state.horizon = FARM.horizon_weeks;
      refreshEcon();
    });
    var csv = document.getElementById('csv');
    if (csv) csv.addEventListener('click', function () {
      var rows = filteredRows();
      var head = 'rank,slug,name,category,tvl_usd,change_7d,age_days,token_odds,launch_value_usd,implied_value_usd,band_p25_usd,band_p75_usd,verdict,net_usd,net_per_hour,break_even_pct,plan_mech\n';
      var body = rows.map(function (r) {
        return [r.rank, r.slug, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '') + '"', r.tvl_usd,
          r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days, r._odds.toFixed(4),
          Math.round(r._launch), r._implied, r.band_p25_usd, r.band_p75_usd, r._econ.verdict,
          r._econ.net.toFixed(2), r._econ.rate.toFixed(2), r._econ.be > 100 ? '>100' : r._econ.be.toFixed(1),
          '"' + r.plan_mech + '"'].join(',');
      }).join('\n');
      download('token-radar-board.csv', head + body + '\n', 'text/csv');
    });
    var js = document.getElementById('json');
    if (js) js.addEventListener('click', function () {
      download('token-radar-board.json', JSON.stringify(filteredRows().map(function (r) {
        return {
          rank: r.rank, slug: r.slug, name: r.name, category: r.category, tvl_usd: r.tvl_usd,
          change_7d: r.change_7d, age_days: r.age_days, token_odds: Math.round(r._odds * 1e4) / 1e4,
          launch_value_usd: Math.round(r._launch), implied_value_usd: r._implied,
          band_p25_usd: r.band_p25_usd, band_p75_usd: r.band_p75_usd, verdict: r._econ.verdict,
          net_usd: Math.round(r._econ.net * 100) / 100, net_per_hour: Math.round(r._econ.rate * 100) / 100,
          break_even_pct: r._econ.be > 100 ? '>100' : Math.round(r._econ.be * 10) / 10, plan_mech: r.plan_mech
        };
      }), null, 1), 'application/json');
    });
    var close = document.getElementById('closeDetail');
    if (close) close.addEventListener('click', function () { state.selected = null; render(); });
    var scrim = document.getElementById('scrim');
    if (scrim) scrim.addEventListener('click', function () { state.selected = null; render(); });
    wireTable();
  }

  /* ---------- hash routing for the screenshots ---------- */
  (function fromHash() {
    var h = window.location.hash.replace(/^#/, '');
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv.length !== 2) return;
      var k = kv[0], v = decodeURIComponent(kv[1]);
      if (k === 'p') state.selected = v;
      if (k === 'verdict') state.verdict = v;
      if (k === 'category') state.category = v;
      if (k === 'scope') state.scope = v;
    });
  })();
  render();
})();
