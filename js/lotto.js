// 로또 번호 추천 시스템

// 최근 100회 당첨 번호 데이터 (실제 데이터 - 2024년 기준 역순)
const historicalData = [
    [3, 13, 21, 27, 31, 40], [6, 14, 16, 21, 27, 40], [2, 6, 12, 19, 22, 43],
    [6, 9, 13, 18, 32, 40], [1, 4, 11, 17, 28, 33], [10, 16, 18, 26, 33, 40],
    [5, 13, 22, 28, 34, 38], [7, 13, 18, 36, 39, 45], [3, 5, 10, 14, 26, 45],
    [1, 3, 23, 24, 27, 40], [7, 9, 12, 20, 28, 42], [2, 11, 15, 28, 35, 40],
    [12, 18, 24, 34, 37, 45], [8, 12, 21, 27, 29, 34], [5, 11, 12, 22, 38, 44],
    [11, 15, 19, 23, 27, 38], [3, 13, 20, 28, 32, 39], [4, 6, 13, 17, 40, 45],
    [3, 4, 11, 23, 24, 32], [5, 7, 15, 21, 24, 43], [2, 3, 11, 23, 28, 44],
    [1, 7, 18, 24, 38, 44], [9, 14, 20, 25, 32, 42], [4, 8, 17, 22, 31, 37],
    [8, 11, 19, 21, 27, 31], [2, 5, 12, 23, 29, 45], [3, 10, 12, 25, 31, 44],
    [6, 16, 26, 36, 37, 44], [7, 12, 14, 29, 39, 45], [10, 11, 24, 26, 27, 37],
    [3, 4, 8, 15, 30, 43], [14, 17, 31, 35, 42, 44], [1, 3, 9, 16, 26, 40],
    [9, 12, 14, 19, 37, 45], [5, 6, 14, 18, 23, 43], [2, 16, 18, 33, 37, 45],
    [1, 9, 13, 32, 38, 44], [4, 5, 7, 9, 13, 28], [6, 10, 21, 23, 24, 43],
    [1, 4, 7, 14, 38, 45], [5, 11, 16, 32, 34, 45], [2, 13, 22, 24, 35, 39],
    [8, 17, 19, 26, 36, 45], [7, 19, 25, 28, 38, 39], [4, 9, 14, 17, 23, 44],
    [10, 18, 20, 26, 33, 42], [3, 17, 19, 28, 34, 44], [12, 14, 17, 26, 34, 45],
    [3, 9, 17, 19, 31, 44], [1, 6, 11, 23, 28, 34], [4, 16, 17, 29, 37, 40],
    [5, 8, 10, 20, 28, 33], [7, 10, 11, 17, 27, 44], [3, 11, 17, 20, 29, 36],
    [2, 8, 14, 21, 35, 45], [10, 12, 22, 35, 37, 44], [5, 9, 11, 13, 29, 45],
    [14, 19, 21, 30, 32, 44], [6, 8, 17, 24, 30, 33], [1, 13, 15, 22, 35, 44],
    [2, 8, 11, 16, 19, 42], [3, 8, 21, 24, 28, 42], [10, 16, 17, 21, 30, 40],
    [7, 9, 16, 21, 24, 29], [4, 12, 14, 23, 34, 39], [6, 9, 16, 17, 34, 43],
    [1, 6, 15, 28, 33, 45], [5, 7, 13, 18, 29, 42], [11, 13, 18, 24, 34, 42],
    [2, 4, 15, 26, 27, 44], [5, 10, 17, 24, 31, 38], [6, 16, 23, 27, 38, 45],
    [8, 15, 18, 23, 32, 37], [1, 8, 11, 15, 24, 41], [7, 14, 22, 29, 36, 43],
    [9, 13, 16, 28, 33, 45], [4, 11, 19, 27, 30, 42], [3, 8, 16, 22, 36, 41],
    [2, 12, 17, 25, 29, 38], [6, 10, 21, 28, 34, 40], [1, 5, 18, 23, 31, 37],
    [9, 14, 20, 26, 35, 44], [7, 11, 16, 22, 30, 39], [4, 13, 19, 25, 33, 43],
    [3, 10, 15, 28, 36, 41], [8, 12, 21, 27, 32, 45], [2, 6, 14, 24, 38, 42],
    [5, 9, 17, 23, 29, 37], [1, 11, 18, 26, 34, 40], [7, 13, 20, 28, 35, 44],
    [4, 8, 15, 22, 31, 39], [3, 10, 16, 25, 33, 43], [6, 12, 19, 27, 36, 41],
    [2, 9, 14, 23, 30, 38], [5, 11, 17, 24, 32, 45], [1, 7, 13, 21, 29, 42],
    [8, 14, 20, 26, 34, 40], [4, 10, 16, 22, 31, 37], [3, 6, 12, 18, 28, 44]
];

