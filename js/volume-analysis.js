const SUPABASE_URL = 'https://glmerfqfaqzdphbienqh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsbWVyZnFmYXF6ZHBoYmllbnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjUyNjgsImV4cCI6MjA4NzIwMTI2OH0.xuiYzjDYWWJNg4P3wFS-fLoc_2cMWgdx3SeZHJcDPLs';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let cachedRecords = null;
let amountTimer = null;
let volumeChart = null;

// ══════════════════════════════════════════════════
// 색상 & 메타
// ══════════════════════════════════════════════════

const TYPE_META = {
    apt:     { label: '아파트', bg: 'rgba(58,166,255,0.65)',  border: 'rgba(58,166,255,0.9)' },
    presale: { label: '분양권', bg: 'rgba(255,159,64,0.65)',  border: 'rgba(255,159,64,0.9)' },
    rent:    { label: '전세',   bg: 'rgba(52,211,153,0.65)',  border: 'rgba(52,211,153,0.9)' },
};

const DISTRICTS = ['수성구','중구','달서구','남구','북구','동구','서구','달성군','군위군'];
const D_RGB = [[58,166,255],[255,99,132],[255,159,64],[52,211,153],[153,102,255],[255,205,86],[75,192,192],[201,162,39],[199,89,199]];
const DISTRICT_META = {};
DISTRICTS.forEach((d, i) => {
    const c = D_RGB[i];
    DISTRICT_META[d] = { bg: `rgba(${c},0.65)`, border: `rgba(${c},0.9)` };
});

const AREA_DEFS = [
    { key: '0-50',  label: '~50㎡',   min: 0,  max: 50 },
    { key: '50-80', label: '50~80㎡', min: 50, max: 80 },
    { key: '80-90', label: '80~90㎡', min: 80, max: 90 },
    { key: '90-',   label: '90㎡~',   min: 90, max: Infinity },
];
const A_RGB = [[75,192,192],[58,166,255],[255,159,64],[255,99,132]];
const AREA_META = {};
AREA_DEFS.forEach((r, i) => {
    const c = A_RGB[i];
    AREA_META[r.label] = { bg: `rgba(${c},0.65)`, border: `rgba(${c},0.9)` };
});

// ══════════════════════════════════════════════════
// UI 토글
// ══════════════════════════════════════════════════

function toggleChip(btn, containerId, attr) {
    const box = document.getElementById(containerId);
    const allBtn = box.querySelector(`[${attr}="all"]`);
    if (btn.getAttribute(attr) === 'all') {
        box.querySelectorAll('.district-chip').forEach(b => b.classList.remove('active'));
        allBtn.classList.add('active');
    } else {
        btn.classList.toggle('active');
        allBtn.classList.remove('active');
        if (!box.querySelector(`.district-chip.active:not([${attr}="all"])`)) allBtn.classList.add('active');
    }
    if (cachedRecords) applyFilters();
}

function toggleTrade(btn)    { toggleChip(btn, 'trade-chips',    'data-trade'); }
function toggleDistrict(btn) { toggleChip(btn, 'district-chips', 'data-gu'); }
function toggleArea(btn)     { toggleChip(btn, 'area-chips',     'data-area'); }

function setStackMode(btn) {
    document.getElementById('stack-chips').querySelectorAll('.district-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (cachedRecords) applyFilters();
}

function onAmountChange() {
    clearTimeout(amountTimer);
    amountTimer = setTimeout(() => { if (cachedRecords) applyFilters(); }, 400);
}

// ══════════════════════════════════════════════════
// Getters
// ══════════════════════════════════════════════════

function getChips(containerId, attr) {
    const chips = document.querySelectorAll(`#${containerId} .district-chip.active`);
    const sel = Array.from(chips).map(c => c.getAttribute(attr));
    return sel.includes('all') || sel.length === 0 ? null : sel;
}

function getSelectedTrades()    { return getChips('trade-chips', 'data-trade') || ['apt','presale','rent']; }
function getSelectedDistricts() { return getChips('district-chips', 'data-gu'); }
function getSelectedAreas()     { return getChips('area-chips', 'data-area'); }
function getStackMode()         { return document.querySelector('#stack-chips .district-chip.active')?.dataset.stack || 'type'; }

// ══════════════════════════════════════════════════
// 유틸
// ══════════════════════════════════════════════════

function getKSTDateStr(daysAgo = 0) {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 3600000);
    kst.setDate(kst.getDate() - daysAgo);
    return kst.toISOString().split('T')[0];
}

function formatDate(s) { const d = new Date(s); return `${d.getMonth()+1}/${d.getDate()}`; }

function calcMovingAverage(data, win) {
    return data.map((_, i) => {
        if (i < win - 1) return null;
        let s = 0; for (let j = i - win + 1; j <= i; j++) s += data[j];
        return Math.round((s / win) * 10) / 10;
    });
}

