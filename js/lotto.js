// 로또 번호 추천 시스템

// 로또 데이터 상태 (fetch로 로드됨)
let allLottoData = [];
let filteredData = [];

// 상태 변수
let currentMode = 'random';
let generateCount = 1;
let generatedNumbers = [];

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    initData();
    initModeToggle();
    initCountButtons();
    initStatsTabs();
});

// 데이터 로드
function initData() {
    try {
        if (typeof lottoData === 'undefined' || !lottoData) {
            throw new Error("lottoData is not defined. Check lotto_data.js import.");
        }

        const jsonData = lottoData; // 전역 변수에서 데이터 사용

        // 데이터 정규화
        allLottoData = jsonData.map(item => ({
            drwNo: item.drwNo,
            date: "", // 날짜 정보 생략 (JSON에 없음)
            numbers: [
                item.drwtNo1,
                item.drwtNo2,
                item.drwtNo3,
                item.drwtNo4,
                item.drwtNo5,
                item.drwtNo6
            ],
            bonus: item.bnusNo,
            winnerCount: item.firstPrzwnerCo,
            winAmount: item.firstWinamnt
        }));

        // 내림차순 정렬 (최신 회차가 먼저 오도록)
        allLottoData.sort((a, b) => b.drwNo - a.drwNo);
        filteredData = [...allLottoData];

        console.log(`Loaded ${allLottoData.length} records.`);

        initDrwRangePicker();
        displayStats('frequency');

    } catch (e) {
        console.error("Failed to load lotto data:", e);
        showToast("데이터 로드 실패: " + e.message);
        filteredData = [];
    }
}