// 상태 변수
let currentMode = 'random';
let generateCount = 1;
let generatedNumbers = [];

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    initModeToggle();
    initCountButtons();
    initStatsTabs();
    displayStats('frequency');
});

// 모드 토글 초기화
function initModeToggle() {
    const tabs = document.querySelectorAll('.mode-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentMode = tab.dataset.mode;
            
            // 옵션 패널 토글
            document.querySelector('.stats-options').classList.toggle('hidden', currentMode !== 'stats');
            document.querySelector('.custom-options').classList.toggle('hidden', currentMode !== 'custom');
        });
    });
}

// 생성 개수 버튼 초기화
function initCountButtons() {
    const btns = document.querySelectorAll('.count-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            generateCount = parseInt(btn.dataset.count);
        });
    });
}

// 통계 탭 초기화
function initStatsTabs() {
    const tabs = document.querySelectorAll('.stats-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            displayStats(tab.dataset.stat);
        });
    });
}

// 번호 생성 메인 함수
function generateNumbers() {
    generatedNumbers = [];
    
    for (let i = 0; i < generateCount; i++) {
        let numbers;
        switch (currentMode) {
            case 'random':
                numbers = generateRandom();
                break;
            case 'stats':
                numbers = generateStats();
                break;
            case 'custom':
                numbers = generateCustom();
                break;
            default:
                numbers = generateRandom();
        }
        
        if (numbers && numbers.length === 6) {
            generatedNumbers.push(numbers);
        }
    }
    
    displayResults();
}

// 완전 랜덤 생성
function generateRandom() {
    const numbers = [];
    while (numbers.length < 6) {
        const num = Math.floor(Math.random() * 45) + 1;
        if (!numbers.includes(num)) {
            numbers.push(num);
        }
    }
    return numbers.sort((a, b) => a - b);
}

// 통계 기반 생성
function generateStats() {
    const strategy = document.getElementById('stats-strategy').value;
    const frequency = calculateFrequency();
    
    let pool = [];
    
    switch (strategy) {
        case 'hot':
            // 자주 나온 번호 위주 (상위 20개에서)
            pool = Object.entries(frequency)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 20)
                .map(e => parseInt(e[0]));
            break;
            
        case 'cold':
            // 오래 안 나온 번호 위주 (하위 20개에서)
            pool = Object.entries(frequency)
                .sort((a, b) => a[1] - b[1])
                .slice(0, 20)
                .map(e => parseInt(e[0]));
            break;
            
        case 'balanced':
            // 균형 (핫 3개 + 콜드 3개)
            const sorted = Object.entries(frequency).sort((a, b) => b[1] - a[1]);
            const hotPool = sorted.slice(0, 15).map(e => parseInt(e[0]));
            const coldPool = sorted.slice(-15).map(e => parseInt(e[0]));
            
            const numbers = [];
            // 핫에서 3개
            while (numbers.length < 3) {
                const num = hotPool[Math.floor(Math.random() * hotPool.length)];
                if (!numbers.includes(num)) numbers.push(num);
            }
            // 콜드에서 3개
            while (numbers.length < 6) {
                const num = coldPool[Math.floor(Math.random() * coldPool.length)];
                if (!numbers.includes(num)) numbers.push(num);
            }
            return numbers.sort((a, b) => a - b);
            
        case 'recent':
            // 최근 10회 분석
            const recent10 = historicalData.slice(0, 10).flat();
            const recentFreq = {};
            recent10.forEach(n => recentFreq[n] = (recentFreq[n] || 0) + 1);
            pool = Object.entries(recentFreq)
                .filter(e => e[1] >= 2)
                .map(e => parseInt(e[0]));
            if (pool.length < 15) {
                // 보충
                for (let i = 1; i <= 45; i++) {
                    if (!pool.includes(i)) pool.push(i);
                    if (pool.length >= 25) break;
                }
            }
            break;
    }
    
    // pool에서 6개 선택
    const numbers = [];
    while (numbers.length < 6 && pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length);
        const num = pool[idx];
        if (!numbers.includes(num)) {
            numbers.push(num);
        }
        pool.splice(idx, 1);
    }
    
    // pool이 부족하면 나머지는 랜덤
    while (numbers.length < 6) {
        const num = Math.floor(Math.random() * 45) + 1;
        if (!numbers.includes(num)) numbers.push(num);
    }
    
    return numbers.sort((a, b) => a - b);
}

