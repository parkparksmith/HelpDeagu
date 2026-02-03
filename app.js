// --- State Management ---
let appData = {
    portfolios: [], // Array of { id, name, settings, transactions }
    currentPortfolioId: null
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadAppData();
});

// --- Navigation Logic ---
function navigateTo(toolId) {
    document.getElementById('main-menu').classList.remove('active');
    document.getElementById('main-menu').classList.add('hidden');

    ['laor-portfolio-list', 'laor-dashboard', 'loan', 'savings'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
        document.getElementById(id).classList.remove('active');
    });

    const backBtn = document.getElementById('back-btn');
    backBtn.classList.remove('hidden');

    if (toolId === 'laor') {
        const target = document.getElementById('laor-portfolio-list');
        target.classList.remove('hidden');
        setTimeout(() => target.classList.add('active'), 10);
        document.getElementById('page-title').innerText = '내 포트폴리오';
        document.getElementById('laor-setup-btn').classList.add('hidden');
        renderPortfolioList();
    } else {
        const target = document.getElementById(toolId);
        target.classList.remove('hidden');
        setTimeout(() => target.classList.add('active'), 10);

        const titleMap = {
            'loan': '대출 이자 계산기',
            'savings': '예적금 이자 계산기'
        };
        document.getElementById('page-title').innerText = titleMap[toolId];
        document.getElementById('laor-setup-btn').classList.add('hidden');
    }
}

function goHome() {
    if (document.getElementById('laor-dashboard').classList.contains('active')) {
        navigateTo('laor');
        return;
    }

    ['laor-portfolio-list', 'laor-dashboard', 'loan', 'savings'].forEach(id => {
        document.getElementById(id).classList.remove('active');
        document.getElementById(id).classList.add('hidden');
    });

    const mainMenu = document.getElementById('main-menu');
    mainMenu.classList.remove('hidden');
    mainMenu.classList.add('active');

    document.getElementById('back-btn').classList.add('hidden');
    document.getElementById('laor-setup-btn').classList.add('hidden');
    document.getElementById('page-title').innerText = '경제 도구 모음';

    appData.currentPortfolioId = null;
}


// --- Data Persistence ---
function loadAppData() {
    const saved = localStorage.getItem('appData_v2');
    if (saved) {
        appData = JSON.parse(saved);
    } else {
        const oldState = localStorage.getItem('laorState');
        if (oldState) {
            const oldObj = JSON.parse(oldState);
            if (oldObj.settings && oldObj.settings.seed > 0) {
                const defaultPf = {
                    id: Date.now(),
                    name: '기본 포트폴리오',
                    settings: oldObj.settings,
                    transactions: oldObj.transactions || []
                };
                appData.portfolios.push(defaultPf);
                saveAppData();
            }
        }
    }
}

function saveAppData() {
    localStorage.setItem('appData_v2', JSON.stringify(appData));
}


// --- Portfolio Management ---

function openCreatePortfolioModal() {
    resetCreateModalState();
    document.getElementById('create-portfolio-modal').classList.remove('hidden');
    document.getElementById('pf-name').value = '';
    document.getElementById('pf-seed').value = '';
    document.getElementById('pf-period').value = '40';
    document.getElementById('pf-target-rate').value = '10';
}

function createPortfolio() {
    const name = document.getElementById('pf-name').value;
    const seed = parseFloat(document.getElementById('pf-seed').value);
    const period = parseFloat(document.getElementById('pf-period').value);
    const targetRate = parseFloat(document.getElementById('pf-target-rate').value);

    if (!name || !seed || !period || !targetRate) {
        alert("모든 값을 입력해주세요.");
        return;
    }

    const newPf = {
        id: Date.now(),
        name,
        settings: { seed, period, targetRate },
        transactions: []
    };

    appData.portfolios.push(newPf);
    saveAppData();
    closeModal('create-portfolio-modal');
    renderPortfolioList();
}

