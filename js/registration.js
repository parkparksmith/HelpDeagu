// 등기비용 종합 계산기

document.addEventListener('DOMContentLoaded', () => {
    const priceInput = document.getElementById('price');
    priceInput.addEventListener('input', () => formatInputNumber(priceInput));
});

function formatInputNumber(input) {
    let value = input.value.replace(/[^\d]/g, '');
    if (value) {
        input.value = parseInt(value, 10).toLocaleString();
    }
}

function parseNumber(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/,/g, '')) || 0;
}

function formatMoney(num) {
    return Math.round(num).toLocaleString() + '원';
}

function calculateTotal() {
    const priceMan = parseNumber(document.getElementById('price').value); // 만원 단위
    const houseCount = document.querySelector('input[name="house-count"]:checked').value;
    const isRegulated = document.querySelector('input[name="regulated"]:checked').value === 'yes';
    const bondDiscount = parseFloat(document.getElementById('bond-discount').value) || 8;

    if (priceMan <= 0) {
        alert('매매가를 입력해주세요.');
        return;
    }

    const priceWon = priceMan * 10000; // 원 단위로 변환

    // 1. 취득세 계산
    const taxResult = calculateAcquisitionTax(priceWon, houseCount, isRegulated);
    
    // 2. 국민주택채권 계산
    const bondResult = calculateBond(priceWon, bondDiscount);
    
    // 3. 법무사 보수 계산
    const lawyerFee = calculateLawyerFee(priceWon);
    
    // 4. 인지세 계산
    const stampTax = calculateStampTax(priceWon);
    
    // 5. 등기신청수수료
    const regFee = 15000;

    // 총 비용
    const totalCost = taxResult.total + bondResult.loss + lawyerFee + stampTax + regFee;

    // 결과 표시
    document.getElementById('result-card').classList.remove('hidden');
    
    document.getElementById('total-cost').textContent = formatMoney(totalCost);
    
    // 취득세 상세
    document.getElementById('acquisition-tax').textContent = formatMoney(taxResult.total);
    document.getElementById('tax-main').textContent = formatMoney(taxResult.main);
    document.getElementById('tax-education').textContent = formatMoney(taxResult.education);
    document.getElementById('tax-rural').textContent = formatMoney(taxResult.rural);
    
    // 채권 상세
    document.getElementById('bond-cost').textContent = formatMoney(bondResult.loss);
    document.getElementById('bond-amount').textContent = formatMoney(bondResult.amount);
    document.getElementById('bond-loss').textContent = formatMoney(bondResult.loss);
    
    // 법무사 보수
    document.getElementById('lawyer-fee').textContent = formatMoney(lawyerFee);
    document.getElementById('lawyer-detail').textContent = '예상 금액';
    
    // 인지세
    document.getElementById('stamp-tax').textContent = formatMoney(stampTax);
    
    // 등기신청수수료
    document.getElementById('reg-fee').textContent = formatMoney(regFee);

    // 결과로 스크롤
    document.getElementById('result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 취득세 계산
function calculateAcquisitionTax(priceWon, houseCount, isRegulated) {
    let mainRate = 0;
    let educationRate = 0;
    let ruralRate = 0;

    if (houseCount === '1') {
        // 1주택자
        if (priceWon <= 600000000) { // 6억 이하
            mainRate = 0.01;
            educationRate = 0.001;
        } else if (priceWon <= 900000000) { // 6~9억
            // 6억~9억 구간은 세율 점진적 증가 (1%~3%)
            const ratio = (priceWon - 600000000) / 300000000;
            mainRate = 0.01 + (0.02 * ratio);
            educationRate = mainRate * 0.1;
        } else { // 9억 초과
            mainRate = 0.03;
            educationRate = 0.003;
        }
        ruralRate = 0.002; // 농특세 (85㎡ 초과 가정)
    } else if (houseCount === '2') {
        // 2주택자
        if (isRegulated) {
            mainRate = 0.08;
            educationRate = 0.004;
            ruralRate = 0.006;
        } else {
            // 비조정 2주택: 1~3%
            if (priceWon <= 600000000) {
                mainRate = 0.01;
            } else if (priceWon <= 900000000) {
                const ratio = (priceWon - 600000000) / 300000000;
                mainRate = 0.01 + (0.02 * ratio);
            } else {
                mainRate = 0.03;
            }
            educationRate = mainRate * 0.1;
            ruralRate = 0.002;
        }
    } else {
        // 3주택 이상
        if (isRegulated) {
            mainRate = 0.12;
            educationRate = 0.004;
            ruralRate = 0.01;
        } else {
            mainRate = 0.08;
            educationRate = 0.004;
            ruralRate = 0.006;
        }
    }

    const mainTax = priceWon * mainRate;
    const educationTax = priceWon * educationRate;
    const ruralTax = priceWon * ruralRate;

    return {
        main: mainTax,
        education: educationTax,
        rural: ruralTax,
        total: mainTax + educationTax + ruralTax
    };
}

// 국민주택채권 계산
function calculateBond(priceWon, discountRate) {
    // 시가표준액 기준 (매매가의 약 70~80% 가정, 여기서는 매매가 사용)
    // 실제로는 공시지가 기준이지만 간략화
    
    let bondRate = 0;
    
    // 서울 기준 (지역에 따라 다름)
    if (priceWon <= 100000000) { // 1억 이하
        bondRate = 0.01;
    } else if (priceWon <= 160000000) { // 1.6억 이하
        bondRate = 0.02;
    } else if (priceWon <= 260000000) { // 2.6억 이하
        bondRate = 0.03;
    } else if (priceWon <= 600000000) { // 6억 이하
        bondRate = 0.04;
    } else {
        bondRate = 0.05;
    }

    const bondAmount = priceWon * bondRate;
    const bondLoss = bondAmount * (discountRate / 100);

    return {
        amount: bondAmount,
        loss: bondLoss
    };
}

// 법무사 보수 계산
function calculateLawyerFee(priceWon) {
    // 대법원 기준 법무사 보수 (2024년 기준 간략화)
    // 기본보수 + 부동산가액에 따른 가산보수
    
    let baseFee = 110000; // 기본 보수 약 11만원
    let additionalFee = 0;

    // 가산보수 (부동산가액 구간별)
    if (priceWon <= 50000000) {
        additionalFee = 0;
    } else if (priceWon <= 100000000) {
        additionalFee = (priceWon - 50000000) * 0.001;
    } else if (priceWon <= 300000000) {
        additionalFee = 50000 + (priceWon - 100000000) * 0.0008;
    } else if (priceWon <= 500000000) {
        additionalFee = 210000 + (priceWon - 300000000) * 0.0006;
    } else if (priceWon <= 1000000000) {
        additionalFee = 330000 + (priceWon - 500000000) * 0.0004;
    } else {
        additionalFee = 530000 + (priceWon - 1000000000) * 0.0002;
    }

    // 부가세 10% 포함
    return (baseFee + additionalFee) * 1.1;
}

// 인지세 계산
function calculateStampTax(priceWon) {
    // 부동산 매매계약서 인지세
    if (priceWon <= 100000000) { // 1억 이하
        return 0;
    } else if (priceWon <= 1000000000) { // 1억~10억
        return 150000;
    } else { // 10억 초과
        return 350000;
    }
}
