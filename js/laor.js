// 라오어 무한매수법 V2.2 계산기 (거래 내역 기반)

// --- 상태 관리 ---
let appData = {
    portfolios: [],
    currentId: null
};

let editingId = null;
let transType = 'buy';
let quickType = 'buy';

// --- 초기화 ---
let currentTab = 'active'; // 'active' or 'history'

// --- 초기화 ---
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderPortfolioList();

    // 금액 입력 포맷팅
    const budgetInput = document.getElementById('pf-budget');
    budgetInput.addEventListener('input', () => formatInputNumber(budgetInput));
});

// --- 유틸리티 ---
function formatUSD(num) {
    return '$' + num.toFixed(2);
}

function formatInputNumber(input) {
    let value = input.value.replace(/[^\d]/g, '');
    if (value) {
        input.value = parseInt(value, 10).toLocaleString();
    }
}

function parseFormattedNumber(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/,/g, '')) || 0;
}

// --- 데이터 저장/불러오기 ---
function loadData() {
    const saved = localStorage.getItem('laor_v22_portfolios');
    if (saved) {
        appData = JSON.parse(saved);
    }
}

function saveData() {
    localStorage.setItem('laor_v22_portfolios', JSON.stringify(appData));
}

// --- 탭 전환 ---
function switchPortfolioTab(tab) {
    currentTab = tab;

    // 탭 버튼 스타일 업데이트
    document.querySelectorAll('.pf-tab').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');

    renderPortfolioList();
}