// 회차 범위 필터 초기화 - 콤보박스(Select) 사용
function initDrwRangePicker() {
    const startSelect = document.getElementById('start-drw');
    const endSelect = document.getElementById('end-drw');
    const applyBtn = document.getElementById('apply-date-range');
    const countDisplay = document.getElementById('filtered-count');

    if (!startSelect || !allLottoData.length) return;

    // 콤보박스 옵션 생성
    // allLottoData는 내림차순 정렬되어 있음 (최신 -> 과거)
    // 회차 리스트 추출: [1211, 1210, ... 1]
    const drwList = allLottoData.map(d => d.drwNo);

    // 옵션 초기화
    startSelect.innerHTML = '';
    endSelect.innerHTML = '';

    // 옵션 추가 (내림차순 정렬된 상태 그대로 추가하거나, 오름차순으로 추가하거나)
    // 사용자가 찾기 편하게 내림차순(최신이 위)이 보통 좋음.
    drwList.forEach(drw => {
        const optionStart = document.createElement('option');
        optionStart.value = drw;
        optionStart.textContent = `${drw}회`;
        startSelect.appendChild(optionStart);

        const optionEnd = document.createElement('option');
        optionEnd.value = drw;
        optionEnd.textContent = `${drw}회`;
        endSelect.appendChild(optionEnd);
    });

    // 기본값 설정: 시작=1회(가장 과거), 끝=마지막회차(가장 최신)
    // allLottoData는 내림차순이므로 0번 인덱스가 최신(Max), 마지막 인덱스가 1회(Min)
    const maxDrw = allLottoData[0].drwNo;
    const minDrw = allLottoData[allLottoData.length - 1].drwNo;

    // 시작 콤보박스: 1회 선택
    startSelect.value = minDrw;

    // 끝 콤보박스: 최신 회차 선택
    endSelect.value = maxDrw;

    updateCountDisplay();

    applyBtn.addEventListener('click', () => {
        const start = parseInt(startSelect.value);
        const end = parseInt(endSelect.value);

        if (start > end) {
            showToast('시작 회차가 종료 회차보다 클 수 없습니다.');
            return;
        }

        // 범위 필터링
        filteredData = allLottoData.filter(d => d.drwNo >= start && d.drwNo <= end);

        // 필터링 후 내림차순 유지
        filteredData.sort((a, b) => b.drwNo - a.drwNo);

        updateCountDisplay();

        // 현재 활성화된 탭의 통계 갱신
        const activeTab = document.querySelector('.stats-tab.active');
        if (activeTab) {
            displayStats(activeTab.dataset.stat);
        }
        showToast('회차 범위가 적용되었습니다.');
    });

    function updateCountDisplay() {
        if (countDisplay) {
            countDisplay.textContent = `선택된 회차: ${filteredData.length}회`;
        }
    }
}

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
                if (filteredData.length === 0) {
                    showToast("데이터가 없습니다. 회차를 확인해주세요.");
                    return;
                }
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
            // 최근 10회 패턴 분석
            // filteredData는 내림차순 정렬됨(최신->과거). 앞의 10개가 최근 10회
            const recent10 = filteredData.slice(0, 10).map(d => d.numbers).flat();
            const recentFreq = {};
            recent10.forEach(n => recentFreq[n] = (recentFreq[n] || 0) + 1);
            pool = Object.entries(recentFreq)
                .filter(e => e[1] >= 2) // 2번 이상 나온 번호
                .map(e => parseInt(e[0]));

            // pool이 부족하면 보충
            if (pool.length < 10) {
                const sortedAll = Object.entries(frequency).sort((a, b) => b[1] - a[1]);
                // 전체 빈도 상위 번호로 채움
                for (let item of sortedAll) {
                    const n = parseInt(item[0]);
                    if (!pool.includes(n)) pool.push(n);
                    if (pool.length >= 20) break;
                }
            }
            break;
    }

    // pool 안전장치: 혹시라도 pool이 비어있으면 전체 번호로 채움
    if (pool.length === 0) {
        pool = Array.from({ length: 45 }, (_, i) => i + 1);
    }

    // pool에서 6개 선택
    const numbers = [];
    let attempts = 0;
    while (numbers.length < 6 && attempts < 100) {
        attempts++;
        if (pool.length > 0) {
            const idx = Math.floor(Math.random() * pool.length);
            const num = pool[idx];
            if (!numbers.includes(num)) {
                numbers.push(num);
            }
            // 중복 선택 방지를 위해 pool에서 제거하지 않음 (로또는 비복원 추출이지만, 추천 풀에서는 확률 가중치 개념)
            // 하지만 엄밀한 비복원을 위해선 제거하는게 맞음. 다만 pool이 작을때 문제.
            // 여기서는 pool 유지하면서 중복 체크만 함.
        } else {
            // Pool exhausted logic if needed
            break;
        }
    }

    // 만약 6개 못채웠으면 나머지 랜덤 채움
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

    if (pool.length + fixed.length < 6) {
        showToast("사용 가능한 번호가 부족합니다.");
        return [];
    }

    // 최대 200번 시도
    for (let attempt = 0; attempt < 200; attempt++) {
        const numbers = [...fixed];
        const tempPool = [...pool];

        // 나머지 번호 채우기
        while (numbers.length < 6 && tempPool.length > 0) {
            const idx = Math.floor(Math.random() * tempPool.length);
            numbers.push(tempPool.splice(idx, 1)[0]);
        }

        if (numbers.length < 6) break; // pool 부족

        numbers.sort((a, b) => a - b);

        // 조건 검증
        if (!validateNumbers(numbers, { oddCount, highLow, consecutive, acValue })) {
            continue;
        }

        return numbers;
    }

    // 조건 만족 실패시 기본 반환 (안내 메시지 후 랜덤 or 실패 알림)
    // 여기서는 실패시 랜덤보다는 "조건 만족 실패"를 알리는게 좋지만, 
    // UX상 근사치나 랜덤을 주는 경우도 있음. 기존 로직 유지하되 토스트.
    showToast("조건을 만족하는 번호를 찾기 어려워 랜덤 생성되었습니다.");

    // Fallback: 그냥 랜덤 채우기 (이미 위에서 시도 실패했으므로)
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
    return str.replace(/[^0-9,]/g, '').split(',') // 숫자와 콤마만 허용
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

    filteredData.forEach(draw => {
        draw.numbers.forEach(num => frequency[num]++);
    });

    return frequency;
}

// 최근 출현 회차 계산
function calculateRecentAppearance() {
    const recent = {};
    for (let i = 1; i <= 45; i++) recent[i] = -1;

    // filteredData : 최신 -> 과거 순
    filteredData.forEach((draw, idx) => {
        draw.numbers.forEach(num => {
            // 아직 발견되지 않은 번호만 기록 (가장 최근 등장이므로)
            if (recent[num] === -1) {
                // idx 0 = 가장 최근 회차 (0회 전)
                recent[num] = idx;
            }
        });
    });

    return recent;
}