function fillDateRange(start, end) {
    const dates = [], cur = new Date(start), e = new Date(end);
    while (cur <= e) { dates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1); }
    return dates;
}

function splitDateRange(start, end, days) {
    const chunks = []; let cur = new Date(start); const e = new Date(end);
    while (cur <= e) {
        const ce = new Date(cur); ce.setDate(ce.getDate() + days - 1);
        if (ce > e) ce.setTime(e.getTime());
        chunks.push({ start: cur.toISOString().split('T')[0], end: ce.toISOString().split('T')[0] });
        cur = new Date(ce); cur.setDate(cur.getDate() + 1);
    }
    return chunks;
}

function dateSub(s, days) { const d = new Date(s); d.setDate(d.getDate() - days); return d.toISOString().split('T')[0]; }

function setProgress(done, total) {
    document.getElementById('loading-text').textContent = `데이터를 불러오는 중... (${Math.round(done/total*100)}%)`;
}

function extractDistrict(city) {
    for (const d of DISTRICTS) if (city.includes(d)) return d;
    return '기타';
}

function getAreaLabel(area) {
    for (const r of AREA_DEFS) if (area >= r.min && area < r.max) return r.label;
    return '90㎡~';
}

// ══════════════════════════════════════════════════
// 데이터 Fetch
// ══════════════════════════════════════════════════

async function fetchTableRecords(table, dateType, startDate, endDate) {
    const isRent = table === 'apt_rent_trades';
    const amtCol = isRent ? 'deposit' : 'amount';
    const type = isRent ? 'rent' : (table === 'presale_trades' ? 'presale' : 'apt');
    let all = [];

    if (dateType === 'write_date') {
        const sel = `write_date,city,area,${amtCol}`;
        const chunks = splitDateRange(startDate, endDate, 14);
        const chunkResults = await Promise.all(chunks.map(async (chunk) => {
            let buf = [], from = 0;
            const hint = dateSub(chunk.start, 40);
            while (true) {
                let q = supabaseClient.from(table).select(sel)
                    .gte('write_date', chunk.start + ' 00:00:00')
                    .lte('write_date', chunk.end + ' 23:59:59')
                    .gte('contractdate', hint);
                if (isRent) q = q.eq('monthly_rent', 0);
                const { data, error } = await q.range(from, from + 999);
                if (error) throw error;
                if (data) buf = buf.concat(data);
                if (!data || data.length < 1000) break;
                from += 1000;
            }
            return buf;
        }));
        all = chunkResults.flat();
        return all.filter(r => r.write_date).map(r => ({
            date: r.write_date.substring(0, 10), city: r.city || '',
            area: parseFloat(r.area) || 0, amount: r[amtCol] || 0, type
        }));
    }

    const sel = `contractdate,city,area,${amtCol}`;
    let from = 0;
    while (true) {
        let q = supabaseClient.from(table).select(sel)
            .gte('contractdate', startDate).lte('contractdate', endDate);
        if (isRent) q = q.eq('monthly_rent', 0);
        const { data, error } = await q.range(from, from + 999);
        if (error) throw error;
        if (data) all = all.concat(data);
        if (!data || data.length < 1000) break;
        from += 1000;
    }
    return all.filter(r => r.contractdate).map(r => ({
        date: r.contractdate, city: r.city || '',
        area: parseFloat(r.area) || 0, amount: r[amtCol] || 0, type
    }));
}

