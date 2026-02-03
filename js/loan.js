// 대출 이자 계산기

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
    const amountInput = document.getElementById('loan-amount');
    amountInput.addEventListener('input', () => formatInputNumber(amountInput));
});

function calculateLoan() {
    const principal = parseFormattedNumber(document.getElementById('loan-amount').value);
    const annualRate = parseFloat(document.getElementById('loan-rate').value);
    const months = parseInt(document.getElementById('loan-months').value);
    const loanType = document.getElementById('loan-type').value;

    if (!principal || !months || principal <= 0 || months <= 0) {
        alert("대출 금액과 기간을 올바르게 입력해주세요.");
        return;
    }

    const monthlyRate = (annualRate || 0) / 100 / 12;
    let schedule = [];
    let totalInterest = 0;
    let totalPrincipal = 0;
    let remainingPrincipal = principal;
    let monthlyPayment = 0;

    if (loanType === 'equal-payment') {
        // 원리금 균등 상환
        if (monthlyRate === 0) {
            monthlyPayment = principal / months;
        } else {
            monthlyPayment = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
        }

        for (let i = 1; i <= months; i++) {
            const interestPayment = remainingPrincipal * monthlyRate;
            const principalPayment = monthlyPayment - interestPayment;
            remainingPrincipal -= principalPayment;

            if (remainingPrincipal < 0) remainingPrincipal = 0;

            schedule.push({
                month: i,
                principal: principalPayment,
                interest: interestPayment,
                payment: monthlyPayment,
                remaining: remainingPrincipal
            });

            totalInterest += interestPayment;
            totalPrincipal += principalPayment;
        }
    } else if (loanType === 'equal-principal') {
        // 원금 균등 상환
        const principalPayment = principal / months;

        for (let i = 1; i <= months; i++) {
            const interestPayment = remainingPrincipal * monthlyRate;
            const payment = principalPayment + interestPayment;
            remainingPrincipal -= principalPayment;

            if (remainingPrincipal < 0) remainingPrincipal = 0;

            schedule.push({
                month: i,
                principal: principalPayment,
                interest: interestPayment,
                payment: payment,
                remaining: remainingPrincipal
            });

            totalInterest += interestPayment;
            totalPrincipal += principalPayment;
        }

        // 첫 달 납입금을 기준 월 납입금으로 표시
        monthlyPayment = schedule[0].payment;
    } else if (loanType === 'bullet') {
        // 만기 일시 상환
        const monthlyInterest = principal * monthlyRate;

        for (let i = 1; i <= months; i++) {
            const isLastMonth = i === months;
            schedule.push({
                month: i,
                principal: isLastMonth ? principal : 0,
                interest: monthlyInterest,
                payment: isLastMonth ? principal + monthlyInterest : monthlyInterest,
                remaining: isLastMonth ? 0 : principal
            });

            totalInterest += monthlyInterest;
        }

        totalPrincipal = principal;
        monthlyPayment = monthlyInterest;
    }

    // Display Summary
    const summaryEl = document.getElementById('loan-summary');
    const placeholderEl = document.getElementById('loan-placeholder');
    const tableContainerEl = document.getElementById('loan-table-container');

    summaryEl.style.display = 'grid';
    placeholderEl.style.display = 'none';
    tableContainerEl.style.display = 'block';

    document.getElementById('summary-monthly').textContent = formatNumber(monthlyPayment) + '원';
    document.getElementById('summary-interest').textContent = formatNumber(totalInterest) + '원';
    document.getElementById('summary-total').textContent = formatNumber(totalPrincipal + totalInterest) + '원';

    // Display Monthly Table
    const tbody = document.getElementById('loan-table-body');
    const tfoot = document.getElementById('loan-table-foot');

    let tbodyHtml = '';
    schedule.forEach(row => {
        tbodyHtml += `
            <tr>
                <td>${row.month}</td>
                <td>${formatNumber(row.principal)}</td>
                <td>${formatNumber(row.interest)}</td>
                <td>${formatNumber(row.payment)}</td>
                <td>${formatNumber(row.remaining)}</td>
            </tr>
        `;
    });
    tbody.innerHTML = tbodyHtml;

    // Footer with totals
    tfoot.innerHTML = `
        <tr>
            <td>합계</td>
            <td>${formatNumber(totalPrincipal)}</td>
            <td>${formatNumber(totalInterest)}</td>
            <td>${formatNumber(totalPrincipal + totalInterest)}</td>
            <td>-</td>
        </tr>
    `;
}

// Global export
window.calculateLoan = calculateLoan;