// --- 포트폴리오 목록 ---
function renderPortfolioList() {
    const grid = document.getElementById('portfolio-grid');

    // 현재 탭에 맞는 포트폴리오 필터링
    const filteredPortfolios = appData.portfolios.filter(pf => {
        const stats = calculateStats(pf);
        // 종료된 포트폴리오: 보유 수량이 0이고, 거래 내역이 있어야 함 (단, 막 생성된 빈 포트폴리오는 제외)
        const isCompleted = stats.qty <= 0 && pf.transactions.length > 0;

        if (currentTab === 'active') {
            return !isCompleted;
        } else {
            return isCompleted;
        }
    });

    if (filteredPortfolios.length === 0) {
        const msg = currentTab === 'active'
            ? '진행 중인 포트폴리오가 없습니다.<br>새 포트폴리오를 만들어보세요!'
            : '종료된 포트폴리오(History)가 없습니다.';

        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ccc;">
                ${msg}
            </div>
        `;
        return;
    }

    let html = '';
    // 정렬: 최신 생성 순
    filteredPortfolios.sort((a, b) => b.id - a.id);

    filteredPortfolios.forEach(pf => {
        const stats = calculateStats(pf);
        const dailyAmount = pf.settings.budget / pf.settings.days;

        const realizedColor = stats.realizedProfit >= 0 ? 'color: var(--success);' : 'color: var(--danger);';
        const unrealizedColor = stats.unrealizedProfit >= 0 ? 'color: var(--success);' : 'color: var(--danger);';
        const totalColor = stats.totalProfit >= 0 ? 'color: var(--success);' : 'color: var(--danger);';

        const isCompleted = stats.qty <= 0 && pf.transactions.length > 0;
        const completedBadge = isCompleted ? '<span class="phase-badge late" style="margin-left:8px; font-size: 0.6rem;">종료됨</span>' : '';
        const cardStyle = isCompleted ? 'border: 1px solid var(--border-accent); background: var(--bg-card-hover);' : '';

        // 날짜 계산
        let dateInfo = '거래 없음';
        if (pf.transactions.length > 0) {
            const sortedDates = pf.transactions.map(t => t.date).sort();
            const startDate = sortedDates[0].replace(/-/g, '.');
            const lastDate = sortedDates[sortedDates.length - 1].replace(/-/g, '.');
            dateInfo = `<span style="font-size: 0.75rem;">${startDate} ~ ${lastDate}</span>`;
        }

        html += `
            <div class="portfolio-card" style="${cardStyle}" onclick="openPortfolio(${pf.id})">
                <span class="name">
                    ${pf.name}
                    ${completedBadge}
                </span>
                <div class="info" style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed var(--border);">
                    <span>기간</span>
                    <span>${dateInfo}</span>
                </div>
                <div class="info">
                    <span>시드</span>
                    <span>$${pf.settings.budget.toLocaleString()}</span>
                </div>
                <div class="info">
                    <span>보유</span>
                    <span>${stats.qty}주 / 평단 ${formatUSD(stats.avgPrice)}</span>
                </div>
                <div class="info">
                    <span>회차(T)</span>
                    <span>${stats.T.toFixed(2)} (${stats.T < 20 ? '전반전' : '후반전'})</span>
                </div>
                <div class="info">
                    <span>설정</span>
                    <span>${pf.settings.days}분할 / ${pf.settings.targetRate}%</span>
                </div>
                <div class="info" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border);">
                    <span>실현구간</span>
                    <span style="${realizedColor}">$${stats.realizedProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div class="info">
                    <span>평가구간</span>
                    <span style="${unrealizedColor}">$${stats.unrealizedProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div class="info">
                    <span><strong>총 수익</strong></span>
                    <span style="font-weight: 700; ${totalColor}">$${stats.totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <button class="delete-btn" onclick="deletePortfolio(event, ${pf.id})">
                    <span class="material-icons-round">delete</span>
                </button>
            </div>
        `;
    });

    grid.innerHTML = html;
}

// --- 포트폴리오 통계 계산 (HTS 이동평균법) ---
function calculateStats(pf) {
    // 날짜 기준 1차 정렬 (과거 → 최근)
    // 같은 날짜의 경우 id 역순 2차 정렬 (나중에 입력한 것 = 먼저 발생한 거래)
    const sorted = [...pf.transactions].sort((a, b) => {
        const dateCompare = new Date(a.date) - new Date(b.date);
        if (dateCompare !== 0) return dateCompare;
        return b.id - a.id; // 같은 날짜면 id가 큰 것(나중 입력 = 먼저 발생)이 앞으로
    });

    // HTS 이동평균법
    // - 매수: 평단가 = (기존총액 + 신규매수액) / (기존수량 + 신규수량)
    // - 매도: 평단가 유지, 수량만 차감, 실현수익 계산
    let qty = 0;           // 현재 보유수량
    let avgPrice = 0;      // 이동평균 평단가
    let realizedProfit = 0; // 실현 수익

    sorted.forEach(t => {
        if (t.type === 'buy') {
            // 매수: 이동평균으로 평단가 갱신
            const prevTotal = qty * avgPrice;
            const newTotal = t.price * t.qty;
            qty += t.qty;
            avgPrice = qty > 0 ? (prevTotal + newTotal) / qty : 0;
        } else if (t.type === 'sell') {
            // 매도: 실현수익 계산 후 수량 차감
            // 실현수익 = 매도금액 - (매도수량 × 매도시점 평단가)
            const sellAmount = t.price * t.qty;
            const costBasis = avgPrice * t.qty;
            realizedProfit += sellAmount - costBasis;

            qty -= t.qty;
            if (qty <= 0) {
                qty = 0;
                avgPrice = 0; // 전량 매도 시 평단가 리셋
            }
        }
    });

    // 누적매수금액 = 보유수량 × 평단가 (HTS 방식)
    const cumulativeBuy = qty * avgPrice;
    const totalCost = cumulativeBuy;

    // 마지막 거래 가격 (가장 최근 거래의 체결가)
    const lastTransaction = sorted.length > 0 ? sorted[sorted.length - 1] : null;
    const lastPrice = lastTransaction ? lastTransaction.price : 0;

    // 평가수익 = (마지막거래가 - 평단가) × 보유수량
    const unrealizedProfit = qty > 0 && lastPrice > 0 ? (lastPrice - avgPrice) * qty : 0;

    // 총수익 = 실현수익 + 평가수익
    const totalProfit = realizedProfit + unrealizedProfit;

    const dailyAmount = pf.settings.budget / pf.settings.days;
    // T(회차) = 누적매수액 ÷ 1회시도액, 소수점 둘째자리에서 올림 (2024.09.05 공식 업데이트)
    const T = dailyAmount > 0 ? Math.ceil((cumulativeBuy / dailyAmount) * 100) / 100 : 0;

    // ★% 계산 공식 (v2.2)
    // - 목표수익률(R): 사용자 설정값 (예: 10%, 12%)
    // - a (가변계수): R / 20 (10%일 때 0.5, 12%일 때 0.6)
    // - 분할일수(N): 사용자 설정값 (예: 40일)
    // ★% = R - T × a × (40/N)
    const R = pf.settings.targetRate;  // 목표수익률
    const N = pf.settings.days;        // 분할일수
    const a = R / 20;                  // 가변계수
    const starPercent = R - T * a * (40 / N);

    return {
        qty,
        avgPrice,
        totalCost,
        cumulativeBuy,
        dailyAmount,
        T,
        starPercent,
        realizedProfit,
        unrealizedProfit,
        totalProfit,
        lastPrice
    };
}

// --- 포트폴리오 열기 ---
function openPortfolio(id) {
    appData.currentId = id;

    document.getElementById('portfolio-list-view').classList.add('hidden');
    document.getElementById('portfolio-detail-view').classList.remove('hidden');

    document.getElementById('back-btn-home').classList.add('hidden');
    document.getElementById('back-btn-list').classList.remove('hidden');
    document.getElementById('settings-btn').classList.remove('hidden');

    const pf = appData.portfolios.find(p => p.id === id);
    document.getElementById('page-title').textContent = pf.name;

    // 빠른 입력 초기화
    initQuickInput();

    updateDashboard();
    checkCycleCompletion(pf);
}

function goToPortfolioList() {
    appData.currentId = null;

    document.getElementById('portfolio-detail-view').classList.add('hidden');
    document.getElementById('portfolio-list-view').classList.remove('hidden');

    document.getElementById('back-btn-list').classList.add('hidden');
    document.getElementById('back-btn-home').classList.remove('hidden');
    document.getElementById('settings-btn').classList.add('hidden');

    document.getElementById('page-title').textContent = '내 포트폴리오';

    renderPortfolioList();
}

// --- 대시보드 업데이트 ---
function updateDashboard() {
    const pf = appData.portfolios.find(p => p.id === appData.currentId);
    if (!pf) return;

    const stats = calculateStats(pf);
    const { qty, avgPrice, cumulativeBuy, dailyAmount, T, starPercent, realizedProfit, unrealizedProfit, totalProfit } = stats;
    const starRate = starPercent / 100;
    const isFirstHalf = T < 20;
    const isQuarterStop = T > 39;

    // 지표 업데이트
    document.getElementById('metric-t').textContent = T.toFixed(2);
    document.getElementById('metric-star').textContent = starPercent.toFixed(2) + '%';
    document.getElementById('metric-qty').textContent = qty + '주';
    document.getElementById('metric-avg').textContent = formatUSD(avgPrice);
    document.getElementById('metric-cumulative').textContent = '$' + cumulativeBuy.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('metric-daily').textContent = '$' + dailyAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // 실현 수익 표시 (양수/음수에 따라 색상 변경)
    const profitEl = document.getElementById('metric-profit');
    const profitSign = realizedProfit >= 0 ? '+' : '';
    profitEl.textContent = profitSign + '$' + realizedProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    profitEl.className = 'metric-value ' + (realizedProfit >= 0 ? 'positive' : 'negative');

    // 평가 수익 표시
    const unrealizedEl = document.getElementById('metric-unrealized');
    const unrealizedSign = unrealizedProfit >= 0 ? '+' : '';
    unrealizedEl.textContent = unrealizedSign + '$' + unrealizedProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    unrealizedEl.className = 'metric-value ' + (unrealizedProfit >= 0 ? 'positive' : 'negative');

    // 총 수익 표시
    const totalProfitEl = document.getElementById('metric-total-profit');
    const totalSign = totalProfit >= 0 ? '+' : '';
    totalProfitEl.textContent = totalSign + '$' + totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    totalProfitEl.className = 'metric-value ' + (totalProfit >= 0 ? 'positive' : 'negative');

    // 진행 단계 배지
    const badge = document.getElementById('phase-badge');
    if (isQuarterStop) {
        badge.textContent = '쿼터 손절';
        badge.className = 'phase-badge danger';
    } else if (!isFirstHalf) {
        badge.textContent = '후반전';
        badge.className = 'phase-badge late';
    } else {
        badge.textContent = '전반전';
        badge.className = 'phase-badge';
    }

    // 쿼터 손절 알림
    document.getElementById('quarter-alert').classList.toggle('hidden', !isQuarterStop);

    // --- 매수 가이드 ---
    let buyHtml = '';
    if (avgPrice > 0 && dailyAmount > 0) {
        const starDisplay = starPercent.toFixed(2) + '%';

        if (isFirstHalf) {
            const halfAmount = dailyAmount / 2;
            const buy1Price = avgPrice;
            const buy1Qty = Math.round(halfAmount / buy1Price);
            const buy2Price = Math.round((avgPrice * (1 + starRate) - 0.01) * 100) / 100;
            const buy2Qty = Math.round(halfAmount / buy2Price);

            buyHtml = `
                <div class="guide-row buy">
                    <span class="label">LOC 매수 (0.5회) @ 평단</span>
                    <span class="value">
                        <span class="price">${formatUSD(buy1Price)}</span>
                        <span class="qty">${buy1Qty}주</span>
                    </span>
                </div>
                <div class="guide-row buy">
                    <span class="label">LOC 매수 (0.5회) @ 평단+<span class="star-value">★${starDisplay}</span></span>
                    <span class="value">
                        <span class="price">${formatUSD(buy2Price)}</span>
                        <span class="qty">${buy2Qty}주</span>
                    </span>
                </div>
            `;
        } else {
            const buyPrice = Math.round((avgPrice * (1 + starRate) - 0.01) * 100) / 100;
            const buyQty = Math.round(dailyAmount / buyPrice);

            buyHtml = `
                <div class="guide-row buy">
                    <span class="label">LOC 매수 (1회) @ 평단+<span class="star-value">★${starDisplay}</span></span>
                    <span class="value">
                        <span class="price">${formatUSD(buyPrice)}</span>
                        <span class="qty">${buyQty}주</span>
                    </span>
                </div>
            `;
        }
    } else {
        buyHtml = `
            <div class="guide-row buy">
                <span class="label">첫 매수</span>
                <span class="value">1회분 ($${Math.round(dailyAmount).toLocaleString()})</span>
            </div>
        `;
    }
    document.getElementById('buy-guide').innerHTML = buyHtml;

    // --- 매도 가이드 ---
    let sellHtml = '';
    const starDisplay = starPercent.toFixed(2) + '%';

    if (qty > 0 && avgPrice > 0) {
        const sell1Qty = Math.floor(qty / 4);
        const sell1Price = Math.round((avgPrice * (1 + starRate)) * 100) / 100;
        const sell2Qty = qty - sell1Qty;
        const sell2Price = Math.round((avgPrice * (1 + pf.settings.targetRate / 100)) * 100) / 100;

        sellHtml = `
            <div class="guide-row sell">
                <span class="label">LOC 매도 (1/4) @ 평단+<span class="star-value">★${starDisplay}</span></span>
                <span class="value">
                    <span class="price">${formatUSD(sell1Price)}</span>
                    <span class="qty">${sell1Qty}주</span>
                </span>
            </div>
            <div class="guide-row sell">
                <span class="label">지정가 매도 (3/4) @ 평단+${pf.settings.targetRate}%</span>
                <span class="value">
                    <span class="price">${formatUSD(sell2Price)}</span>
                    <span class="qty">${sell2Qty}주</span>
                </span>
            </div>
        `;

        if (isQuarterStop) {
            const quarterQty = Math.floor(qty / 4);
            sellHtml += `
                <div class="guide-row" style="background: rgba(244,67,54,0.2); border-left: 3px solid #e74c3c;">
                    <span class="label">⚠️ 쿼터 손절 (시장가)</span>
                    <span class="value">
                        <span class="qty">${quarterQty}주 매도 후 재진입</span>
                    </span>
                </div>
            `;
        }
    } else {
        sellHtml = '<div class="empty-state">보유 수량 없음</div>';
    }
    document.getElementById('sell-guide').innerHTML = sellHtml;

    // --- 폭락 대비 ---
    // 공식: 가격 = 매입금액 ÷ (T × n), n = 4, 5, 6, 7, 8, 9
    // 수량: 각 1주
    let crashHtml = '';
    if (cumulativeBuy > 0 && T > 0) {
        const nValues = [4, 5, 6, 7, 8, 9];
        nValues.forEach(n => {
            const dropPrice = Math.round((cumulativeBuy / (T * n)) * 100) / 100;
            crashHtml += `
                <div class="guide-row crash">
                    <span class="label">LOC (n=${n})</span>
                    <span class="value">
                        <span class="price">${formatUSD(dropPrice)}</span>
                        <span class="qty">1주</span>
                    </span>
                </div>
            `;
        });
    } else {
        crashHtml = '<div class="empty-state">거래 내역 추가 후 표시됩니다</div>';
    }
    document.getElementById('crash-guide').innerHTML = crashHtml;

    // --- 거래 내역 ---
    renderTransactions(pf);

    // --- 공식 예시 업데이트 ---
    updateFormulaExample(pf, stats);
}

function renderTransactions(pf) {
    const list = document.getElementById('transaction-list');

    if (pf.transactions.length === 0) {
        list.innerHTML = '<div class="empty-state">거래 내역이 없습니다.</div>';
        return;
    }

    // 날짜순 정렬 (최신이 위로)
    const sorted = [...pf.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalCount = sorted.length;

    let html = '';
    sorted.forEach((t, index) => {
        const seq = totalCount - index; // 순번 (오래된 것이 1번, 최신이 큰 번호)
        html += `
            <div class="transaction-item" data-id="${t.id}">
                <span class="seq-num">${seq}</span>
                <span class="type ${t.type}">${t.type === 'buy' ? '매수' : '매도'}</span>
                <span>${t.date}</span>
                <span class="text-right">${formatUSD(t.price)}</span>
                <span class="text-right">${t.qty}주</span>
                <button class="edit-btn" onclick="openEditModal(${t.id})">
                    <span class="material-icons-round" style="font-size:18px;">edit</span>
                </button>
                <button class="del-btn" onclick="deleteTransaction(${t.id})">
                    <span class="material-icons-round" style="font-size:18px;">close</span>
                </button>
            </div>
        `;
    });

    list.innerHTML = html;
}

// --- 드래그 앤 드롭 ---
let draggedId = null;

function handleDragStart(e, id) {
    draggedId = id;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const item = e.target.closest('.transaction-item');
    if (item && !item.classList.contains('dragging')) {
        item.classList.add('drag-over');
    }
}

function handleDrop(e, targetId) {
    e.preventDefault();

    if (draggedId === null || draggedId === targetId) return;

    const pf = appData.portfolios.find(p => p.id === appData.currentId);
    if (!pf) return;

    // 거래 내역에서 드래그한 항목과 드롭 대상 찾기
    const draggedIndex = pf.transactions.findIndex(t => t.id === draggedId);
    const targetIndex = pf.transactions.findIndex(t => t.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // 날짜를 서로 교환하여 순서 변경
    const draggedItem = pf.transactions[draggedIndex];
    const targetItem = pf.transactions[targetIndex];

    // 날짜 교환
    const tempDate = draggedItem.date;
    draggedItem.date = targetItem.date;
    targetItem.date = tempDate;

    saveData();
    updateDashboard();
    checkCycleCompletion(pf);
}

function handleDragEnd(e) {
    draggedId = null;
    e.target.classList.remove('dragging');

    // 모든 drag-over 클래스 제거
    document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
}

// --- 거래 수정 ---
let editTransType = 'buy';

function openEditModal(id) {
    const pf = appData.portfolios.find(p => p.id === appData.currentId);
    if (!pf) return;

    const transaction = pf.transactions.find(t => t.id === id);
    if (!transaction) return;

    editTransType = transaction.type;
    document.getElementById('edit-trans-id').value = id;
    document.getElementById('edit-trans-date').value = transaction.date;
    document.getElementById('edit-trans-price').value = transaction.price;
    document.getElementById('edit-trans-qty').value = transaction.qty;

    document.getElementById('edit-type-buy').classList.toggle('active', transaction.type === 'buy');
    document.getElementById('edit-type-sell').classList.toggle('active', transaction.type === 'sell');

    document.getElementById('edit-transaction-modal').classList.remove('hidden');
}

function setEditTransType(type) {
    editTransType = type;
    document.getElementById('edit-type-buy').classList.toggle('active', type === 'buy');
    document.getElementById('edit-type-sell').classList.toggle('active', type === 'sell');
}

function saveEditTransaction() {
    const pf = appData.portfolios.find(p => p.id === appData.currentId);
    if (!pf) return;

    const id = parseInt(document.getElementById('edit-trans-id').value);
    const date = document.getElementById('edit-trans-date').value;
    const price = parseFloat(document.getElementById('edit-trans-price').value);
    const qty = parseInt(document.getElementById('edit-trans-qty').value);

    if (!date || !price || !qty) {
        alert('모든 정보를 입력해주세요.');
        return;
    }

    const transaction = pf.transactions.find(t => t.id === id);
    if (!transaction) return;

    transaction.type = editTransType;
    transaction.date = date;
    transaction.price = price;
    transaction.qty = qty;

    saveData();
    updateDashboard();
    checkCycleCompletion(pf);
    closeModal('edit-transaction-modal');
}

// --- 공식 예시 동적 업데이트 ---
function updateFormulaExample(pf, stats) {
    const exampleContainer = document.getElementById('formula-example-content');
    if (!exampleContainer) return;

    const { cumulativeBuy, dailyAmount, T, starPercent, avgPrice } = stats;
    const R = pf.settings.targetRate;
    const N = pf.settings.days;
    const a = R / 20;

    let html = '';

    if (cumulativeBuy > 0 && dailyAmount > 0) {
        // 현재 값으로 예시 생성
        const starRate = starPercent / 100;
        const isFirstHalf = T < 20;

        html = `
            <div class="example-section">
                <p class="example-title">📊 현재 설정값</p>
                <div class="example-values">
                    <span><strong>R</strong> (목표수익률): ${R}%</span>
                    <span><strong>N</strong> (분할일수): ${N}일</span>
                    <span><strong>a</strong> (가변계수): ${a.toFixed(2)}</span>
                </div>
            </div>

            <div class="example-section">
                <p class="example-title">📈 T(회차) 계산</p>
                <div class="example-calc">
                    T = 누적매수액 ÷ 1회시도액 (올림)<br>
                    T = $${cumulativeBuy.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ÷ $${dailyAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br>
                    T = <strong class="highlight">${T.toFixed(2)}</strong> ${isFirstHalf ? '(전반전)' : '(후반전)'}
                </div>
            </div>

            <div class="example-section">
                <p class="example-title">⭐ ★%(별퍼센트) 계산</p>
                <div class="example-calc">
                    ★% = R - T × a × (40/N)<br>
                    ★% = ${R} - ${T.toFixed(2)} × ${a.toFixed(2)} × (40/${N})<br>
                    ★% = ${R} - ${(T * a * (40 / N)).toFixed(3)}<br>
                    ★% = <strong class="highlight star">${starPercent.toFixed(2)}%</strong>
                </div>
            </div>
        `;

        if (avgPrice > 0) {
            const buyPriceStar = Math.round((avgPrice * (1 + starRate) - 0.01) * 100) / 100;
            const sellPriceTarget = Math.round((avgPrice * (1 + R / 100)) * 100) / 100;

            html += `
                <div class="example-section">
                    <p class="example-title">💰 매수가/매도가 계산 예시</p>
                    <div class="example-calc">
                        평단가: <strong>${formatUSD(avgPrice)}</strong><br><br>
                        <span style="color: #58a6ff;">📥 매수가 (평단+★%)</span><br>
                        = $${avgPrice.toFixed(2)} × (1 + ${starPercent.toFixed(2)}%) - $0.01<br>
                        = <strong class="highlight">${formatUSD(buyPriceStar)}</strong><br><br>
                        <span style="color: #f85149;">📤 매도가 (평단+${R}%)</span><br>
                        = $${avgPrice.toFixed(2)} × (1 + ${R}%)<br>
                        = <strong class="highlight">${formatUSD(sellPriceTarget)}</strong>
                    </div>
                </div>
            `;
        }
    } else {
        html = `
            <div class="empty-state">
                거래 내역을 추가하면 현재 값을 기반으로<br>
                계산 예시가 표시됩니다.
            </div>
        `;
    }

    exampleContainer.innerHTML = html;
}

// --- 포트폴리오 CRUD ---
function openCreateModal() {
    editingId = null;
    document.getElementById('modal-title').textContent = '새 포트폴리오';
    document.getElementById('modal-save-btn').textContent = '생성';
    document.getElementById('pf-name').value = '';
    document.getElementById('pf-budget').value = '';
    document.getElementById('pf-days').value = '40';
    document.getElementById('pf-target').value = '10';
    document.getElementById('create-modal').classList.remove('hidden');
}

function openSettingsModal() {
    const pf = appData.portfolios.find(p => p.id === appData.currentId);
    if (!pf) return;

    editingId = pf.id;
    document.getElementById('modal-title').textContent = '설정 수정';
    document.getElementById('modal-save-btn').textContent = '저장';
    document.getElementById('pf-name').value = pf.name;
    document.getElementById('pf-budget').value = pf.settings.budget.toLocaleString();
    document.getElementById('pf-days').value = pf.settings.days;
    document.getElementById('pf-target').value = pf.settings.targetRate;
    document.getElementById('create-modal').classList.remove('hidden');
}

function savePortfolio() {
    const name = document.getElementById('pf-name').value.trim();
    const budget = parseFormattedNumber(document.getElementById('pf-budget').value);
    const days = parseInt(document.getElementById('pf-days').value) || 40;
    const targetRate = parseFloat(document.getElementById('pf-target').value) || 10;

    if (!name || budget <= 0) {
        alert('종목명과 원금을 입력해주세요.');
        return;
    }

    if (editingId) {
        // 수정
        const pf = appData.portfolios.find(p => p.id === editingId);
        pf.name = name;
        pf.settings = { budget, days, targetRate };
        document.getElementById('page-title').textContent = name;
        updateDashboard();
    } else {
        // 생성
        const newPf = {
            id: Date.now(),
            name,
            settings: { budget, days, targetRate },
            transactions: []
        };
        appData.portfolios.push(newPf);
        renderPortfolioList();
    }

    saveData();
    closeModal('create-modal');
}

function deletePortfolio(e, id) {
    e.stopPropagation();
    if (confirm('정말 삭제하시겠습니까?\n모든 거래 내역이 삭제됩니다.')) {
        appData.portfolios = appData.portfolios.filter(p => p.id !== id);
        saveData();
        renderPortfolioList();
    }
}

// --- 거래 내역 CRUD ---
function openTransactionModal() {
    transType = 'buy';
    document.getElementById('type-buy').classList.add('active');
    document.getElementById('type-sell').classList.remove('active');
    document.getElementById('trans-date').valueAsDate = new Date();
    document.getElementById('trans-price').value = '';
    document.getElementById('trans-qty').value = '1';
    document.getElementById('transaction-modal').classList.remove('hidden');
}

function setTransType(type) {
    transType = type;
    document.getElementById('type-buy').classList.toggle('active', type === 'buy');
    document.getElementById('type-sell').classList.toggle('active', type === 'sell');
}

function addTransaction() {
    const pf = appData.portfolios.find(p => p.id === appData.currentId);
    if (!pf) return;

    const date = document.getElementById('trans-date').value;
    const price = parseFloat(document.getElementById('trans-price').value);
    const qty = parseInt(document.getElementById('trans-qty').value);

    if (!date || !price || !qty) {
        alert('모든 정보를 입력해주세요.');
        return;
    }

    pf.transactions.push({
        id: Date.now(),
        type: transType,
        date,
        price,
        qty
    });

    saveData();
    updateDashboard();
    checkCycleCompletion(pf);
    closeModal('transaction-modal');
}

function deleteTransaction(id) {
    if (!confirm('이 거래를 삭제하시겠습니까?')) return;

    const pf = appData.portfolios.find(p => p.id === appData.currentId);
    if (!pf) return;

    pf.transactions = pf.transactions.filter(t => t.id !== id);
    saveData();
    updateDashboard();
    checkCycleCompletion(pf);
}

// --- 빠른 입력 (인라인) ---
function setQuickType(type) {
    quickType = type;
    document.getElementById('quick-type-buy').classList.toggle('active', type === 'buy');
    document.getElementById('quick-type-sell').classList.toggle('active', type === 'sell');
}

function quickAddTransaction() {
    const pf = appData.portfolios.find(p => p.id === appData.currentId);
    if (!pf) return;

    const dateInput = document.getElementById('quick-date');
    const priceInput = document.getElementById('quick-price');
    const qtyInput = document.getElementById('quick-qty');

    const date = dateInput.value;
    const price = parseFloat(priceInput.value);
    const qty = parseInt(qtyInput.value);

    if (!date || !price || !qty) {
        alert('날짜, 가격, 수량을 모두 입력해주세요.');
        return;
    }

    pf.transactions.push({
        id: Date.now(),
        type: quickType,
        date,
        price,
        qty
    });

    saveData();
    updateDashboard();
    checkCycleCompletion(pf);

    // 입력 필드 초기화 (날짜는 유지, 가격/수량 초기화)
    priceInput.value = '';
    qtyInput.value = '1';
    priceInput.focus();
}

function initQuickInput() {
    const dateInput = document.getElementById('quick-date');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }

    // Enter 키로 빠른 추가
    const quickInputs = document.querySelectorAll('.quick-input');
    quickInputs.forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                quickAddTransaction();
            }
        });
    });
}

// --- 모달 ---
function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// --- 토글 ---
function toggleCollapse(el) {
    el.classList.toggle('open');
    el.nextElementSibling.classList.toggle('open');
}

// --- 데이터 백업/복원 ---
function exportAllData() {
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `laor_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function triggerImport() {
    document.getElementById('import-file').click();
}

function importAllData(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.portfolios) {
                alert('올바르지 않은 파일입니다.');
                return;
            }

            // 복원 날짜 (오늘 날짜)
            const today = new Date().toISOString().slice(0, 10);

            // 기존 데이터 유지하고 모든 포트폴리오를 새로 추가
            let addedPortfolios = 0;
            let addedTransactions = 0;

            data.portfolios.forEach(importPf => {
                // 새 포트폴리오 추가 (이름에 복원 날짜 추가)
                const newPf = {
                    ...importPf,
                    id: Date.now() + Math.random(),
                    name: `${importPf.name} (복원: ${today})`,
                    transactions: importPf.transactions.map(t => ({
                        ...t,
                        id: Date.now() + Math.random()
                    }))
                };
                appData.portfolios.push(newPf);
                addedPortfolios++;
                addedTransactions += importPf.transactions.length;
            });

            saveData();
            renderPortfolioList();

            alert(`복원 완료!\n- 추가된 포트폴리오: ${addedPortfolios}개\n- 추가된 거래내역: ${addedTransactions}건`);

        } catch (err) {
            alert('파일 읽기 오류: ' + err.message);
        }
        input.value = '';
    };
    reader.readAsText(file);
}

// --- 자동 거래 추가 (문자 파싱) ---
let parsedType = 'buy';

function openAutoAddModal() {
    document.getElementById('auto-input-text').value = '';
    document.getElementById('parse-preview').classList.add('hidden');
    parsedType = 'buy';
    document.getElementById('auto-add-modal').classList.remove('hidden');
}

function setParsedType(type) {
    parsedType = type;
    document.getElementById('parsed-type-buy').classList.toggle('active', type === 'buy');
    document.getElementById('parsed-type-sell').classList.toggle('active', type === 'sell');
}

function parseAndPreview() {
    const text = document.getElementById('auto-input-text').value;

    if (!text.trim()) {
        alert('체결 알림 내용을 붙여넣어주세요.');
        return;
    }

    // 파싱 로직
    const parsed = parseTradeMessage(text);

    // 파싱 결과를 입력 필드에 채우기 (수정 가능)
    parsedType = parsed.type;
    document.getElementById('parsed-type-buy').classList.toggle('active', parsed.type === 'buy');
    document.getElementById('parsed-type-sell').classList.toggle('active', parsed.type === 'sell');
    document.getElementById('parsed-price').value = parsed.price || '';
    document.getElementById('parsed-qty').value = parsed.qty || '';
    document.getElementById('parsed-date').value = parsed.date || new Date().toISOString().slice(0, 10);

    document.getElementById('parse-preview').classList.remove('hidden');

    // 가격 입력 필드에 포커스
    document.getElementById('parsed-price').focus();
}

function parseTradeMessage(text) {
    const result = {
        type: 'buy',
        price: 0,
        qty: 0,
        date: ''
    };

    // 매매구분 파싱
    const typeMatch = text.match(/매매구분\s*[:：]\s*(매수|매도)/);
    if (typeMatch) {
        result.type = typeMatch[1] === '매수' ? 'buy' : 'sell';
    }

    // 체결단가 파싱 (USD 55.0800 형식)
    const priceMatch = text.match(/체결단가\s*[:：]\s*(?:USD\s*)?([\d.]+)/i);
    if (priceMatch) {
        result.price = parseFloat(priceMatch[1]);
    }

    // 체결수량 파싱 (1주 형식)
    const qtyMatch = text.match(/체결수량\s*[:：]\s*(\d+)\s*주?/);
    if (qtyMatch) {
        result.qty = parseInt(qtyMatch[1]);
    }

    // 체결일자 파싱 (01/26 또는 2024/01/26 형식)
    const dateMatch = text.match(/체결일자\s*[:：]\s*(\d{2,4})?[\/\-]?(\d{1,2})[\/\-](\d{1,2})/);
    if (dateMatch) {
        const year = dateMatch[1] && dateMatch[1].length === 4
            ? dateMatch[1]
            : new Date().getFullYear();
        const month = dateMatch[2].padStart(2, '0');
        const day = dateMatch[3].padStart(2, '0');
        result.date = `${year}-${month}-${day}`;
    } else {
        // 날짜를 못찾으면 오늘 날짜
        result.date = new Date().toISOString().slice(0, 10);
    }

    return result;
}

function confirmAutoAdd() {
    const price = parseFloat(document.getElementById('parsed-price').value);
    const qty = parseInt(document.getElementById('parsed-qty').value);
    const date = document.getElementById('parsed-date').value;

    if (!price || !qty || !date) {
        alert('가격, 수량, 날짜를 모두 입력해주세요.');
        return;
    }

    const pf = appData.portfolios.find(p => p.id === appData.currentId);
    if (!pf) return;

    pf.transactions.push({
        id: Date.now(),
        type: parsedType,
        date: date,
        price: price,
        qty: qty
    });

    saveData();
    updateDashboard();
    closeModal('auto-add-modal');
}

// --- Global Exports ---
window.openPortfolio = openPortfolio;
window.goToPortfolioList = goToPortfolioList;
window.openCreateModal = openCreateModal;
window.openSettingsModal = openSettingsModal;
window.savePortfolio = savePortfolio;
window.deletePortfolio = deletePortfolio;
window.openTransactionModal = openTransactionModal;
window.setTransType = setTransType;
window.addTransaction = addTransaction;
window.deleteTransaction = deleteTransaction;
window.setQuickType = setQuickType;

// --- 결과 리포트 모달 로직 ---
function checkCycleCompletion(pf) {
    if (!pf || pf.transactions.length === 0) return;

    // 현재 상태 계산
    const stats = calculateStats(pf);

    // 보유 수량이 0이고, 거래 내역이 있으면서, 마지막 거래가 매도인 경우 (혹은 그냥 끝난경우)
    // calculateStats에서 qty가 0이면 종료된 것.
    if (stats.qty <= 0) {
        // 마지막 사이클 통계 계산
        const cycleStats = calculateLastCycleStats(pf);
        if (cycleStats) {
            showResultModal(pf, cycleStats);
        }
    }
}

function calculateLastCycleStats(pf) {
    // calculateStats와 동일한 정렬 로직 사용 (일관성 유지)
    const sorted = [...pf.transactions].sort((a, b) => {
        const dateCompare = new Date(a.date) - new Date(b.date);
        if (dateCompare !== 0) return dateCompare;
        return b.id - a.id;
    });

    let cycleStartIdx = 0;
    let qty = 0;
    let cycles = [];

    for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i];
        if (t.type === 'buy') {
            qty += t.qty;
        } else {
            qty -= t.qty;
        }

        if (qty <= 0) {
            qty = 0; // 보정

            // 사이클 종료 감지
            // 현재 인덱스(i)까지가 하나의 사이클
            const currentCycleTrans = sorted.slice(cycleStartIdx, i + 1);

            // 통계 집계
            let buyAmt = 0;
            let sellAmt = 0;
            let startDate = currentCycleTrans[0].date;
            let endDate = currentCycleTrans[currentCycleTrans.length - 1].date;

            currentCycleTrans.forEach(ct => {
                if (ct.type === 'buy') buyAmt += ct.price * ct.qty;
                else sellAmt += ct.price * ct.qty;
            });

            cycles.push({
                startDate,
                endDate,
                totalBuy: buyAmt,
                totalSell: sellAmt,
                netProfit: sellAmt - buyAmt,
                returnRate: buyAmt > 0 ? ((sellAmt - buyAmt) / buyAmt) * 100 : 0
            });

            cycleStartIdx = i + 1;
        }
    }

    if (cycles.length === 0) return null;

    // 가장 최근 완료된 사이클 반환
    const lastCycle = cycles[cycles.length - 1];

    // 진행률 계산 (설정된 분할일수 대비 경과일수)
    const start = new Date(lastCycle.startDate);
    const end = new Date(lastCycle.endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const targetDays = pf.settings.days || 40;
    let progress = (diffDays / targetDays) * 100;
    // progress = Math.min(progress, 100); // 100% 넘을 수 있음 (연장전)

    lastCycle.progress = progress;
    lastCycle.dateRange = `${lastCycle.startDate.replace(/-/g, '. ')} ~ ${lastCycle.endDate.replace(/-/g, '. ')}`;

    return lastCycle;
}

function showResultModal(pf, stats) {
    document.getElementById('res-name').textContent = pf.name;

    // 수익금
    const profit = stats.netProfit;
    const profitSign = profit >= 0 ? '+' : '';
    const profitEl = document.getElementById('res-profit');
    profitEl.textContent = profitSign + '$' + profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // 색상 클래스 초기화 후 적용
    profitEl.classList.remove('positive', 'negative');
    profitEl.classList.add(profit >= 0 ? 'positive' : 'negative'); // CSS에서 positive: red, negative: blue

    // 수익률
    const rate = stats.returnRate;
    const rateSign = rate >= 0 ? '+' : '';
    const rateEl = document.getElementById('res-rate');
    rateEl.textContent = rateSign + rate.toFixed(2) + '%';
    rateEl.classList.remove('positive', 'negative');
    rateEl.classList.add(rate >= 0 ? 'positive' : 'negative');

    document.getElementById('res-total-buy').textContent = '$' + stats.totalBuy.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('res-total-sell').textContent = '$' + stats.totalSell.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    document.getElementById('res-progress').textContent = stats.progress.toFixed(1) + '%';
    document.getElementById('res-date-range').textContent = stats.dateRange;

    // 양도세 (가정: 수익의 22%, 환율 1400원)
    // 사용자가 환율 설정을 할 수 없으므로 고정값 사용하거나 1400원 명시
    const exchangeRate = 1400;
    const tax = Math.max(0, profit * exchangeRate * 0.22);
    document.getElementById('res-tax').textContent = '₩' + Math.floor(tax).toLocaleString() + '원';

    // 이미지 변경 (수익: LOGO1.png / 손실: LOGO.png)
    const imgEl = document.querySelector('.result-image-header img');
    if (imgEl) {
        imgEl.src = profit >= 0 ? '../LOGO1.png' : '../LOGO.png';
        imgEl.alt = profit >= 0 ? 'Success' : 'Loss';
    }

    document.getElementById('result-modal').classList.remove('hidden');
}

// --- 포트폴리오 열기 ---
// 원본 openPortfolio 함수를 덮어쓰거나, export 된 것을 통해 접근해야 함.
// 하지만 이 파일 내에 정의된 openPortfolio를 직접 수정하는 것이 가장 확실함.
// 따라서 사용자가 요청한 대로 '포트폴리오 상세내역 들어갈때' 체크하도록 openPortfolio 함수 내에 추가해야 함.
// 여기서는 showResultModal 함수만 수정하고, openPortfolio는 별도 replace로 처리하는 것이 안전함.

function shareResult() {
    // 간단한 공유 기능 (클립보드 복사 등)
    // 실제 이미지 공유는 html2canvas 등이 필요하지만 여기서는 텍스트 복사로 대체하거나 알림
    const name = document.getElementById('res-name').textContent;
    const profit = document.getElementById('res-profit').textContent;
    const rate = document.getElementById('res-rate').textContent;

    const text = `[라오어 무한매수법] ${name} 매도 완료!\n수익: ${profit} (${rate})`;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alert('결과 내용이 클립보드에 복사되었습니다.');
        });
    } else {
        alert('공유하기: ' + text);
    }
}

// --- Window Export ---
window.quickAddTransaction = quickAddTransaction;
window.closeModal = closeModal;
window.toggleCollapse = toggleCollapse;
window.exportAllData = exportAllData;
window.triggerImport = triggerImport;
window.importAllData = importAllData;
window.openAutoAddModal = openAutoAddModal;
window.parseAndPreview = parseAndPreview;
window.confirmAutoAdd = confirmAutoAdd;
window.setParsedType = setParsedType;
// 드래그 앤 드롭
window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDrop = handleDrop;
window.handleDragEnd = handleDragEnd;
// 거래 수정
window.openEditModal = openEditModal;
window.setEditTransType = setEditTransType;
window.saveEditTransaction = saveEditTransaction;
window.shareResult = shareResult;
window.checkCycleCompletion = checkCycleCompletion;

