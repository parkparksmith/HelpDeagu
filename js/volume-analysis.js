const SUPABASE_URL = 'https://glmerfqfaqzdphbienqh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsbWVyZnFmYXF6ZHBoYmllbnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjUyNjgsImV4cCI6MjA4NzIwMTI2OH0.xuiYzjDYWWJNg4P3wFS-fLoc_2cMWgdx3SeZHJcDPLs';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let volumeChart = null;

function toggleDistrict(btn) {
    const gu = btn.dataset.gu;
    const container = document.getElementById('district-chips');
    const allBtn = container.querySelector('[data-gu="all"]');

    if (gu === 'all') {
        container.querySelectorAll('.district-chip').forEach(b => b.classList.remove('active'));
        allBtn.classList.add('active');
        return;
    }

    btn.classList.toggle('active');
    allBtn.classList.remove('active');

    const anyActive = container.querySelectorAll('.district-chip.active:not([data-gu="all"])').length > 0;
    if (!anyActive) allBtn.classList.add('active');
}

function getSelectedDistricts() {
    const chips = document.querySelectorAll('#district-chips .district-chip.active');
    const selected = Array.from(chips).map(c => c.dataset.gu);
    if (selected.includes('all') || selected.length === 0) return null;
    return selected;
}

function getKSTDateStr(daysAgo = 0) {
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    kst.setDate(kst.getDate() - daysAgo);
    return kst.toISOString().split('T')[0];
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function calcMovingAverage(data, win) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < win - 1) { result.push(null); continue; }
        let sum = 0;
        for (let j = i - win + 1; j <= i; j++) sum += data[j];
        result.push(Math.round((sum / win) * 10) / 10);
    }
    return result;
}

