// 라오어 무한매수법 백테스트 엔진 + UI
'use strict';

let priceData = []; // [{date, o, h, l, c}]
let lastResult = null;

// ---------- 유틸 ----------
const round2 = (n) => Math.round(n * 100) / 100;
let CUR = '$'; // 현재 통화 심볼 (한국 종목은 '₩')
const KRW_TICKERS = new Set(['KODEX200', 'KODEXLEV', 'KODEXKQ', 'KODEXKQLEV', 'SAMSUNG', 'HYNIX', 'HYUNDAI']);
const fmtUSD = (n) => CUR === '₩'
  ? '₩' + Math.round(n).toLocaleString('ko-KR')
  : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

// 기준금리 스케줄에서 특정일의 적용 금리(연 %)
function rateAt(schedule, dateStr) {
  if (!schedule || schedule.length === 0) return null;
  let r = schedule[0][1];
  for (let i = 0; i < schedule.length && schedule[i][0] <= dateStr; i++) r = schedule[i][1];
  return r;
}

// 자본금을 기준금리로 일할 복리 운용한 자산곡선
function buildRateCurve(schedule, data, budget) {
  if (!schedule || schedule.length === 0 || data.length === 0) return null;
  const curve = [budget];
  let val = budget, si = 0;
  while (si + 1 < schedule.length && schedule[si + 1][0] <= data[0].date) si++;
  for (let i = 1; i < data.length; i++) {
    while (si + 1 < schedule.length && schedule[si + 1][0] <= data[i].date) si++;
    const r = schedule[si][1] / 100;
    const dt = (new Date(data[i].date) - new Date(data[i - 1].date)) / 864e5 / 365;
    val *= (1 + r * dt);
    curve.push(val);
  }
  return curve;
}

// ---------- 데이터 파싱 ----------
// 다양한 CSV 형식 지원: "날짜,종가" 또는 "날짜,시가,고가,저가,종가(,...)"
// yfinance 헤더/추가컬럼 자동 무시. 날짜는 YYYY-MM-DD / YYYY/MM/DD / MM/DD/YYYY 인식.
function parseData(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const parts = line.split(/[,\t;]+/).map(s => s.trim()).filter(s => s !== '');
    if (parts.length < 2) continue;

    const date = normalizeDate(parts[0]);
    if (!date) continue; // 헤더/날짜 아님 → 스킵

    const nums = [];
    for (let i = 1; i < parts.length; i++) {
      const v = parseFloat(parts[i].replace(/[^0-9.\-]/g, ''));
      if (!isNaN(v)) nums.push(v);
    }
    if (nums.length === 0) continue;

    let o, h, l, c;
    if (nums.length >= 4) {
      // 시가,고가,저가,종가 (Volume/AdjClose 등은 무시)
      [o, h, l, c] = nums;
    } else {
      // 종가만
      c = nums[nums.length - 1];
      o = h = l = c;
    }
    if (c > 0) rows.push({ date, o, h, l, c });
  }
  // 날짜 오름차순 정렬 + 중복 제거
  rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const seen = new Set();
  return rows.filter(r => { if (seen.has(r.date)) return false; seen.add(r.date); return true; });
}

