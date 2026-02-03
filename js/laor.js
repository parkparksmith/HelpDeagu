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

// --- 포트폴리오 목록 ---
function renderPortfolioList() {
    const grid = document.getElementById('portfolio-grid');
    
    if (appData.portfolios.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ccc;">
                포트폴리오가 없습니다.<br>새 포트폴리오를 만들어보세요!
            </div>
        `;
        return;
    }

    let html = '';
    appData.portfolios.forEach(pf => {
        const stats = calculateStats(pf);
        const dailyAmount = pf.settings.budget / pf.settings.days;
        
        html += `
            <div class="portfolio-card" onclick="openPortfolio(${pf.id})">
                <span class="name">${pf.name}</span>
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
                <button class="delete-btn" onclick="deletePortfolio(event, ${pf.id})">
                    <span class="material-icons-round">delete</span>
                </button>
            </div>
        `;
    });
    
    grid.innerHTML = html;
}

// --- 포트폴리오 통계 계산 ---
function calculateStats(pf) {
    const sorted = [...pf.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let qty = 0;
    let totalCost = 0;
    let cumulativeBuy = 0;

    sorted.forEach(t => {
        if (t.type === 'buy') {
            totalCost += t.price * t.qty;
            qty += t.qty;
            cumulativeBuy += t.price * t.qty;
        } else if (t.type === 'sell') {
            if (qty > 0) {
                const avgCost = totalCost / qty;
                totalCost -= avgCost * t.qty;
                qty -= t.qty;
            }
        }
    });

    if (qty < 0) qty = 0;
    if (totalCost < 0) totalCost = 0;

    const avgPrice = qty > 0 ? totalCost / qty : 0;
    const dailyAmount = pf.settings.budget / pf.settings.days;
    const T = dailyAmount > 0 ? Math.round((cumulativeBuy / dailyAmount) * 100) / 100 : 0;
    
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
        starPercent
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
    const { qty, avgPrice, cumulativeBuy, dailyAmount, T, starPercent } = stats;
    const starRate = starPercent / 100;
    const isFirstHalf = T < 20;
    const isQuarterStop = T > 39;

    // 지표 업데이트
    document.getElementById('metric-t').textContent = T.toFixed(2);
    document.getElementById('metric-star').textContent = starPercent.toFixed(2) + '%';
    document.getElementById('metric-qty').textContent = qty + '주';
    document.getElementById('metric-avg').textContent = formatUSD(avgPrice);
    document.getElementById('metric-cumulative').textContent = '$' + cumulativeBuy.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('metric-daily').textContent = '$' + dailyAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

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
    let crashHtml = '';
    if (avgPrice > 0 && dailyAmount > 0) {
        const drops = [10, 15, 20, 25, 30, 40, 50];
        drops.forEach(d => {
            const dropPrice = Math.round(avgPrice * (1 - d / 100) * 100) / 100;
            const dropQty = Math.floor(dailyAmount / dropPrice);
            crashHtml += `
                <div class="guide-row crash">
                    <span class="label">-${d}%</span>
                    <span class="value">
                        <span class="price">${formatUSD(dropPrice)}</span>
                        <span class="qty">LOC ${dropQty}주</span>
                    </span>
                </div>
            `;
        });
    } else {
        crashHtml = '<div class="empty-state">평단가 형성 후 표시됩니다</div>';
    }
    document.getElementById('crash-guide').innerHTML = crashHtml;

    // --- 거래 내역 ---
    renderTransactions(pf);
}

function renderTransactions(pf) {
    const list = document.getElementById('transaction-list');
    
    if (pf.transactions.length === 0) {
        list.innerHTML = '<div class="empty-state">거래 내역이 없습니다.</div>';
        return;
    }

    const sorted = [...pf.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let html = '';
    sorted.forEach(t => {
        html += `
            <div class="transaction-item">
                <span class="type ${t.type}">${t.type === 'buy' ? '매수' : '매도'}</span>
                <span>${t.date}</span>
                <span class="text-right">${formatUSD(t.price)}</span>
                <span class="text-right">${t.qty}주</span>
                <button class="del-btn" onclick="deleteTransaction(${t.id})">
                    <span class="material-icons-round" style="font-size:18px;">close</span>
                </button>
            </div>
        `;
    });
    
    list.innerHTML = html;
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
    closeModal('transaction-modal');
}

function deleteTransaction(id) {
    if (!confirm('이 거래를 삭제하시겠습니까?')) return;

    const pf = appData.portfolios.find(p => p.id === appData.currentId);
    if (!pf) return;

    pf.transactions = pf.transactions.filter(t => t.id !== id);
    saveData();
    updateDashboard();
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
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.portfolios) {
                alert('올바르지 않은 파일입니다.');
                return;
            }
            if (confirm('기존 데이터를 덮어씁니다. 계속하시겠습니까?')) {
                appData = data;
                saveData();
                renderPortfolioList();
                alert('복원 완료!');
            }
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