function fillDateRange(startDate, endDate) {
    const dates = [];
    const cur = new Date(startDate);
    const end = new Date(endDate);
    while (cur <= end) {
        dates.push(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

function splitDateRange(startStr, endStr, chunkDays) {
    const chunks = [];
    let cur = new Date(startStr);
    const end = new Date(endStr);
    while (cur <= end) {
        const chunkEnd = new Date(cur);
        chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
        if (chunkEnd > end) chunkEnd.setTime(end.getTime());
        chunks.push({ start: cur.toISOString().split('T')[0], end: chunkEnd.toISOString().split('T')[0] });
        cur = new Date(chunkEnd);
        cur.setDate(cur.getDate() + 1);
    }
    return chunks;
}

function setProgress(done, total) {
    const pct = Math.round((done / total) * 100);
    document.getElementById('loading-text').textContent =
        `거래량 데이터를 불러오는 중... (${pct}%)`;
}

// ──────────────────────────────────────────────────
// 전략 A: write_date용 — 날짜 컬럼 fetch → 클라이언트 집계
//   write_date에 인덱스가 없으므로 contractdate 인덱스를 힌트로 활용.
//   contractdate >= (chunkStart - 40일) 조건을 추가해 DB가
//   contractdate 인덱스로 먼저 범위를 좁힌 뒤 write_date를 필터.
//   14일 단위 청크 × 테이블 전부 병렬 실행.
// ──────────────────────────────────────────────────

function dateSub(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

function applyDistrictFilter(query, districts) {
    if (!districts || districts.length === 0) return query;
    if (districts.length === 1) return query.like('city', '%' + districts[0] + '%');
    const orClause = districts.map(d => `city.like.%${d}%`).join(',');
    return query.or(orClause);
}

function amountCol(table) {
    return table === 'apt_rent_trades' ? 'deposit' : 'amount';
}

function applyAmountFilter(query, table, minAmount, maxAmount) {
    const col = amountCol(table);
    if (minAmount) query = query.gte(col, minAmount);
    if (maxAmount) query = query.lte(col, maxAmount);
    if (table === 'apt_rent_trades') query = query.eq('monthly_rent', 0);
    return query;
}

async function fetchWriteDateChunk(table, startDate, endDate, minAmount, maxAmount, districts) {
    let all = [];
    let from = 0;
    const PAGE = 1000;
    const contractHint = dateSub(startDate, 40);

    while (true) {
        let q = supabaseClient.from(table).select('write_date')
            .gte('write_date', startDate + ' 00:00:00')
            .lte('write_date', endDate + ' 23:59:59')
            .gte('contractdate', contractHint);

        q = applyAmountFilter(q, table, minAmount, maxAmount);
        q = applyDistrictFilter(q, districts);

        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) throw error;
        if (data) all = all.concat(data);
        if (!data || data.length < PAGE) break;
        from += PAGE;
    }
    return all;
}

// ──────────────────────────────────────────────────
// 테이블별 단일 fetch → 클라이언트 집계 (write_date)
// ──────────────────────────────────────────────────

async function fetchWriteDateForTable(table, startDate, endDate, minAmount, maxAmount, districts) {
    const chunks = splitDateRange(startDate, endDate, 14);
    const results = await Promise.all(
        chunks.map(c => fetchWriteDateChunk(table, c.start, c.end, minAmount, maxAmount, districts))
    );
    const counts = {};
    results.flat().forEach(r => {
        if (!r.write_date) return;
        const day = r.write_date.substring(0, 10);
        counts[day] = (counts[day] || 0) + 1;
    });
    return counts;
}

// ──────────────────────────────────────────────────
// 테이블별 단일 fetch → 클라이언트 집계 (contractdate)
//   contractdate는 인덱스가 있으므로 range select가 빠름.
//   기존 per-day head:true 방식 대신 전체 range를 한번에 가져옴.
// ──────────────────────────────────────────────────

async function fetchContractDateForTable(table, startDate, endDate, minAmount, maxAmount, districts) {
    let all = [];
    let from = 0;
    const PAGE = 1000;

    while (true) {
        let q = supabaseClient.from(table).select('contractdate')
            .gte('contractdate', startDate)
            .lte('contractdate', endDate);

        q = applyAmountFilter(q, table, minAmount, maxAmount);
        q = applyDistrictFilter(q, districts);

        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) throw error;
        if (data) all = all.concat(data);
        if (!data || data.length < PAGE) break;
        from += PAGE;
    }

    const counts = {};
    all.forEach(r => {
        if (!r.contractdate) return;
        counts[r.contractdate] = (counts[r.contractdate] || 0) + 1;
    });
    return counts;
}

// ──────────────────────────────────────────────────
// 테이블 메타 & 유틸
// ──────────────────────────────────────────────────

const TABLE_META = {
    apt_trades:      { label: '아파트',  bg: 'rgba(58, 166, 255, 0.65)',  border: 'rgba(58, 166, 255, 0.9)' },
    presale_trades:  { label: '분양권',  bg: 'rgba(255, 159, 64, 0.65)',  border: 'rgba(255, 159, 64, 0.9)' },
    apt_rent_trades: { label: '전세',    bg: 'rgba(52, 211, 153, 0.65)',  border: 'rgba(52, 211, 153, 0.9)' },
};

function getTablesForTradeType(tradeType) {
    switch (tradeType) {
        case 'total':   return ['apt_trades', 'presale_trades', 'apt_rent_trades'];
        case 'all':     return ['apt_trades', 'presale_trades'];
        case 'apt':     return ['apt_trades'];
        case 'presale': return ['presale_trades'];
        case 'rent':    return ['apt_rent_trades'];
        default:        return ['apt_trades', 'presale_trades'];
    }
}

async function fetchTableCounts(table, dateType, startDate, endDate, minAmount, maxAmount, districts) {
    if (dateType === 'write_date') {
        return await fetchWriteDateForTable(table, startDate, endDate, minAmount, maxAmount, districts);
    }
    return await fetchContractDateForTable(table, startDate, endDate, minAmount, maxAmount, districts);
}

// ──────────────────────────────────────────────────
// 메인 로드
// ──────────────────────────────────────────────────

async function loadVolumeData() {
    const dateType = document.getElementById('date-type').value;
    const tradeType = document.getElementById('trade-type').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const minAmountRaw = document.getElementById('min-amount').value;
    const maxAmountRaw = document.getElementById('max-amount').value;
    const minAmount = minAmountRaw ? Math.round(parseFloat(minAmountRaw) * 100000000) : null;
    const maxAmount = maxAmountRaw ? Math.round(parseFloat(maxAmountRaw) * 100000000) : null;
    const districts = getSelectedDistricts();

    if (!startDate || !endDate) { alert('시작일과 종료일을 선택해주세요.'); return; }
    if (startDate > endDate) { alert('시작일이 종료일보다 클 수 없습니다.'); return; }

    const tables = getTablesForTradeType(tradeType);
    const isStacked = tables.length > 1;

    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('loading-text').textContent = '거래량 데이터를 불러오는 중...';
    document.getElementById('error-message').classList.add('hidden');
    document.getElementById('stat-cards').classList.add('hidden');
    document.getElementById('chart-panel').classList.add('hidden');

    try {
        const allDates = fillDateRange(startDate, endDate);
        const useOneMonthLine = dateType !== 'write_date';
        const oneMonthAgoDate = useOneMonthLine ? getKSTDateStr(30) : null;

        let completed = 0;
        const perTableCounts = await Promise.all(
            tables.map(async (t) => {
                const counts = await fetchTableCounts(t, dateType, startDate, endDate, minAmount, maxAmount, districts);
                completed++;
                setProgress(completed, tables.length);
                return { table: t, counts };
            })
        );

        const perTableVols = perTableCounts.map(({ table, counts }) => ({
            table,
            meta: TABLE_META[table],
            data: allDates.map(d => counts[d] || 0),
        }));

        const totalVol = allDates.map((_, i) =>
            perTableVols.reduce((sum, tv) => sum + tv.data[i], 0)
        );
        const ma7 = calcMovingAverage(totalVol, 7);

        updateStats(allDates, totalVol, ma7);
        renderChart(allDates, totalVol, ma7, oneMonthAgoDate, dateType, isStacked ? perTableVols : null, tradeType);

        document.getElementById('stat-cards').classList.remove('hidden');
        document.getElementById('chart-panel').classList.remove('hidden');

        const legendBoundary = document.getElementById('legend-boundary');
        if (legendBoundary) legendBoundary.style.display = useOneMonthLine ? '' : 'none';

        updateLegend(perTableVols, isStacked);

        const warningEl = document.getElementById('data-warning');
        if (dateType === 'write_date' && startDate < '2026-02-24') {
            warningEl.classList.remove('hidden');
        } else {
            warningEl.classList.add('hidden');
        }
    } catch (err) {
        console.error(err);
        const errEl = document.getElementById('error-message');
        errEl.textContent = '데이터 조회 중 오류가 발생했습니다: ' + err.message;
        errEl.classList.remove('hidden');
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
}

function updateLegend(perTableVols, isStacked) {
    const container = document.getElementById('chart-legend');
    container.querySelectorAll('.legend-item-dynamic').forEach(el => el.remove());

    const legendBoundary = document.getElementById('legend-boundary');
    const legendMa7 = container.querySelector('.legend-item:not(#legend-boundary):not(.legend-item-dynamic)');

    if (isStacked) {
        perTableVols.forEach(tv => {
            const item = document.createElement('div');
            item.className = 'legend-item legend-item-dynamic';
            item.innerHTML = `<div class="legend-dot" style="background: ${tv.meta.bg};"></div><span>${tv.meta.label}</span>`;
            container.insertBefore(item, legendMa7);
        });
    } else {
        const tv = perTableVols[0];
        const item = document.createElement('div');
        item.className = 'legend-item legend-item-dynamic';
        item.innerHTML = `<div class="legend-dot" style="background: ${tv.meta.bg};"></div><span>${tv.meta.label}</span>`;
        container.insertBefore(item, legendMa7);
    }
}

function updateStats(dates, volumes, ma7) {
    const tradingDays = volumes.filter(v => v > 0);
    const total = volumes.reduce((a, b) => a + b, 0);
    const avg = tradingDays.length > 0 ? Math.round(total / tradingDays.length) : 0;
    const max = Math.max(...volumes);
    const maxIdx = volumes.indexOf(max);
    const maxDate = dates[maxIdx];
    const lastMa7 = [...ma7].reverse().find(v => v !== null);

    document.getElementById('stat-total').textContent = total.toLocaleString() + '건';
    document.getElementById('stat-period-range').textContent =
        `${formatDate(dates[0])} ~ ${formatDate(dates[dates.length - 1])}`;
    document.getElementById('stat-avg').textContent = avg.toLocaleString() + '건';
    document.getElementById('stat-max').textContent = max.toLocaleString() + '건';
    document.getElementById('stat-max-date').textContent = maxDate ? formatDate(maxDate) : '-';
    document.getElementById('stat-recent-avg').textContent =
        lastMa7 != null ? lastMa7.toLocaleString() + '건' : '-';
}

function renderChart(dates, volumes, ma7, oneMonthAgoDate, dateType, stackedData, tradeType) {
    const ctx = document.getElementById('volume-chart').getContext('2d');
    if (volumeChart) volumeChart.destroy();

    const showBoundary = dateType !== 'write_date' && oneMonthAgoDate;
    let boundaryIdx = -1;
    if (showBoundary) {
        const idx = dates.indexOf(oneMonthAgoDate);
        boundaryIdx = idx >= 0 ? idx : dates.length - 30;
    }

    const barDatasets = [];

    if (stackedData) {
        stackedData.forEach((tv, i) => {
            barDatasets.push({
                label: tv.meta.label,
                data: tv.data,
                backgroundColor: tv.meta.bg,
                borderColor: tv.meta.border,
                borderWidth: 1,
                borderRadius: i === stackedData.length - 1 ? 2 : 0,
                order: 2,
                barPercentage: 0.85, categoryPercentage: 0.9,
                stack: 'total',
            });
        });
    } else {
        const meta = TABLE_META[getTablesForTradeType(tradeType)[0]];
        const barColors = dates.map((_, i) =>
            showBoundary && boundaryIdx >= 0 && i >= boundaryIdx ? 'rgba(248, 81, 73, 0.35)' : meta.bg
        );
        const barBorderColors = dates.map((_, i) =>
            showBoundary && boundaryIdx >= 0 && i >= boundaryIdx ? 'rgba(248, 81, 73, 0.7)' : meta.border
        );
        barDatasets.push({
            label: meta.label,
            data: volumes,
            backgroundColor: barColors,
            borderColor: barBorderColors,
            borderWidth: 1, borderRadius: 2, order: 2,
            barPercentage: 0.85, categoryPercentage: 0.9,
        });
    }

    volumeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [
                ...barDatasets,
                {
                    label: '7일 이동평균',
                    data: ma7,
                    type: 'line',
                    borderColor: '#f59e0b',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    pointRadius: 0, pointHoverRadius: 4,
                    pointHoverBackgroundColor: '#f59e0b',
                    tension: 0.3, order: 1, spanGaps: false,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(22, 27, 34, 0.95)',
                    titleColor: '#e6edf3', bodyColor: '#8b949e',
                    borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                    padding: 12,
                    titleFont: { size: 13, weight: '600' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        title(items) {
                            const d = new Date(items[0].label);
                            const dn = ['일', '월', '화', '수', '목', '금', '토'];
                            return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${dn[d.getDay()]})`;
                        },
                        label(item) {
                            if (item.raw === null) return null;
                            return `  ${item.dataset.label}: ${item.raw}건`;
                        },
                        afterBody(items) {
                            const lines = [];
                            if (stackedData) {
                                const idx = dates.indexOf(items[0].label);
                                const total = stackedData.reduce((s, tv) => s + (tv.data[idx] || 0), 0);
                                lines.push(`\n  합계: ${total}건`);
                            }
                            if (showBoundary) {
                                const idx = dates.indexOf(items[0].label);
                                if (boundaryIdx >= 0 && idx >= boundaryIdx) lines.push('  ⚠ 1달 이내: 추가 데이터 반영 가능');
                            }
                            return lines.join('\n');
                        }
                    }
                },
            },
            scales: {
                x: {
                    type: 'category',
                    stacked: !!stackedData,
                    ticks: {
                        color: '#6e7681', font: { size: 10 },
                        maxRotation: 45, autoSkip: true, maxTicksLimit: 20,
                        callback: (_, i) => formatDate(dates[i])
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    beginAtZero: true,
                    stacked: !!stackedData,
                    ticks: {
                        color: '#6e7681', font: { size: 11 },
                        callback: v => v + '건'
                    },
                    grid: { color: 'rgba(255,255,255,0.06)' }
                }
            }
        },
        plugins: [{
            id: 'oneMonthBoundary',
            beforeDraw(chart) {
                if (!showBoundary || boundaryIdx < 0 || boundaryIdx >= dates.length) return;
                const { ctx: dc, chartArea, scales } = chart;
                const xPos = scales.x.getPixelForValue(boundaryIdx);
                if (xPos < chartArea.left || xPos > chartArea.right) return;
                dc.save();
                dc.fillStyle = 'rgba(248, 81, 73, 0.04)';
                dc.fillRect(xPos, chartArea.top, chartArea.right - xPos, chartArea.bottom - chartArea.top);
                dc.setLineDash([6, 4]);
                dc.strokeStyle = 'rgba(248, 81, 73, 0.5)';
                dc.lineWidth = 1.5;
                dc.beginPath(); dc.moveTo(xPos, chartArea.top); dc.lineTo(xPos, chartArea.bottom); dc.stroke();
                dc.setLineDash([]);
                dc.font = '11px Pretendard, sans-serif';
                dc.fillStyle = 'rgba(248, 81, 73, 0.8)';
                dc.textAlign = 'left';
                dc.fillText('← 1달 이내 (추가 가능)', xPos + 6, chartArea.top + 14);
                dc.restore();
            }
        }]
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-date').value = getKSTDateStr(90);
    document.getElementById('end-date').value = getKSTDateStr(0);
    loadVolumeData();
});