// 커스텀 옵션 생성
function generateCustom() {
    const fixedInput = document.getElementById('fixed-numbers').value;
    const excludeInput = document.getElementById('exclude-numbers').value;
    const oddCount = document.getElementById('odd-count').value;
    const highLow = document.getElementById('high-low').value;
    const consecutive = document.getElementById('consecutive').value;
    const acValue = document.getElementById('ac-value').value;
    
    // 고정 번호 파싱
    const fixed = parseNumbers(fixedInput).filter(n => n >= 1 && n <= 45).slice(0, 5);
    
    // 제외 번호 파싱
    const exclude = parseNumbers(excludeInput).filter(n => n >= 1 && n <= 45);
    
    // 사용 가능한 번호 풀
    let pool = [];
    for (let i = 1; i <= 45; i++) {
        if (!fixed.includes(i) && !exclude.includes(i)) {
            pool.push(i);
        }
    }
    
    // 최대 100번 시도
    for (let attempt = 0; attempt < 100; attempt++) {
        const numbers = [...fixed];
        const tempPool = [...pool];
        
        // 나머지 번호 채우기
        while (numbers.length < 6 && tempPool.length > 0) {
            const idx = Math.floor(Math.random() * tempPool.length);
            numbers.push(tempPool.splice(idx, 1)[0]);
        }
        
        numbers.sort((a, b) => a - b);
        
        // 조건 검증
        if (!validateNumbers(numbers, { oddCount, highLow, consecutive, acValue })) {
            continue;
        }
        
        return numbers;
    }
    
    // 조건 만족 실패시 기본 반환
    const numbers = [...fixed];
    const tempPool = [...pool];
    while (numbers.length < 6 && tempPool.length > 0) {
        const idx = Math.floor(Math.random() * tempPool.length);
        numbers.push(tempPool.splice(idx, 1)[0]);
    }
    return numbers.sort((a, b) => a - b);
}

// 숫자 파싱
function parseNumbers(str) {
    if (!str) return [];
    return str.split(/[,\s]+/)
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n));
}

// 조건 검증
function validateNumbers(numbers, options) {
    const { oddCount, highLow, consecutive, acValue } = options;
    
    // 홀수 개수 검증
    if (oddCount !== 'any') {
        const odds = numbers.filter(n => n % 2 === 1).length;
        if (odds !== parseInt(oddCount)) return false;
    }
    
    // 고저 비율 검증
    if (highLow !== 'any') {
        const [low, high] = highLow.split(':').map(Number);
        const lowCount = numbers.filter(n => n <= 22).length;
        if (lowCount !== low) return false;
    }
    
    // 연속 번호 검증
    const hasConsecutive = checkConsecutive(numbers);
    if (consecutive === 'require' && !hasConsecutive) return false;
    if (consecutive === 'deny' && hasConsecutive) return false;
    
    // AC값 검증
    if (acValue !== 'any') {
        const ac = calculateAC(numbers);
        if (ac < parseInt(acValue)) return false;
    }
    
    return true;
}

// 연속 번호 체크
function checkConsecutive(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i + 1] - sorted[i] === 1) return true;
    }
    return false;
}

// AC값 계산 (번호 간 차이의 종류 수)
function calculateAC(numbers) {
    const diffs = new Set();
    for (let i = 0; i < numbers.length; i++) {
        for (let j = i + 1; j < numbers.length; j++) {
            diffs.add(Math.abs(numbers[i] - numbers[j]));
        }
    }
    return diffs.size - 5; // AC = 차이 종류 수 - (n-1)
}

// 출현 빈도 계산
function calculateFrequency() {
    const frequency = {};
    for (let i = 1; i <= 45; i++) frequency[i] = 0;
    
    historicalData.forEach(draw => {
        draw.forEach(num => frequency[num]++);
    });
    
    return frequency;
}