function deletePortfolio(e, id) {
    e.stopPropagation();
    if (confirm("정말 이 포트폴리오를 삭제하시겠습니까? 데이터는 복구할 수 없습니다.")) {
        appData.portfolios = appData.portfolios.filter(p => p.id !== id);
        saveAppData();
        renderPortfolioList();
    }
}

function renderPortfolioList() {
    const container = document.getElementById('portfolio-list-container');
    if (appData.portfolios.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ccc;">생성된 포트폴리오가 없습니다.<br>새 포트폴리오를 만들어보세요!</div>';
        return;
    }

    let html = '';
    appData.portfolios.forEach(pf => {
        let currentQty = 0;
        pf.transactions.forEach(t => {
            if (t.type === 'buy') currentQty += t.qty;
            else if (t.type === 'sell') currentQty -= t.qty;
        });
        if (currentQty < 0) currentQty = 0;

        html += `
            <div class="portfolio-card-item" onclick="openPortfolio(${pf.id})">
                <span class="pf-name">${pf.name}</span>
                <div class="pf-info">시드: $${pf.settings.seed.toLocaleString()}</div>
                <div class="pf-info">보유: ${currentQty}주</div>
                <div class="pf-info">세팅: ${pf.settings.period}분할 / ${pf.settings.targetRate}%</div>
                <div class="pf-delete-btn" onclick="deletePortfolio(event, ${pf.id})">
                    <span class="material-icons-round">delete</span>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function openPortfolio(id) {
    appData.currentPortfolioId = id;

    document.getElementById('laor-portfolio-list').classList.remove('active');
    document.getElementById('laor-portfolio-list').classList.add('hidden');

    const dashboard = document.getElementById('laor-dashboard');
    dashboard.classList.remove('hidden');
    setTimeout(() => dashboard.classList.add('active'), 10);

    const pf = appData.portfolios.find(p => p.id === id);
    document.getElementById('page-title').innerText = pf.name;
    document.getElementById('laor-setup-btn').classList.remove('hidden');

    updateDashboard();
}

// --- Edit Portfolio ---
function openLaorSetup() {
    const pf = getActivePortfolio();
    if (!pf) return;

    document.getElementById('create-portfolio-modal').classList.remove('hidden');
    document.querySelector('#create-portfolio-modal h3').innerText = '포트폴리오 설정 수정';

    document.getElementById('pf-name').value = pf.name;
    document.getElementById('pf-seed').value = pf.settings.seed;
    document.getElementById('pf-period').value = pf.settings.period;
    document.getElementById('pf-target-rate').value = pf.settings.targetRate;

    const saveBtn = document.querySelector('#create-portfolio-modal .action-btn.primary');
    saveBtn.innerText = '수정 완료';
    saveBtn.onclick = updatePortfolioSettings;
}

function updatePortfolioSettings() {
    const pf = getActivePortfolio();
    if (!pf) return;

    const name = document.getElementById('pf-name').value;
    const seed = parseFloat(document.getElementById('pf-seed').value);
    const period = parseFloat(document.getElementById('pf-period').value);
    const targetRate = parseFloat(document.getElementById('pf-target-rate').value);

    if (!name || !seed || !period || !targetRate) {
        alert("모든 값을 입력해주세요.");
        return;
    }

    pf.name = name;
    pf.settings = { seed, period, targetRate };

    saveAppData();
    closeModal('create-portfolio-modal');

    document.getElementById('page-title').innerText = pf.name;
    updateDashboard();
    resetCreateModalState();
}

function resetCreateModalState() {
    const saveBtn = document.querySelector('#create-portfolio-modal .action-btn.primary');
    saveBtn.innerText = '생성';
    saveBtn.onclick = createPortfolio;
    document.querySelector('#create-portfolio-modal h3').innerText = '새 포트폴리오 만들기';
}


// --- Dashboard Logic ---

function getActivePortfolio() {
    return appData.portfolios.find(p => p.id === appData.currentPortfolioId);
}

function openTransactionModal(type) {
    document.getElementById('transaction-modal').classList.remove('hidden');
    document.getElementById('trans-type').value = type;
    document.getElementById('trans-modal-title').innerText = type === 'buy' ? '매수 입력' : '매도 입력';
    document.getElementById('trans-date').valueAsDate = new Date();
    document.getElementById('trans-price').value = '';
    document.getElementById('trans-qty').value = '1';
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function addTransaction() {
    const pf = getActivePortfolio();
    if (!pf) return;

    const date = document.getElementById('trans-date').value;
    const price = parseFloat(document.getElementById('trans-price').value);
    const qty = parseFloat(document.getElementById('trans-qty').value);
    const type = document.getElementById('trans-type').value;

    if (!date || !price || !qty) {
        alert("모든 정보를 입력해주세요.");
        return;
    }

    pf.transactions.push({ id: Date.now(), type, date, price, qty });
    pf.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    saveAppData();
    updateDashboard();
    closeModal('transaction-modal');
}

function deleteTransaction(event, id) {
    if (event) event.stopPropagation();

    const pf = getActivePortfolio();
    if (!pf) return;

    // 확인 창 (네/아니오)
    if (confirm('선택한 거래 내역을 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.')) {
        pf.transactions = pf.transactions.filter(t => t.id != id);
        saveAppData();
        updateDashboard();
    }
}

function updateDashboard() {
    const pf = getActivePortfolio();
    if (!pf) return;

    document.getElementById('current-portfolio-name').innerText = `${pf.name} 가이드`;

    // Transactions
    const listEl = document.getElementById('transaction-list');
    if (pf.transactions.length === 0) {
        listEl.innerHTML = '<div class="empty-state">내역이 없습니다.</div>';
    } else {
        let html = '';
        pf.transactions.forEach(t => {
            const typeLabel = t.type === 'buy' ? '매수' : '매도';
            html += `
                <div class="transaction-item">
                    <span class="trans-type ${t.type}">${typeLabel}</span>
                    <span>${t.date}</span>
                    <span class="text-right">$${t.price.toFixed(2)}</span>
                    <span class="text-right">${t.qty}</span>
                    <span class="delete-btn" onclick="deleteTransaction(event, ${t.id})">
                        <span class="material-icons-round" style="font-size:18px">close</span>
                    </span>
                </div>
            `;
        });
        listEl.innerHTML = html;
    }

    // Calculations
    const sortedTrans = [...pf.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    let currentQty = 0;
    let totalSpent = 0;
    sortedTrans.forEach(t => {
        if (t.type === 'buy') { totalSpent += t.price * t.qty; currentQty += t.qty; }
        else if (t.type === 'sell') {
            if (currentQty > 0) { const avg = totalSpent / currentQty; totalSpent -= avg * t.qty; currentQty -= t.qty; }
        }
    });
    if (currentQty < 0) currentQty = 0;
    if (totalSpent < 0) totalSpent = 0;
    const avgPrice = currentQty > 0 ? totalSpent / currentQty : 0;

    document.getElementById('laor-current-price').innerText = `평단: $${avgPrice.toFixed(2)}`;
    document.getElementById('laor-current-qty').innerText = `보유: ${currentQty}주`;

    // Guide Logic
    // Guide Logic
    const { seed, period, targetRate } = pf.settings;
    const onePortion = seed / period;
    // Estimate current iteration based on holding value (approximate)
    // If we have strict history, we could count days, but value-based is robust.
    const usedSeed = totalSpent;
    const currentProgress = onePortion > 0 ? usedSeed / onePortion : 0;
    const isLateStage = currentProgress >= 20;

    let buy1Price = avgPrice > 0 ? avgPrice : 0;

    // V2.2 Standard: 2nd Buy is typically at LOC (Avg * 1.10) to ensure purchase in rising market up to 10%
    let buy2Price = avgPrice * 1.10;

    // Half portion for normal split
    const halfPortion = onePortion / 2;

    let buyHtml = '';

    if (avgPrice <= 0) {
        // First buy
        const firstDayQty = onePortion > 0 ? Math.floor(onePortion / 100) : 0;
        buyHtml = `<div class="guideline">
            <span>첫 매수 (RSI<60 관찰)</span>
            <strong>1회차 분량 ($${onePortion.toFixed(0)})</strong>
        </div>`;
    } else {
        if (!isLateStage) {
            // < 20th Iteration
            // 1. Half at LOC Avg
            // 2. Half at LOC Avg+10%
            let b1Qty = buy1Price > 0 ? Math.floor(halfPortion / buy1Price) : 0;
            let b2Qty = buy2Price > 0 ? Math.floor(halfPortion / buy2Price) : 0;
            if (b1Qty < 1) b1Qty = 1; if (b2Qty < 1) b2Qty = 1;

            buyHtml += `
                <div class="guideline">
                    <span>LOC 평단 ($${buy1Price.toFixed(2)})</span>
                    <strong>${b1Qty}주 (0.5회)</strong>
                </div>
                <div class="guideline">
                    <span>LOC 평단+10% ($${buy2Price.toFixed(2)})</span>
                    <strong>${b2Qty}주 (0.5회)</strong>
                </div>
            `;
        } else {
            // >= 20th Iteration
            // Buy: 1 portion at LOC Avg (No upper buy)
            let b1Qty = buy1Price > 0 ? Math.floor(onePortion / buy1Price) : 0;
            if (b1Qty < 1) b1Qty = 1;

            buyHtml += `
                <div class="guideline">
                    <span>LOC 평단 ($${buy1Price.toFixed(2)})</span>
                    <strong>${b1Qty}주 (1회)</strong>
                </div>
                <div class="guideline text-dim">
                    <span>후반전 (20회↑): 상단 매수 없음</span>
                </div>
            `;
        }
    }
    document.getElementById('laor-buy-guide').innerHTML = buyHtml;

    // +@ Logic (Large Drop) - Enhanced drop levels
    // Standard V2.2 typically checks: -15%, -20%, -30%, -40%...
    // Some variations use 10% steps. Let's provide a wider range.
    const dropLevels = [10, 15, 20, 25, 30, 40, 50];
    let plusHtml = '';
    if (avgPrice > 0) {
        dropLevels.forEach(drop => {
            const dropPrice = avgPrice * (1 - drop / 100);
            const dropQty = dropPrice > 0 ? Math.floor(onePortion / dropPrice) : 0;
            plusHtml += `
                <div class="sub-guide-row">
                    <span>-${drop}% ($${dropPrice.toFixed(2)})</span>
                    <strong>LOC ${dropQty}주</strong>
                </div>
            `;
        });
    } else {
        plusHtml = '<div style="text-align:center; color:#888;">평단가 생성 후 표시됩니다.</div>';
    }
    document.getElementById('laor-buy-plus-guide').innerHTML = plusHtml;

    // Sell Logic
    // V2.2: <20 -> Sell at Target. >=20 -> Split sell 5% / 10%
    const targetSellPrice = avgPrice * (1 + targetRate / 100);
    const earlySellPrice = avgPrice * 1.05; // 5%

    let sellHtml = '';

    if (currentQty > 0) {
        if (!isLateStage) {
            // Normal Sell
            sellHtml = `
                <div class="guideline">
                    <span>지정가 ${targetRate}% ($${targetSellPrice.toFixed(2)})</span>
                    <strong>전량 매도</strong>
                </div>
             `;
        } else {
            // Late Stage Sell
            let s1Qty = Math.floor(currentQty * 0.25); // 25%
            let s2Qty = currentQty - s1Qty; // Remainder

            sellHtml = `
                <div class="guideline">
                    <span>지정가 5% ($${earlySellPrice.toFixed(2)})</span>
                    <strong>${s1Qty}주 (25%)</strong>
                </div>
                <div class="guideline">
                    <span>지정가 ${targetRate}% ($${targetSellPrice.toFixed(2)})</span>
                    <strong>${s2Qty}주 (75%)</strong>
                </div>
             `;
        }
    } else {
        sellHtml = '<div class="empty-state">보유 수량 없음</div>';
    }

    document.getElementById('laor-sell-guide').innerHTML = sellHtml;
}

// Reuse Loan/Savings
function calculateLoan() {
    const principal = parseFloat(document.getElementById('loan-amount').value);
    const rate = parseFloat(document.getElementById('loan-rate').value) / 100 / 12;
    const months = parseFloat(document.getElementById('loan-months').value);
    const resultBox = document.getElementById('loan-result');
    if (!principal || !months) { resultBox.innerHTML = "❌ 값을 입력하세요."; return; }
    let monthlyPayment = 0; let totalInterest = 0; let totalPayment = 0;
    if (rate === 0) { monthlyPayment = principal / months; totalPayment = principal; }
    else { monthlyPayment = (principal * rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1); totalPayment = monthlyPayment * months; totalInterest = totalPayment - principal; }
    const fmt = (n) => Math.round(n).toLocaleString() + "원";
    resultBox.innerHTML = `월 납입금: ${fmt(monthlyPayment)}<br>총 이자: ${fmt(totalInterest)}<br>총 상환: ${fmt(totalPayment)}`;
}

function calculateSavings() {
    const type = document.getElementById('savings-type').value;
    const amount = parseFloat(document.getElementById('savings-amount').value);
    const months = parseFloat(document.getElementById('savings-months').value);
    const rate = parseFloat(document.getElementById('savings-rate').value) / 100;
    const resultBox = document.getElementById('savings-result');
    if (!amount || !months) { resultBox.innerHTML = "❌ 값을 입력하세요."; return; }
    let prin = 0; let int = 0;
    if (type === 'deposit') { prin = amount; int = amount * rate * (months / 12); }
    else { prin = amount * months; int = amount * (months * (months + 1) / 2) * (rate / 12); }
    const tax = int * 0.154;
    resultBox.innerHTML = `원금: ${Math.round(prin).toLocaleString()}원<br>세후 이자: ${Math.round(int - tax).toLocaleString()}원<br>수령액: ${Math.round(prin + int - tax).toLocaleString()}원`;
}

// --- Data Backup/Restore ---
function exportData() {
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `money_tools_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function triggerImport() {
    document.getElementById('import-file').click();
}

function importData(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const json = JSON.parse(e.target.result);
            if (!json.portfolios) {
                alert("올바르지 않은 데이터 파일입니다.");
                return;
            }
            if (confirm("기존 데이터가 덮어씌워집니다. 계속하시겠습니까?")) {
                appData = json;
                saveAppData();
                renderPortfolioList();
                alert("데이터가 성공적으로 복원되었습니다.");
            }
        } catch (err) {
            alert("파일을 읽는 중 오류가 발생했습니다: " + err.message);
        }
        input.value = ''; // Reset input
    };
    reader.readAsText(file);
}

// --- Global Exports ---
window.exportData = exportData;
window.triggerImport = triggerImport;
window.importData = importData;
window.navigateTo = navigateTo;
window.goHome = goHome;
window.openCreatePortfolioModal = openCreatePortfolioModal;
window.createPortfolio = createPortfolio;
window.deletePortfolio = deletePortfolio;
window.openPortfolio = openPortfolio;
window.getActivePortfolio = getActivePortfolio;
window.openLaorSetup = openLaorSetup;
window.updatePortfolioSettings = updatePortfolioSettings;
window.resetCreateModalState = resetCreateModalState;

// Transaction & Modal Exports
window.openTransactionModal = openTransactionModal;
window.closeModal = closeModal;
window.addTransaction = addTransaction;
window.deleteTransaction = deleteTransaction;
window.calculateLoan = calculateLoan;
window.calculateSavings = calculateSavings;