function normalizeDate(s) {
  s = s.replace(/["']/g, '').trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) {
    return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

function setData(rows, sourceLabel) {
  // 방어: 가격이 0 이하이거나 유효하지 않은 행 제거 (불량 데이터 대비)
  priceData = rows.filter(r => r.c > 0 && r.o > 0 && r.h > 0 && r.l > 0);
  const status = document.getElementById('data-status');
  if (rows.length === 0) {
    status.textContent = '데이터 인식 실패';
    status.style.color = 'var(--danger)';
    return;
  }
  status.textContent = `${sourceLabel} · ${rows.length}개 (${rows[0].date} ~ ${rows[rows.length - 1].date})`;
  status.style.color = 'var(--success)';
  // 기간 슬라이더 범위 갱신 (전체 선택)
  const sr = document.getElementById('start-range');
  const er = document.getElementById('end-range');
  sr.min = 0; sr.max = rows.length - 1; sr.value = 0;
  er.min = 0; er.max = rows.length - 1; er.value = rows.length - 1;
  updatePeriodLabel();
  updateSeedHint();
  // 데이터가 준비되면 즉시 백테스트 실행
  runBacktest();
}

function updatePeriodLabel() {
  const label = document.getElementById('period-label');
  if (priceData.length === 0) { label.textContent = '데이터를 먼저 불러오세요'; return; }
  let si = parseInt(document.getElementById('start-range').value);
  let ei = parseInt(document.getElementById('end-range').value);
  if (si > ei) { const t = si; si = ei; ei = t; }
  const days = ei - si + 1;
  label.textContent = `${priceData[si].date} ~ ${priceData[ei].date}  (${days}거래일)`;
}

// 내장 종목 목록 (data/<심볼>.js 로 지연 로딩)
const TICKERS = [
  { s: 'SOXL', n: 'SOXL · 반도체 3배 레버리지' },
  { s: 'TQQQ', n: 'TQQQ · 나스닥100 3배 레버리지' },
  { s: 'BULZ', n: 'BULZ · FANG+ 3배 레버리지' },
  { s: 'QLD',  n: 'QLD · 나스닥100 2배 레버리지' },
  { s: 'UPRO', n: 'UPRO · S&P500 3배 레버리지' },
  { s: 'SSO',  n: 'SSO · S&P500 2배 레버리지' },
  { s: 'QQQ',  n: 'QQQ · 나스닥100' },
  { s: 'QQQM', n: 'QQQM · 나스닥100(저보수)' },
  { s: 'SOXX', n: 'SOXX · 반도체' },
  { s: 'SPY',  n: 'SPY · S&P500' },
  { s: 'SPYM', n: 'SPYM · S&P500(포트폴리오)' },
  { s: 'SCHD', n: 'SCHD · 배당성장' },
  { s: 'JEPQ', n: 'JEPQ · 나스닥 커버드콜' },
  { s: 'AAPL', n: 'AAPL · 애플' },
  { s: 'MSFT', n: 'MSFT · 마이크로소프트' },
  { s: 'GOOGL',n: 'GOOGL · 구글(알파벳)' },
  { s: 'AMZN', n: 'AMZN · 아마존' },
  { s: 'TSLA', n: 'TSLA · 테슬라' },
  { s: 'INTC', n: 'INTC · 인텔' },
  { s: 'KO',   n: 'KO · 코카콜라' },
  { s: 'KODEX200',   n: '─ 한국 ─ KODEX 200 · 코스피200 (₩)' },
  { s: 'KODEXLEV',   n: 'KODEX 레버리지 · 코스피 2배 (₩)' },
  { s: 'KODEXKQ',    n: 'KODEX 코스닥150 (₩)' },
  { s: 'KODEXKQLEV', n: 'KODEX 코스닥150 레버리지 · 2배 (₩)' },
  { s: 'SAMSUNG',    n: '삼성전자 (₩)' },
  { s: 'HYNIX',      n: 'SK하이닉스 (₩)' },
  { s: 'HYUNDAI',    n: '현대차 (₩)' },
];
const loadedScripts = {}; // 심볼별 로딩 캐시

function initTickerSelect() {
  const sel = document.getElementById('ticker-select');
  sel.innerHTML = TICKERS.map(t => `<option value="${t.s}">${t.n}</option>`).join('');
}

// 통화별 자본금 슬라이더 범위 (미국 종목은 달러, 한국 종목은 원화 기준)
const BUDGET_RANGE = {
  '$': { min: 1000,    max: 200000,    step: 1000,    def: 10000 },
  '₩': { min: 1000000, max: 300000000, step: 1000000, def: 10000000 },
};

function updateBudgetRange(prevCur) {
  const cfg = BUDGET_RANGE[CUR];
  const num = document.getElementById('budget');
  const range = document.getElementById('budget-range');
  range.min = cfg.min; range.max = cfg.max; range.step = cfg.step;
  num.min = cfg.min; num.step = cfg.step;
  // 통화가 바뀐 경우에만 기본 시드로 초기화 (같은 통화 내 종목 변경은 유지)
  if (prevCur !== CUR) { num.value = cfg.def; range.value = cfg.def; }
  const label = document.getElementById('budget-label');
  if (label) label.textContent = `자본금 (시드, ${CUR})`;
}

function loadTicker() {
  const sel = document.getElementById('ticker-select');
  const tk = sel.value;
  const status = document.getElementById('data-status');

  const apply = () => {
    const arr = window.SAMPLE_DATA && window.SAMPLE_DATA[tk];
    if (!arr) { status.textContent = `${tk} 데이터 로드 실패`; status.style.color = 'var(--danger)'; return; }
    const prevCur = CUR;
    CUR = KRW_TICKERS.has(tk) ? '₩' : '$';
    updateBudgetRange(prevCur);
    const rows = arr.map(r => ({ date: r[0], o: r[1], h: r[2], l: r[3], c: r[4] }));
    setData(rows, tk);
    const di = document.getElementById('data-input');
    if (di) di.value = '';
  };

  if (window.SAMPLE_DATA && window.SAMPLE_DATA[tk]) { apply(); return; }

  status.textContent = `${tk} 불러오는 중...`;
  status.style.color = 'var(--text-dim)';
  const script = document.createElement('script');
  script.src = `../data/laor-history/${tk}.js`;
  script.onload = apply;
  script.onerror = () => { status.textContent = `data/laor-history/${tk}.js 파일을 찾을 수 없습니다.`; status.style.color = 'var(--danger)'; };
  document.head.appendChild(script);
}

// ---------- 슬라이더 동기화 + 실시간 실행 ----------
let runTimer = null;
function scheduleRun() {
  updateSeedHint();
  if (priceData.length === 0) return;
  clearTimeout(runTimer);
  runTimer = setTimeout(runBacktest, 120); // 조작 멈춘 뒤 120ms 후 자동 실행
}

// 추천 시드 계산: 0.5회 분할매수도 최소 1주 이상 → 시드 ≥ 2 × N × 현재가
function updateSeedHint() {
  const el = document.getElementById('seed-hint');
  if (!el) return;
  if (priceData.length === 0) { el.innerHTML = ''; return; }
  const N = parseInt(document.getElementById('days').value) || 40;
  const budget = parseFloat(document.getElementById('budget').value) || 0;
  const price = priceData[priceData.length - 1].c; // 최근 종가(현재가) 기준
  const minSeed = Math.ceil(2 * N * price);   // 0.5회가 최소 1주
  const goodSeed = Math.ceil(5 * N * price);  // 1회당 ~5주 (여유 운용)
  const ok = budget >= minSeed;
  el.innerHTML =
    `💡 추천 시드 <b>${fmtUSD(minSeed)}</b> 이상 · 여유 <b>${fmtUSD(goodSeed)}</b> ` +
    `<span style="opacity:.75">(현재가 ${fmtUSD(price)} · ${N}분할 · 0.5회 1주 기준)</span> ` +
    (ok
      ? `<span style="color:var(--success)">✓ 현재 시드 충분</span>`
      : `<span style="color:var(--danger)">⚠ 현재 시드 부족 — 분할매수가 0주로 반올림될 수 있음</span>`);
}

// ---------- 최적 파라미터 탐색 (자본금·기간 고정, N×R 그리드) ----------
const OPT_N = [10, 15, 20, 25, 30, 40, 50, 60];
const OPT_R = [5, 7, 10, 12, 15, 20, 25, 30];

function optimizeParams() {
  if (priceData.length === 0) { alert('먼저 종목 데이터를 선택하세요.'); return; }
  const budget = parseFloat(document.getElementById('budget').value) || 0;
  const quarterStop = document.getElementById('quarter-stop').value === 'on';
  let si = parseInt(document.getElementById('start-range').value) || 0;
  let ei = parseInt(document.getElementById('end-range').value);
  if (isNaN(ei)) ei = priceData.length - 1;
  if (si > ei) { const t = si; si = ei; ei = t; }
  const data = priceData.slice(si, ei + 1);
  if (data.length < 30) { alert('선택한 기간이 너무 짧습니다.'); return; }

  const out = document.getElementById('optimize-result');
  out.innerHTML = `<div style="padding:16px;color:var(--text-dim)">계산 중... (${OPT_N.length * OPT_R.length}개 조합)</div>`;

  setTimeout(() => {
    const results = [];
    for (const N of OPT_N) for (const R of OPT_R) results.push(metricsFor(data, budget, N, R, quarterStop));

    const bestRet = results.reduce((a, b) => b.totalReturn > a.totalReturn ? b : a);
    // 위험조정 최고: 실제 사이클이 도는(참여하는) 조합 중에서
    const cand = results.filter(r => r.cycles >= 2 && r.totalReturn > 0);
    const bestCal = (cand.length ? cand : results).reduce((a, b) => b.calmar > a.calmar ? b : a);

    const maxAbs = Math.max(1, ...results.map(r => Math.abs(r.totalReturn)));
    const colorFor = (v) => {
      const t = Math.min(1, Math.abs(v) / maxAbs);
      return v >= 0 ? `rgba(63,185,80,${(0.12 + 0.6 * t).toFixed(3)})` : `rgba(248,81,73,${(0.12 + 0.6 * t).toFixed(3)})`;
    };

    const pick = (m, label) => `
      <div class="opt-pick" onclick="applyParams(${m.N},${m.R})">
        <div class="op-label">${label}</div>
        <div class="op-main">N ${m.N} · R ${m.R}%</div>
        <div class="op-sub">수익 ${fmtPct(m.totalReturn)} · CAGR ${fmtPct(m.cagr)} · MDD ${m.mdd.toFixed(1)}% · ${m.cycles}사이클</div>
      </div>`;

    let html = `<div class="opt-picks">${pick(bestRet, '🏆 최고 수익률')}${pick(bestCal, '🛡️ 최고 위험조정 (수익÷MDD)')}</div>`;
    html += `<p class="opt-hint">칸을 클릭하면 해당 N·R이 설정에 적용되고 다시 계산됩니다. 숫자=총수익률(%), 초록=이익·빨강=손실. 금테=최고수익, 청테=최고위험조정.</p>`;
    html += `<div class="hm-wrap"><table class="heatmap"><tr><th>N＼R</th>${OPT_R.map(R => `<th>${R}%</th>`).join('')}</tr>`;
    for (const N of OPT_N) {
      html += `<tr><th>${N}</th>`;
      for (const R of OPT_R) {
        const m = results.find(x => x.N === N && x.R === R);
        const cls = (m === bestRet ? ' best-ret' : '') + (m === bestCal ? ' best-cal' : '');
        html += `<td class="hm-cell${cls}" style="background:${colorFor(m.totalReturn)}" onclick="applyParams(${N},${R})" title="N ${N} · R ${R}% → 수익 ${m.totalReturn.toFixed(1)}% · MDD ${m.mdd.toFixed(1)}% · ${m.cycles}사이클">${m.totalReturn.toFixed(0)}</td>`;
      }
      html += '</tr>';
    }
    html += '</table></div>';
    out.innerHTML = html;
  }, 20);
}

function applyParams(N, R) {
  const d = document.getElementById('days'), dr = document.getElementById('days-range');
  const t = document.getElementById('target'), tr = document.getElementById('target-range');
  d.value = N; dr.value = Math.max(+dr.min, Math.min(+dr.max, N));
  t.value = R; tr.value = Math.max(+tr.min, Math.min(+tr.max, R));
  updateSeedHint();
  runBacktest();
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindPair(numId, rangeId) {
  const num = document.getElementById(numId);
  const range = document.getElementById(rangeId);
  // 슬라이더 → 숫자
  range.addEventListener('input', () => { num.value = range.value; scheduleRun(); });
  // 숫자 → 슬라이더 (슬라이더 범위 내로 클램프해 썸 위치 반영, 값 자체는 숫자 입력 유지)
  num.addEventListener('input', () => {
    let v = parseFloat(num.value);
    if (!isNaN(v)) {
      const clamped = Math.max(+range.min, Math.min(+range.max, v));
      range.value = clamped;
    }
    scheduleRun();
  });
}

function bindLiveControls() {
  initTickerSelect();
  // 콤보박스 선택 즉시 데이터 로딩 + 백테스트 실행
  document.getElementById('ticker-select').addEventListener('change', loadTicker);
  loadTicker(); // 첫 진입 시 기본 종목 자동 로딩
  bindPair('budget', 'budget-range');
  bindPair('days', 'days-range');
  bindPair('target', 'target-range');
  document.getElementById('quarter-stop').addEventListener('change', scheduleRun);

  const sr = document.getElementById('start-range');
  const er = document.getElementById('end-range');
  [sr, er].forEach(el => el.addEventListener('input', () => { updatePeriodLabel(); scheduleRun(); }));
}

document.addEventListener('DOMContentLoaded', bindLiveControls);

function applyPasted() {
  const text = document.getElementById('data-input').value;
  if (!text.trim()) { alert('붙여넣은 데이터가 없습니다.'); return; }
  setData(parseData(text), '붙여넣기');
}

function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => setData(parseData(ev.target.result), file.name);
  reader.readAsText(file);
}

// ---------- 시뮬레이션 코어 (순수 함수, 최적화에서도 재사용) ----------
function runSim(data, budget, N, R, quarterStop) {
  const dailyAmount = budget / N;
  const a = R / 20;

  let cash = budget, shares = 0, avg = 0, realized = 0;
  const trades = [], cycles = [], equityCurve = [];
  let investedCum = 0;
  let cyStart = null, cyBuy = 0, cySell = 0, cyStartIdx = 0;

  function execBuy(q, price, date, label, T, star) {
    q = Math.min(q, Math.floor(cash / price));
    if (q < 1) return false;
    const cost = q * price;
    avg = (shares * avg + cost) / (shares + q);
    shares += q; cash -= cost; cyBuy += cost; investedCum += cost;
    if (!cyStart) cyStart = date;
    trades.push({ date, side: 'buy', label, price, qty: q, avg, shares, T, star, equity: cash + shares * price });
    return true;
  }
  function execSell(q, price, date, label, T, star) {
    q = Math.min(q, shares);
    if (q < 1) return false;
    const proceeds = q * price;
    realized += proceeds - avg * q;
    shares -= q; cash += proceeds; cySell += proceeds;
    if (shares === 0) avg = 0;
    trades.push({ date, side: 'sell', label, price, qty: q, avg, shares, T, star, equity: cash + shares * price });
    return true;
  }

  for (let i = 0; i < data.length; i++) {
    const { date, h, c } = data[i];

    if (shares === 0) {
      const q = Math.floor(dailyAmount / c);
      cyStart = date; cyBuy = 0; cySell = 0; cyStartIdx = i;
      if (q >= 1) execBuy(q, c, date, '신규진입(1회)', 0, R);
      else if (cash >= c) execBuy(1, c, date, '신규진입(1주)', 0, R);
      equityCurve.push({ date, equity: cash + shares * c, invested: investedCum, close: c });
      continue;
    }

    const cumBuy = shares * avg;
    const T = Math.ceil((cumBuy / dailyAmount) * 100) / 100;
    const star = R - T * a * (40 / N);
    const starRate = star / 100;
    const isFirstHalf = T < 20;

    const sell1Qty = Math.floor(shares / 4);
    const sell1Price = round2(avg * (1 + starRate));
    const sell2Qty = shares - sell1Qty;
    const sell2Price = round2(avg * (1 + R / 100));

    if (sell2Qty > 0 && h >= sell2Price) execSell(sell2Qty, sell2Price, date, `지정가매도 3/4 @평단+${R}%`, T, star);
    if (shares > 0 && c >= sell1Price) execSell(Math.min(sell1Qty, shares), c, date, 'LOC매도 1/4 @평단+★', T, star);
    if (quarterStop && T > 39 && shares > 0) execSell(Math.max(1, Math.floor(shares / 4)), c, date, '쿼터손절 1/4 (시장가)', T, star);

    if (shares > 0) {
      if (isFirstHalf) {
        const half = dailyAmount / 2;
        const b1p = round2(avg);
        const b2p = round2(avg * (1 + starRate) - 0.01);
        if (c <= b1p) execBuy(Math.round(half / b1p), c, date, 'LOC매수 0.5회 @평단', T, star);
        if (c <= b2p) execBuy(Math.round(half / b2p), c, date, 'LOC매수 0.5회 @평단+★', T, star);
      } else {
        const bp = round2(avg * (1 + starRate) - 0.01);
        if (c <= bp) execBuy(Math.round(dailyAmount / bp), c, date, 'LOC매수 1회 @평단+★', T, star);
      }
    }

    if (shares === 0) {
      const days = i - cyStartIdx + 1;
      const profit = cySell - cyBuy;
      cycles.push({ idx: cycles.length + 1, start: cyStart, end: date, days, buy: cyBuy, sell: cySell, profit, rate: cyBuy > 0 ? (profit / cyBuy) * 100 : 0 });
      cyStart = null;
    }
    equityCurve.push({ date, equity: cash + shares * c, invested: investedCum, close: c });
  }

  const lastClose = data[data.length - 1].c;
  const finalEquity = cash + shares * lastClose;
  const unrealized = shares * (lastClose - avg);
  return { trades, cycles, equityCurve, finalEquity, unrealized, realized, shares, avg };
}

// 최적화용 지표만 계산 (곡선/거래로그 없이 요약치)
function metricsFor(data, budget, N, R, quarterStop) {
  const sim = runSim(data, budget, N, R, quarterStop);
  const totalReturn = (sim.finalEquity - budget) / budget * 100;
  let peak = -Infinity, mdd = 0;
  for (const p of sim.equityCurve) { if (p.equity > peak) peak = p.equity; const dd = (p.equity - peak) / peak * 100; if (dd < mdd) mdd = dd; }
  const d0 = new Date(data[0].date), d1 = new Date(data[data.length - 1].date);
  const years = Math.max((d1 - d0) / (365.25 * 864e5), 1 / 365.25);
  const cagr = (Math.pow(sim.finalEquity / budget, 1 / years) - 1) * 100;
  const wins = sim.cycles.filter(c => c.profit > 0).length;
  const winRate = sim.cycles.length ? wins / sim.cycles.length * 100 : 0;
  const calmar = cagr / (Math.abs(mdd) + 1e-9);
  return { N, R, totalReturn, cagr, mdd, cycles: sim.cycles.length, winRate, calmar };
}

// ---------- 백테스트 엔진 ----------
function runBacktest() {
  if (priceData.length === 0) { alert('먼저 데이터를 불러오세요. (샘플 불러오기 또는 붙여넣기)'); return; }

  const budget = parseFloat(document.getElementById('budget').value) || 0;
  const N = parseInt(document.getElementById('days').value) || 40;
  const R = parseFloat(document.getElementById('target').value) || 10;
  const quarterStop = document.getElementById('quarter-stop').value === 'on';

  // 기간 슬라이더 인덱스 → 데이터 구간
  let si = parseInt(document.getElementById('start-range').value) || 0;
  let ei = parseInt(document.getElementById('end-range').value);
  if (isNaN(ei)) ei = priceData.length - 1;
  if (si > ei) { const t = si; si = ei; ei = t; }

  if (budget <= 0 || N <= 0) return;

  const data = priceData.slice(si, ei + 1);
  if (data.length < 2) return;

  // 시뮬레이션 실행 (코어 엔진)
  const sim = runSim(data, budget, N, R, quarterStop);
  const { trades, cycles, equityCurve, finalEquity, unrealized, realized, shares, avg } = sim;

  // 최종 정산
  const lastClose = data[data.length - 1].c;
  const totalProfit = finalEquity - budget;
  const totalReturn = (totalProfit / budget) * 100;

  // 단순보유 비교 (동일 시드로 시작일 종가 전량 매수)
  const firstClose = data[0].c;
  const holdShares = budget / firstClose;
  const holdCurve = data.map(d => holdShares * d.c);
  const holdFinal = holdShares * lastClose;
  const holdReturn = (holdFinal - budget) / budget * 100;

  // 분할매수(DCA) 비교: 동일 시드를 기간 전체에 걸쳐 매일 균등 투자
  const dcaPerDay = budget / data.length;
  let dcaShares = 0;
  const dcaCurve = data.map((d, i) => {
    dcaShares += dcaPerDay / d.c;                 // 매일 정액매수(소수점 주 허용)
    const uninvested = budget - dcaPerDay * (i + 1); // 아직 투자 안 된 현금(대기)
    return dcaShares * d.c + uninvested;             // 포트폴리오 평가액
  });
  const dcaFinal = dcaShares * lastClose;          // 마지막날 전액 투자 완료
  const dcaReturn = (dcaFinal - budget) / budget * 100;

  // 기준금리 투자(무위험) 비교: 자본금을 해당국 기준금리로 일할 복리
  const usCurve = buildRateCurve(window.RATES && window.RATES.US, data, budget);
  const krCurve = buildRateCurve(window.RATES && window.RATES.KR, data, budget);
  const usReturn = usCurve ? (usCurve[usCurve.length - 1] - budget) / budget * 100 : null;
  const krReturn = krCurve ? (krCurve[krCurve.length - 1] - budget) / budget * 100 : null;
  const usRateNow = rateAt(window.RATES && window.RATES.US, data[data.length - 1].date);
  const krRateNow = rateAt(window.RATES && window.RATES.KR, data[data.length - 1].date);

  // MDD (전략 자산곡선)
  let peak = -Infinity, mdd = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = (p.equity - peak) / peak * 100;
    if (dd < mdd) mdd = dd;
  }

  const wins = cycles.filter(cy => cy.profit > 0).length;
  const winRate = cycles.length > 0 ? (wins / cycles.length) * 100 : 0;

  // 기간(년) 및 CAGR
  const d0 = new Date(data[0].date), d1 = new Date(data[data.length - 1].date);
  const years = Math.max((d1 - d0) / (365.25 * 864e5), 1 / 365.25);
  const cagr = (Math.pow(finalEquity / budget, 1 / years) - 1) * 100;

  lastResult = {
    budget, N, R, data, trades, cycles, equityCurve, holdCurve, dcaCurve, usCurve, krCurve,
    finalEquity, realized, unrealized, totalProfit, totalReturn,
    holdReturn, dcaReturn, usReturn, krReturn, usRateNow, krRateNow,
    mdd, winRate, cycleCount: cycles.length, shares, avg, cagr, years,
    startDate: data[0].date, endDate: data[data.length - 1].date
  };
  renderResults(lastResult);
}

// ---------- 결과 렌더링 ----------
function renderResults(r) {
  document.getElementById('results').classList.remove('hidden');

  const pc = (n) => n >= 0 ? 'positive' : 'negative';
  const summary = [
    { label: '총 수익', value: fmtUSD(r.totalProfit), sub: fmtPct(r.totalReturn), cls: pc(r.totalProfit) },
    { label: '최종 자산', value: fmtUSD(r.finalEquity), sub: `시드 ${fmtUSD(r.budget)}`, cls: '' },
    { label: '실현손익', value: fmtUSD(r.realized), sub: '', cls: pc(r.realized) },
    { label: '평가손익', value: fmtUSD(r.unrealized), sub: r.shares > 0 ? `보유 ${r.shares}주 · 평단 ${fmtUSD(r.avg)}` : '보유 없음', cls: pc(r.unrealized) },
    { label: '단순보유 대비', value: fmtPct(r.totalReturn - r.holdReturn), sub: `보유 ${fmtPct(r.holdReturn)}`, cls: pc(r.totalReturn - r.holdReturn) },
    { label: '분할매수(DCA) 대비', value: fmtPct(r.totalReturn - r.dcaReturn), sub: `DCA ${fmtPct(r.dcaReturn)}`, cls: pc(r.totalReturn - r.dcaReturn) },
    { label: '美 기준금리 투자', value: r.usReturn != null ? fmtPct(r.usReturn) : '-', sub: r.usRateNow != null ? `현재 연 ${r.usRateNow}%` : '', cls: pc(r.usReturn || 0) },
    { label: '韓 기준금리 투자', value: r.krReturn != null ? fmtPct(r.krReturn) : '-', sub: r.krRateNow != null ? `현재 연 ${r.krRateNow}%` : '', cls: pc(r.krReturn || 0) },
    { label: '연환산(CAGR)', value: fmtPct(r.cagr), sub: `${r.years.toFixed(2)}년`, cls: pc(r.cagr) },
    { label: '최대낙폭(MDD)', value: r.mdd.toFixed(2) + '%', sub: '전략 자산 기준', cls: 'negative' },
    { label: '사이클 / 승률', value: `${r.cycleCount}회`, sub: `승률 ${r.winRate.toFixed(0)}%`, cls: '' },
  ];
  document.getElementById('summary-grid').innerHTML = summary.map(m => `
    <div class="metric">
      <div class="m-label">${m.label}</div>
      <div class="m-value ${m.cls}">${m.value}</div>
      <div class="m-sub">${m.sub}</div>
    </div>`).join('');

  // 사이클 테이블
  const cyBody = document.querySelector('#cycle-table tbody');
  if (r.cycles.length === 0) {
    cyBody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-dim)">완료된 사이클이 없습니다(기간 내 미청산). 평가손익으로 반영됩니다.</td></tr>`;
  } else {
    cyBody.innerHTML = r.cycles.map(cy => `
      <tr>
        <td>${cy.idx}</td><td>${cy.start}</td><td>${cy.end}</td><td>${cy.days}</td>
        <td>${fmtUSD(cy.buy)}</td><td>${fmtUSD(cy.sell)}</td>
        <td class="${cy.profit >= 0 ? 'positive' : 'negative'}">${fmtUSD(cy.profit)}</td>
        <td class="${cy.rate >= 0 ? 'positive' : 'negative'}">${fmtPct(cy.rate)}</td>
      </tr>`).join('');
  }

  // 거래 로그 (대용량 대비: 최근 800건만 렌더)
  const MAX_ROWS = 800;
  const shown = r.trades.length > MAX_ROWS ? r.trades.slice(-MAX_ROWS) : r.trades;
  document.getElementById('trade-count').textContent =
    r.trades.length > MAX_ROWS ? `${r.trades.length}건 (최근 ${MAX_ROWS}건 표시)` : `${r.trades.length}건`;
  const trBody = document.querySelector('#trade-table tbody');
  trBody.innerHTML = shown.map(t => `
    <tr>
      <td>${t.date}</td>
      <td class="${t.side === 'buy' ? 'badge-buy' : 'badge-sell'}">${t.side === 'buy' ? '매수' : '매도'}</td>
      <td style="text-align:left">${t.label}</td>
      <td>${fmtUSD(t.price)}</td>
      <td>${t.qty}</td>
      <td>${fmtUSD(t.avg)}</td>
      <td>${t.shares}</td>
      <td>${t.T.toFixed(2)}</td>
      <td class="star">${t.star.toFixed(2)}</td>
      <td>${fmtUSD(t.equity)}</td>
    </tr>`).join('');

  drawEquityChart(r);
}

// ---------- 캔버스 차트 (외부 라이브러리 없이) ----------
function drawEquityChart(r) {
  const canvas = document.getElementById('equity-chart');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.parentElement.clientWidth;
  const cssH = 300;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { l: 60, r: 15, t: 15, b: 28 };
  const W = cssW - pad.l - pad.r;
  const H = cssH - pad.t - pad.b;

  const strat = r.equityCurve.map(p => p.equity);
  const hold = r.holdCurve;
  const dca = r.dcaCurve;
  const us = r.usCurve || [];
  const kr = r.krCurve || [];
  const invested = r.equityCurve.map(p => Math.min(p.invested, r.budget));
  const n = strat.length;

  let maxV = Math.max(...strat, ...hold, ...dca, ...us, ...kr, r.budget);
  let minV = Math.min(...strat, ...hold, ...dca, ...us, ...kr, r.budget);
  const rangePad = (maxV - minV) * 0.08 || maxV * 0.1;
  maxV += rangePad; minV -= rangePad;
  if (minV < 0) minV = 0;

  const x = (i) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v) => pad.t + H - ((v - minV) / (maxV - minV)) * H;

  // 그리드 + Y축 레이블
  ctx.strokeStyle = '#2d3748';
  ctx.fillStyle = '#8b949e';
  ctx.font = '11px sans-serif';
  ctx.lineWidth = 1;
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = minV + (maxV - minV) * (i / ticks);
    const yy = y(v);
    ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(pad.l + W, yy); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(CUR + Math.round(v).toLocaleString(), pad.l - 6, yy);
  }

  // 시드 기준선
  ctx.strokeStyle = '#4b5563';
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(pad.l, y(r.budget)); ctx.lineTo(pad.l + W, y(r.budget)); ctx.stroke();
  ctx.setLineDash([]);

  // 투입원금(누적)
  drawLine(ctx, invested, x, y, '#f5a623', 1.5);
  // 단순보유
  drawLine(ctx, hold, x, y, '#8b949e', 1.5);
  // 분할매수(DCA)
  drawLine(ctx, dca, x, y, '#a371f7', 1.5);
  // 美 기준금리 투자
  if (us.length) drawLine(ctx, us, x, y, '#2dd4bf', 1.3);
  // 韓 기준금리 투자
  if (kr.length) drawLine(ctx, kr, x, y, '#f778ba', 1.3);
  // 전략
  drawLine(ctx, strat, x, y, '#58a6ff', 2);

  // X축 날짜 (시작/중간/끝)
  ctx.fillStyle = '#8b949e';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const idxs = [0, Math.floor(n / 2), n - 1];
  idxs.forEach(i => {
    if (r.equityCurve[i]) ctx.fillText(r.equityCurve[i].date, x(i), pad.t + H + 6);
  });
}

function drawLine(ctx, arr, x, y, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  arr.forEach((v, i) => { i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)); });
  ctx.stroke();
}

// 리사이즈 시 차트 다시 그리기
window.addEventListener('resize', () => { if (lastResult) drawEquityChart(lastResult); });
