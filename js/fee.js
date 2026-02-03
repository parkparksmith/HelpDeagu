// 복비(중개보수) 계산기

document.addEventListener('DOMContentLoaded', () => {
    // 라디오 버튼 이벤트
    document.querySelectorAll('input[name="trade-type"]').forEach(radio => {
        radio.addEventListener('change', handleTradeTypeChange);
    });

    // 금액 입력 포맷팅
    ['price', 'deposit', 'monthly-rent'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => formatNumberInput(input));
        }
    });
});

// 거래 유형 변경 처리
function handleTradeTypeChange() {
    const tradeType = document.querySelector('input[name="trade-type"]:checked').value;
    const saleGroup = document.getElementById('sale-input-group');
    const monthlyGroup = document.getElementById('monthly-input-group');

    if (tradeType === 'monthly') {
        saleGroup.classList.add('hidden');
        monthlyGroup.classList.remove('hidden');
    } else {
        saleGroup.classList.remove('hidden');
        monthlyGroup.classList.add('hidden');
    }
}

// 숫자 포맷팅
function formatNumberInput(input) {
    let value = input.value.replace(/[^\d]/g, '');
    if (value) {
        input.value = parseInt(value, 10).toLocaleString();
    }
}

// 포맷된 숫자 파싱
function parseFormattedNumber(str) {
    if (!str) return 0;
    return parseInt(str.replace(/,/g, ''), 10) || 0;
}

// 금액 포맷팅
function formatCurrency(amount) {
    return Math.round(amount).toLocaleString() + '원';
}

// 복비 계산
function calculateFee() {
    const propertyType = document.querySelector('input[name="property-type"]:checked').value;
    const tradeType = document.querySelector('input[name="trade-type"]:checked').value;
    
    let transactionAmount = 0; // 만원 단위
    let convertedAmount = null; // 환산보증금 (월세인 경우)

    if (tradeType === 'monthly') {
        const deposit = parseFormattedNumber(document.getElementById('deposit').value);
        const monthlyRent = parseFormattedNumber(document.getElementById('monthly-rent').value);
        
        if (deposit === 0 && monthlyRent === 0) {
            alert('보증금 또는 월세를 입력해주세요.');
            return;
        }

        // 환산보증금 = 보증금 + (월세 × 100)
        convertedAmount = deposit + (monthlyRent * 100);
        
        // 환산보증금이 5천만원 미만이면 실제 보증금 기준
        if (convertedAmount < 5000) {
            transactionAmount = deposit;
        } else {
            transactionAmount = convertedAmount;
        }
    } else {
        transactionAmount = parseFormattedNumber(document.getElementById('price').value);
        
        if (transactionAmount === 0) {
            alert('거래금액을 입력해주세요.');
            return;
        }
    }

    // 요율 및 상한액 계산
    const { rate, limit, note } = getRate(propertyType, tradeType, transactionAmount);
    
    // 중개보수 계산 (만원 → 원)
    let fee = transactionAmount * 10000 * (rate / 100);
    
    // 상한액 적용
    let limitApplied = false;
    if (limit && fee > limit) {
        fee = limit;
        limitApplied = true;
    }

    // 결과 표시
    displayResult({
        fee,
        transactionAmount: transactionAmount * 10000,
        convertedAmount: convertedAmount ? convertedAmount * 10000 : null,
        rate,
        limit,
        limitApplied,
        note
    });
}

// 요율 조회
function getRate(propertyType, tradeType, amount) {
    // 상가/토지
    if (propertyType === 'commercial') {
        return {
            rate: 0.9,
            limit: null,
            note: '상가/토지는 0.9% 이내에서 협의'
        };
    }

    // 오피스텔
    if (propertyType === 'officetel') {
        if (tradeType === 'sale') {
            return { rate: 0.5, limit: null, note: '오피스텔 매매' };
        } else {
            return { rate: 0.4, limit: null, note: '오피스텔 임대차' };
        }
    }

    // 주택 - 매매
    if (tradeType === 'sale') {
        if (amount < 5000) {
            return { rate: 0.6, limit: 250000, note: '주택 매매 (5천만원 미만)' };
        } else if (amount < 20000) {
            return { rate: 0.5, limit: 800000, note: '주택 매매 (5천만~2억 미만)' };
        } else if (amount < 90000) {
            return { rate: 0.4, limit: null, note: '주택 매매 (2억~9억 미만)' };
        } else if (amount < 120000) {
            return { rate: 0.5, limit: null, note: '주택 매매 (9억~12억 미만)' };
        } else if (amount < 150000) {
            return { rate: 0.6, limit: null, note: '주택 매매 (12억~15억 미만)' };
        } else {
            return { rate: 0.7, limit: null, note: '주택 매매 (15억 이상)' };
        }
    }

    // 주택 - 임대차 (전세/월세)
    if (amount < 5000) {
        return { rate: 0.5, limit: 200000, note: '주택 임대차 (5천만원 미만)' };
    } else if (amount < 10000) {
        return { rate: 0.4, limit: 300000, note: '주택 임대차 (5천만~1억 미만)' };
    } else if (amount < 60000) {
        return { rate: 0.3, limit: null, note: '주택 임대차 (1억~6억 미만)' };
    } else if (amount < 120000) {
        return { rate: 0.4, limit: null, note: '주택 임대차 (6억~12억 미만)' };
    } else if (amount < 150000) {
        return { rate: 0.5, limit: null, note: '주택 임대차 (12억~15억 미만)' };
    } else {
        return { rate: 0.6, limit: null, note: '주택 임대차 (15억 이상)' };
    }
}

// 결과 표시
function displayResult(result) {
    const resultCard = document.getElementById('result-card');
    resultCard.classList.remove('hidden');

    document.getElementById('result-fee').textContent = formatCurrency(result.fee);
    document.getElementById('result-note').textContent = result.note;
    
    document.getElementById('detail-price').textContent = formatCurrency(result.transactionAmount);
    document.getElementById('detail-rate').textContent = result.rate + '%';

    // 환산보증금 표시
    const convertedRow = document.getElementById('converted-price-row');
    if (result.convertedAmount) {
        convertedRow.style.display = 'flex';
        document.getElementById('detail-converted').textContent = formatCurrency(result.convertedAmount);
    } else {
        convertedRow.style.display = 'none';
    }

    // 상한액 표시
    const limitRow = document.getElementById('limit-row');
    if (result.limitApplied && result.limit) {
        limitRow.style.display = 'flex';
        document.getElementById('detail-limit').textContent = formatCurrency(result.limit);
    } else {
        limitRow.style.display = 'none';
    }

    // 부가세 포함 금액
    const feeWithVat = result.fee * 1.1;
    document.getElementById('result-with-vat').textContent = formatCurrency(feeWithVat);

    // 결과로 스크롤
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
