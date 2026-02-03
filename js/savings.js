// 예적금 이자 계산기

let currentType = 'deposit';

function formatNumber(num) {
    return Math.round(num).toLocaleString();
}

// 쉼표 자동 추가 포맷팅
function formatInputNumber(input) {
    let value = input.value.replace(/[^\d]/g, '');
    if (value) {
        input.value = parseInt(value, 10).toLocaleString();
    }
}

// 쉼표 제거하고 숫자로 변환
function parseFormattedNumber(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/,/g, '')) || 0;
}

// 페이지 로드 시 이벤트 리스너 등록
document.addEventListener('DOMContentLoaded', () => {
    const amountInput = document.getElementById('savings-amount');
    amountInput.addEventListener('input', () => formatInputNumber(amountInput));
});

function switchTab(type) {
    currentType = type;
    
    document.getElementById('tab-deposit').classList.remove('active');
    document.getElementById('tab-saving').classList.remove('active');
    document.getElementById('tab-' + type).classList.add('active');

    const amountLabel = document.getElementById('amount-label');
    if (type === 'deposit') {
        amountLabel.textContent = '예치 금액 (원)';
    } else {
        amountLabel.textContent = '월 납입금 (원)';
    }

    // Reset results
    document.getElementById('savings-summary').style.display = 'none';
    document.getElementById('savings-table-container').style.display = 'none';
    document.getElementById('savings-placeholder').style.display = 'block';
}

function calculateSavings() {
    const amount = parseFormattedNumber(document.getElementById('savings-amount').value);
    const months = parseInt(document.getElementById('savings-months').value);
    const annualRate = parseFloat(document.getElementById('savings-rate').value);
    const taxType = document.getElementById('tax-type').value;

    if (!amount || !months || amount <= 0 || months <= 0) {
        alert("금액과 기간을 올바르게 입력해주세요.");
        return;
    }

    const monthlyRate = (annualRate || 0) / 100 / 12;
    
    // 세금률 결정
    let taxRate = 0.154; // 일반 과세 15.4%
    if (taxType === 'preferential') {
        taxRate = 0.095; // 세금 우대 9.5%
    } else if (taxType === 'exempt') {
        taxRate = 0; // 비과세
    }

    let schedule = [];
    let totalPrincipal = 0;
    let totalInterest = 0;
    let cumulativePrincipal = 0;
    let cumulativeInterest = 0;

    if (currentType === 'deposit') {
        // 예금 (목돈 거치) - 단리 계산
        totalPrincipal = amount;
        cumulativePrincipal = amount;
        
        for (let i = 1; i <= months; i++) {
            const monthlyInterest = amount * monthlyRate;
            cumulativeInterest += monthlyInterest;
            
            schedule.push({
                month: i,
                deposit: i === 1 ? amount : 0,
                cumulativePrincipal: cumulativePrincipal,
                monthlyInterest: monthlyInterest,
                cumulativeInterest: cumulativeInterest
            });
        }
        
        totalInterest = cumulativeInterest;
    } else {
        // 적금 (매월 납입) - 단리 계산
        // 적금 이자 = 월납입금 × (n(n+1)/2) × (월이율)
        
        for (let i = 1; i <= months; i++) {
            cumulativePrincipal += amount;
            // 이번 달 납입금의 남은 기간에 대한 이자
            const remainingMonths = months - i + 1;
            const monthlyInterest = amount * monthlyRate * remainingMonths;
            cumulativeInterest += monthlyInterest;
            
            schedule.push({
                month: i,
                deposit: amount,
                cumulativePrincipal: cumulativePrincipal,
                monthlyInterest: monthlyInterest,
                cumulativeInterest: 0 // 적금은 만기에 일괄 지급이므로 누적 표시 대신 '납입분 이자' 표시
            });
        }
        
        totalPrincipal = amount * months;
        totalInterest = cumulativeInterest;
        
        // 적금은 누적이자를 다르게 계산 (만기시 수령 기준)
        let runningInterest = 0;
        for (let i = 0; i < schedule.length; i++) {
            runningInterest += schedule[i].monthlyInterest;
            schedule[i].cumulativeInterest = runningInterest;
        }
    }

    // 세금 계산
    const tax = totalInterest * taxRate;
    const afterTaxInterest = totalInterest - tax;

    // Display Summary
    const summaryEl = document.getElementById('savings-summary');
    const placeholderEl = document.getElementById('savings-placeholder');
    const tableContainerEl = document.getElementById('savings-table-container');

    summaryEl.style.display = 'grid';
    placeholderEl.style.display = 'none';
    tableContainerEl.style.display = 'block';

    document.getElementById('summary-principal').textContent = formatNumber(totalPrincipal) + '원';
    document.getElementById('summary-interest-before').textContent = formatNumber(totalInterest) + '원';
    document.getElementById('summary-tax').textContent = '-' + formatNumber(tax) + '원';
    document.getElementById('summary-interest-after').textContent = formatNumber(afterTaxInterest) + '원';
    document.getElementById('summary-total').textContent = formatNumber(totalPrincipal + afterTaxInterest) + '원';

    // Update table header
    const thead = document.getElementById('savings-table-head');
    if (currentType === 'deposit') {
        thead.innerHTML = `
            <tr>
                <th>회차</th>
                <th>예치금</th>
                <th>원금</th>
                <th>월이자</th>
                <th>누적</th>
            </tr>
        `;
    } else {
        thead.innerHTML = `
            <tr>
                <th>회차</th>
                <th>납입</th>
                <th>누적원금</th>
                <th>이자</th>
                <th>누적</th>
            </tr>
        `;
    }

    // Display Monthly Table
    const tbody = document.getElementById('savings-table-body');
    const tfoot = document.getElementById('savings-table-foot');

    let tbodyHtml = '';
    schedule.forEach(row => {
        tbodyHtml += `
            <tr>
                <td>${row.month}</td>
                <td>${formatNumber(row.deposit)}</td>
                <td>${formatNumber(row.cumulativePrincipal)}</td>
                <td>${formatNumber(row.monthlyInterest)}</td>
                <td>${formatNumber(row.cumulativeInterest)}</td>
            </tr>
        `;
    });
    tbody.innerHTML = tbodyHtml;

    // Footer with totals
    const taxLabel = taxType === 'normal' ? '15.4%' : taxType === 'preferential' ? '9.5%' : '비과세';
    tfoot.innerHTML = `
        <tr>
            <td>합계</td>
            <td>${formatNumber(currentType === 'deposit' ? amount : totalPrincipal)}</td>
            <td>${formatNumber(totalPrincipal)}</td>
            <td colspan="2" style="text-align:left; padding-left:8px;">
                세전 ${formatNumber(totalInterest)}<br>
                세금(${taxLabel}) -${formatNumber(tax)}<br>
                <strong>세후 ${formatNumber(afterTaxInterest)}</strong>
            </td>
        </tr>
    `;
}

// Global exports
window.switchTab = switchTab;
window.calculateSavings = calculateSavings;