// 결과 표시
function displayResults() {
    const container = document.getElementById('lotto-results');
    const section = document.querySelector('.result-section');

    if (!container) return;

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
    if (!container) return;

    if (type === 'frequency') {
        const frequency = calculateFrequency();
        const entries = Object.entries(frequency);

        let max = 0, min = 0;
        let avg = 0;

        if (entries.length > 0) {
            const sorted = entries.sort((a, b) => b[1] - a[1]);
            max = sorted[0][1];
            min = sorted[sorted.length - 1][1];

            // 평균 계산
            const sum = entries.reduce((acc, curr) => acc + curr[1], 0);
            avg = sum / entries.length;
        }

        // 빈도순으로 정렬 (번호와 빈도를 객체로 만듬)
        const sortedBalls = Array.from({ length: 45 }, (_, i) => i + 1)
            .map(num => ({ num, count: frequency[num] || 0 }))
            .sort((a, b) => b.count - a.count); // 내림차순 정렬

        const maxCount = sortedBalls[0].count;

        container.innerHTML = `
            <div class="stats-grid">
                ${sortedBalls.map((item, index) => {
            const { num, count } = item;

            // 순위에 따른 투명도 및 크기 계산 (1등: 1.0, 45등: 0.3)
            // index 0 -> 1.0
            // index 44 -> 0.3
            const opacity = 1 - (index / 44) * 0.7;
            const scale = 1.1 - (index / 44) * 0.3; // 1.1 ~ 0.8

            // 상위권 강조 효과 (테두리 등)는 CSS가 아닌 인라인 스타일로 처리하거나
            // 별도 클래스 대신 스타일 속성 직접 부여

            return `
                        <div class="stat-ball ${getBallClass(num)}" 
                             style="opacity: ${opacity}; transform: scale(${scale}); order: ${index};">
                            ${num}
                            <span class="stat-count">${count}</span>
                        </div>
                    `;
        }).join('')}
            </div>
            <div style="margin-top: 16px; font-size: 0.75rem; color: var(--text-muted); text-align: center;">
                좌측 상단부터 빈도순 정렬 (진하고 큼 → 흐리고 작음)
            </div>
        `;
    } else {
        const recent = calculateRecentAppearance();

        // 정렬: 오래된 순서대로 (rounds가 클수록, 혹은 -1일수록 오래된 것)
        // -1 (미출현)이 가장 우선순위 높음 = 가장 오래됨
        // 그 다음 rounds 큰 순서 (예: 100회전 > 1회전 > 0회전)

        const sortedBalls = Array.from({ length: 45 }, (_, i) => i + 1)
            .map(num => ({ num, rounds: recent[num] }))
            .sort((a, b) => {
                // 둘 다 데이터가 없으면 번호순
                if (a.rounds === -1 && b.rounds === -1) return a.num - b.num;
                // a만 없으면 a가 더 오래됨 (앞쪽)
                if (a.rounds === -1) return -1;
                // b만 없으면 b가 더 오래됨 (뒤쪽)
                if (b.rounds === -1) return 1;
                // 둘 다 있으면 더 큰 숫자(더 오래전)가 앞쪽
                return b.rounds - a.rounds;
            });

        container.innerHTML = `
            <div class="stats-grid">
                ${sortedBalls.map((item, index) => {
            const { num, rounds } = item;

            let label = '-';
            if (rounds === 0) label = '직전';
            else if (rounds > 0) label = `${rounds}회전`;
            else label = '미출현';

            // 순위에 따른 투명도 및 크기 계산 (오래된 것 1등: 1.0)
            const opacity = 1 - (index / 44) * 0.7;
            const scale = 1.1 - (index / 44) * 0.3;

            return `
                        <div class="stat-ball ${getBallClass(num)}" 
                             style="opacity: ${opacity}; transform: scale(${scale}); order: ${index};">
                            ${num}
                            <span class="stat-count">${label}</span>
                        </div>
                    `;
        }).join('')}
            </div>
            <div style="margin-top: 16px; font-size: 0.75rem; color: var(--text-muted); text-align: center;">
                좌측 상단부터 오래된 순 정렬 (미출현/오래됨 → 최근 출현)
            </div>
        `;
    }
}

// 토스트 애니메이션 CSS 추가
const style = document.createElement('style');
style.textContent = `
        @keyframes toastIn {
        from { opacity: 0; transform: translateX(-50 %) translateY(20px); }
        to { opacity: 1; transform: translateX(-50 %) translateY(0); }
        }
        @keyframes toastOut {
        from { opacity: 1; transform: translateX(-50 %) translateY(0); }
        to { opacity: 0; transform: translateX(-50 %) translateY(20px); }
        }
        `;
document.head.appendChild(style);