async function loadData() {
    const dateType = document.getElementById('date-type').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    if (!startDate || !endDate) { alert('시작일과 종료일을 선택해주세요.'); return; }
    if (startDate > endDate) { alert('시작일이 종료일보다 클 수 없습니다.'); return; }

    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('loading-text').textContent = '데이터를 불러오는 중...';
    document.getElementById('error-message').classList.add('hidden');
    document.getElementById('stat-cards').classList.add('hidden');
    document.getElementById('chart-panel').classList.add('hidden');
    document.getElementById('stack-selector').style.display = 'none';

    try {
        const tables = ['apt_trades', 'presale_trades', 'apt_rent_trades'];
        let done = 0;
        const results = await Promise.all(tables.map(async t => {
            const recs = await fetchTableRecords(t, dateType, startDate, endDate);
            done++; setProgress(done, tables.length);
            return recs;
        }));
        cachedRecords = results.flat();
        applyFilters();
    } catch (err) {
        console.error(err);
        const el = document.getElementById('error-message');
        el.textContent = '데이터 조회 중 오류: ' + err.message;
        el.classList.remove('hidden');
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
}

// ══════════════════════════════════════════════════
// 클라이언트 필터링 & 그룹핑
// ══════════════════════════════════════════════════

function matchAreaRanges(area, ranges) {
    for (const r of ranges) {
        const [mn, mx] = r.split('-');
        if (area >= (mn ? parseFloat(mn) : 0) && area < (mx ? parseFloat(mx) : Infinity)) return true;
    }
    return false;
}

function groupBy(records, mode) {
    const groups = {};
    records.forEach(r => {
        let key;
        if (mode === 'type')          key = TYPE_META[r.type].label;
        else if (mode === 'district') key = extractDistrict(r.city);
        else                          key = getAreaLabel(r.area);
        if (!groups[key]) groups[key] = {};
        groups[key][r.date] = (groups[key][r.date] || 0) + 1;
    });
    return groups;
}

function getGroupOrder(mode, groups) {
    if (mode === 'type')     return ['아파트','분양권','전세'].filter(k => groups[k]);
    if (mode === 'district') return DISTRICTS.filter(k => groups[k]);
    return AREA_DEFS.map(r => r.label).filter(k => groups[k]);
}

function getGroupColor(mode, name) {
    const fb = { bg: 'rgba(128,128,128,0.65)', border: 'rgba(128,128,128,0.9)' };
    if (mode === 'type')     return Object.values(TYPE_META).find(v => v.label === name) || fb;
    if (mode === 'district') return DISTRICT_META[name] || fb;
    return AREA_META[name] || fb;
}

function buildDatasets(filtered, allDates, mode) {
    const groups = groupBy(filtered, mode);
    const order = getGroupOrder(mode, groups);
    return order.map(name => ({
        name,
        data: allDates.map(d => groups[name]?.[d] || 0),
        color: getGroupColor(mode, name),
    }));
}

function applyFilters() {
    if (!cachedRecords) return;

    const trades = getSelectedTrades();
    const districts = getSelectedDistricts();
    const areaRanges = getSelectedAreas();
    const minRaw = document.getElementById('min-amount').value;
    const maxRaw = document.getElementById('max-amount').value;
    const minAmt = minRaw ? Math.round(parseFloat(minRaw) * 1e8) : null;
    const maxAmt = maxRaw ? Math.round(parseFloat(maxRaw) * 1e8) : null;
    const dateType = document.getElementById('date-type').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    const filtered = cachedRecords.filter(r => {
        if (!trades.includes(r.type)) return false;
        if (districts && !districts.some(d => r.city.includes(d))) return false;
        if (areaRanges && !matchAreaRanges(r.area, areaRanges)) return false;
        if (minAmt && r.amount < minAmt) return false;
        if (maxAmt && r.amount > maxAmt) return false;
        return true;
    });

    const allDates = fillDateRange(startDate, endDate);
    const totalCounts = {};
    filtered.forEach(r => { totalCounts[r.date] = (totalCounts[r.date] || 0) + 1; });
    const totalVol = allDates.map(d => totalCounts[d] || 0);
    const ma7 = calcMovingAverage(totalVol, 7);

    const useOneMonth = dateType !== 'write_date';
    const oneMonthDate = useOneMonth ? getKSTDateStr(30) : null;

    const stackMode = getStackMode();
    const datasets = buildDatasets(filtered, allDates, stackMode);

    updateStats(allDates, totalVol, ma7);
    renderChart(allDates, datasets, totalVol, ma7, oneMonthDate, dateType);
    updateLegend(datasets, useOneMonth);

    const titles = { type: '거래유형별 거래량', district: '구/군별 거래량', area: '평형별 거래량' };
    document.getElementById('chart-title-text').textContent = titles[stackMode];
    document.getElementById('stat-cards').classList.remove('hidden');
    document.getElementById('chart-panel').classList.remove('hidden');
    document.getElementById('stack-selector').style.display = '';

    const w = document.getElementById('data-warning');
    (dateType === 'write_date' && startDate < '2026-02-24') ? w.classList.remove('hidden') : w.classList.add('hidden');
}

// ══════════════════════════════════════════════════
// 통계
// ══════════════════════════════════════════════════

function updateStats(dates, vol, ma7) {
    const trading = vol.filter(v => v > 0);
    const total = vol.reduce((a, b) => a + b, 0);
    const avg = trading.length ? Math.round(total / trading.length) : 0;
    const max = Math.max(...vol);
    const maxDate = dates[vol.indexOf(max)];
    const lastMa = [...ma7].reverse().find(v => v !== null);

    document.getElementById('stat-total').textContent = total.toLocaleString() + '건';
    document.getElementById('stat-period-range').textContent = `${formatDate(dates[0])} ~ ${formatDate(dates[dates.length-1])}`;
    document.getElementById('stat-avg').textContent = avg.toLocaleString() + '건';
    document.getElementById('stat-max').textContent = max.toLocaleString() + '건';
    document.getElementById('stat-max-date').textContent = maxDate ? formatDate(maxDate) : '-';
    document.getElementById('stat-recent-avg').textContent = lastMa != null ? lastMa.toLocaleString() + '건' : '-';
}

// ══════════════════════════════════════════════════
// 범례
// ══════════════════════════════════════════════════

function updateLegend(datasets, useOneMonth) {
    const box = document.getElementById('chart-legend');
    box.innerHTML = '';
    datasets.forEach(ds => {
        const el = document.createElement('div');
        el.className = 'legend-item';
        el.innerHTML = `<div class="legend-dot" style="background:${ds.color.bg}"></div><span>${ds.name}</span>`;
        box.appendChild(el);
    });
    const ma7El = document.createElement('div');
    ma7El.className = 'legend-item';
    ma7El.innerHTML = '<div class="legend-dot" style="background:#f59e0b"></div><span>7일 이동평균</span>';
    box.appendChild(ma7El);
    if (useOneMonth) {
        const bEl = document.createElement('div');
        bEl.className = 'legend-item';
        bEl.innerHTML = '<div class="legend-dot" style="background:rgba(248,81,73,0.6);border:1px dashed #f85149"></div><span>1달 기준선</span>';
        box.appendChild(bEl);
    }
}

// ══════════════════════════════════════════════════
// 차트 렌더링
// ══════════════════════════════════════════════════

function renderChart(dates, datasets, totalVol, ma7, oneMonthDate, dateType) {
    const ctx = document.getElementById('volume-chart').getContext('2d');
    if (volumeChart) volumeChart.destroy();

    const showBound = dateType !== 'write_date' && oneMonthDate;
    let bIdx = -1;
    if (showBound) { const i = dates.indexOf(oneMonthDate); bIdx = i >= 0 ? i : dates.length - 30; }

    const bars = datasets.map((ds, i) => ({
        label: ds.name, data: ds.data,
        backgroundColor: ds.color.bg, borderColor: ds.color.border,
        borderWidth: 1, borderRadius: i === datasets.length - 1 ? 2 : 0,
        order: 2, barPercentage: 0.85, categoryPercentage: 0.9, stack: 'total',
    }));

    volumeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [...bars, {
                label: '7일 이동평균', data: ma7, type: 'line',
                borderColor: '#f59e0b', backgroundColor: 'transparent',
                borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4,
                pointHoverBackgroundColor: '#f59e0b', tension: 0.3, order: 1, spanGaps: false,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(22,27,34,0.95)', titleColor: '#e6edf3', bodyColor: '#8b949e',
                    borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12,
                    titleFont: { size: 13, weight: '600' }, bodyFont: { size: 12 },
                    callbacks: {
                        title(items) {
                            const d = new Date(items[0].label);
                            const dn = ['일','월','화','수','목','금','토'];
                            return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} (${dn[d.getDay()]})`;
                        },
                        label(item) {
                            if (item.raw === null) return null;
                            return `  ${item.dataset.label}: ${item.raw}건`;
                        },
                        afterBody(items) {
                            const lines = [];
                            if (datasets.length > 1) {
                                const idx = dates.indexOf(items[0].label);
                                lines.push(`\n  합계: ${totalVol[idx]}건`);
                            }
                            if (showBound && bIdx >= 0) {
                                const idx = dates.indexOf(items[0].label);
                                if (idx >= bIdx) lines.push('  ⚠ 1달 이내: 추가 데이터 반영 가능');
                            }
                            return lines.join('\n');
                        }
                    }
                },
            },
            scales: {
                x: {
                    type: 'category', stacked: true,
                    ticks: { color: '#6e7681', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 20, callback: (_, i) => formatDate(dates[i]) },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    beginAtZero: true, stacked: true,
                    ticks: { color: '#6e7681', font: { size: 11 }, callback: v => v + '건' },
                    grid: { color: 'rgba(255,255,255,0.06)' }
                }
            }
        },
        plugins: [{
            id: 'oneMonthBoundary',
            beforeDraw(chart) {
                if (!showBound || bIdx < 0 || bIdx >= dates.length) return;
                const { ctx: dc, chartArea, scales } = chart;
                const x = scales.x.getPixelForValue(bIdx);
                if (x < chartArea.left || x > chartArea.right) return;
                dc.save();
                dc.fillStyle = 'rgba(248,81,73,0.04)';
                dc.fillRect(x, chartArea.top, chartArea.right - x, chartArea.bottom - chartArea.top);
                dc.setLineDash([6, 4]); dc.strokeStyle = 'rgba(248,81,73,0.5)'; dc.lineWidth = 1.5;
                dc.beginPath(); dc.moveTo(x, chartArea.top); dc.lineTo(x, chartArea.bottom); dc.stroke();
                dc.setLineDash([]);
                dc.restore();
            }
        }]
    });
}

// ══════════════════════════════════════════════════
// 초기화
// ══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-date').value = getKSTDateStr(90);
    document.getElementById('end-date').value = getKSTDateStr(0);
    loadData();
});