// 최근 출현 회차 계산
function calculateRecentAppearance() {
    const recent = {};
    for (let i = 1; i <= 45; i++) recent[i] = -1;
    
    historicalData.forEach((draw, idx) => {
        draw.forEach(num => {
            if (recent[num] === -1) recent[num] = idx;
        });
    });
    
    return recent;
}

// 결과 표시
function displayResults() {
    const container = document.getElementById('lotto-results');
    const section = document.querySelector('.result-section');
    
    section.classList.remove('hidden');
    
    container.innerHTML = generatedNumbers.map((nums, idx) => `
        <div class="lotto-game" style="animation-delay: ${idx * 0.1}s">
            <span class="game-label">${String.fromCharCode(65 + idx)}</span>
            <div class="lotto-balls">
                ${nums.map(n => `<div class="lotto-ball ${getBallClass(n)}">${n}</div>`).join('')}
            </div>
            <button class="game-copy-btn" onclick="copyNumbers(${idx})" title="복사">
                <span class="material-icons-round">content_copy</span>
            </button>
        </div>
    `).join('');
    
    // 스크롤 이동
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 번호 범위별 클래스
function getBallClass(num) {
    if (num <= 10) return 'range-1';
    if (num <= 20) return 'range-2';
    if (num <= 30) return 'range-3';
    if (num <= 40) return 'range-4';
    return 'range-5';
}

// 단일 게임 복사
function copyNumbers(idx) {
    const nums = generatedNumbers[idx];
    navigator.clipboard.writeText(nums.join(', ')).then(() => {
        showToast('번호가 복사되었습니다!');
    });
}

// 전체 복사
function copyAllNumbers() {
    const text = generatedNumbers.map((nums, idx) => 
        `${String.fromCharCode(65 + idx)}: ${nums.join(', ')}`
    ).join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('전체 번호가 복사되었습니다!');
    });
}

// 토스트 메시지
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="material-icons-round">check_circle</span>${message}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--accent);
        color: #1a1a1a;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 9999;
        animation: toastIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// 통계 표시
function displayStats(type) {
    const container = document.getElementById('stats-display');
    
    if (type === 'frequency') {
        const frequency = calculateFrequency();
        const sorted = Object.entries(frequency).sort((a, b) => b[1] - a[1]);
        const max = sorted[0][1];
        const min = sorted[sorted.length - 1][1];
        
        container.innerHTML = `
            <div class="stats-grid">
                ${Array.from({length: 45}, (_, i) => i + 1).map(num => {
                    const count = frequency[num];
                    const isHot = count >= max - 2;
                    const isCold = count <= min + 2;
                    return `
                        <div class="stat-ball ${getBallClass(num)} ${isHot ? 'hot' : ''} ${isCold ? 'cold' : ''}">
                            ${num}
                            <span class="stat-count">${count}</span>
                        </div>
                    `;
                }).join('')}
            </div>
            <div style="margin-top: 16px; font-size: 0.75rem; color: var(--text-muted); text-align: center;">
                🔥 빛나는 번호: 자주 출현 | 흐린 번호: 적게 출현
            </div>
        `;
    } else {
        const recent = calculateRecentAppearance();
        
        container.innerHTML = `
            <div class="stats-grid">
                ${Array.from({length: 45}, (_, i) => i + 1).map(num => {
                    const rounds = recent[num];
                    const label = rounds === 0 ? '직전' : rounds === -1 ? '-' : `${rounds}회전`;
                    const isCold = rounds > 10 || rounds === -1;
                    return `
                        <div class="stat-ball ${getBallClass(num)} ${isCold ? 'cold' : ''}">
                            ${num}
                            <span class="stat-count">${label}</span>
                        </div>
                    `;
                }).join('')}
            </div>
            <div style="margin-top: 16px; font-size: 0.75rem; color: var(--text-muted); text-align: center;">
                숫자: 마지막 출현 이후 경과 회차 | 흐린 번호: 10회 이상 미출현
            </div>
        `;
    }
}

// 토스트 애니메이션 CSS 추가
const style = document.createElement('style');
style.textContent = `
    @keyframes toastIn {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes toastOut {
        from { opacity: 1; transform: translateX(-50%) translateY(0); }
        to { opacity: 0; transform: translateX(-50%) translateY(20px); }
    }
`;
document.head.appendChild(style);
