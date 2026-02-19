// === 선택된 실거래가 리포트 - JavaScript ===

// GitHub 설정
//

const GITHUB_CONFIG = {
    token: '', // 토큰이 없으면 공개 리포지토리로 접근 (Rate Limit 주의: 60회/시간)
    repo: 'parkparksmith/HelpDeagu',
    branch: 'main'
};

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    initializeDateSelect();
});

// 날짜 선택 콤보박스 초기화
async function initializeDateSelect() {
    const dateSelect = document.getElementById('trade-date');

    try {
        // GitHub API로 SelectData 폴더의 파일 목록 조회
        const url = `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/Json/SelectData?ref=${GITHUB_CONFIG.branch}`;
        const headers = {
            'Accept': 'application/vnd.github.v3+json'
        };
        if (GITHUB_CONFIG.token) {
            headers['Authorization'] = `token ${GITHUB_CONFIG.token}`;
        }

        const response = await fetch(url, { headers });

        if (!response.ok) throw new Error('날짜 목록을 불러오는데 실패했습니다.');

        const files = await response.json();

        // selected_trades_YYYYMMDD.json 패턴에서 날짜 추출 및 정렬 (최신순)
        const dates = files
            .filter(file => file.name.startsWith('selected_trades_') && file.name.endsWith('.json'))
            .map(file => {
                const match = file.name.match(/selected_trades_(\d{8})\.json/);
                return match ? match[1] : null;
            })
            .filter(date => date !== null)
            .sort((a, b) => b.localeCompare(a));

        // 콤보박스 옵션 생성
        dateSelect.innerHTML = '';
        if (dates.length === 0) {
            const option = document.createElement('option');
            option.text = '데이터 없음';
            dateSelect.add(option);
            return;
        }

        dates.forEach(dateStr => {
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            const dateObj = new Date(`${year}-${month}-${day}`);

            const option = document.createElement('option');
            option.value = dateStr; // YYYYMMDD
            // 표시 형식: 2026-02-04 (수)
            option.text = `${year}-${month}-${day} (${getDayOfWeek(dateObj)})`;
            dateSelect.add(option);
        });

        // 가장 최신 날짜 자동 선택
        if (dates.length > 0) {
            dateSelect.value = dates[0];
        }

    } catch (error) {
        console.error(error);
        dateSelect.innerHTML = '<option disabled>목록 로드 실패</option>';
        showError('날짜 목록을 불러오지 못했습니다.');
    }
}

// 요일 구하기
function getDayOfWeek(date) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[date.getDay()];
}

// 날짜 표시용 포맷
function formatDateDisplay(dateStr) {
    let year, month, day;
    if (dateStr.includes('-')) {
        [year, month, day] = dateStr.split('-');
    } else {
        year = dateStr.substring(0, 4);
        month = dateStr.substring(4, 6);
        day = dateStr.substring(6, 8);
    }
    const date = new Date(`${year}-${month}-${day}`);
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    return date.toLocaleDateString('ko-KR', options);
}

// GitHub에서 파일 가져오기
async function fetchFromGitHub(filePath) {
    const url = `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/${filePath}?ref=${GITHUB_CONFIG.branch}`;

    const headers = {
        'Accept': 'application/vnd.github.v3+json'
    };
    if (GITHUB_CONFIG.token) {
        headers['Authorization'] = `token ${GITHUB_CONFIG.token}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('해당 날짜의 선택된 데이터가 없습니다.');
        }
        throw new Error(`GitHub API 오류: ${response.status}`);
    }

    const data = await response.json();
    // Base64 디코딩 후 UTF-8로 변환 (한글 지원)
    const content = decodeBase64UTF8(data.content);
    console.log('Loaded data:', content.substring(0, 200)); // 디버그용
    return JSON.parse(content);
}

// Base64를 UTF-8로 디코딩 (한글 지원)
function decodeBase64UTF8(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
}

// 로딩 표시
function showLoading(show) {
    const loading = document.getElementById('loading');
    loading.classList.toggle('hidden', !show);
}

// 에러 메시지 표시
function showError(message) {
    const errorEl = document.getElementById('error-message');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

// 에러 메시지 숨기기
function hideError() {
    const errorEl = document.getElementById('error-message');
    errorEl.classList.add('hidden');
}

// 전체 UI 숨기기
// 전체 UI 숨기기
function hideAllUI() {
    const reportHeader = document.getElementById('report-header');
    if (reportHeader) reportHeader.classList.add('hidden');

    document.getElementById('data-summary').classList.add('hidden');
    document.getElementById('report-container').classList.add('hidden');
    document.getElementById('report-footer').classList.add('hidden');
    document.getElementById('apt-section').classList.add('hidden');
    document.getElementById('presale-section').classList.add('hidden');
    hideError();
}

// 선택된 실거래가 로드
async function loadSelectedTrades() {
    const dateInput = document.getElementById('trade-date');
    const selectedDate = dateInput.value;

    if (!selectedDate) {
        showError('날짜를 선택해주세요.');
        return;
    }

    hideAllUI();
    showLoading(true);

    try {
        // 이미 YYYYMMDD 형식이므로 변환 불필요
        const formattedDate = selectedDate;
        const filePath = `Json/SelectData/selected_trades_${formattedDate}.json`;

        const data = await fetchFromGitHub(filePath);
        const trades = processTrades(data);

        renderReport(selectedDate, trades, data);
    } catch (error) {
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

// 거래 데이터 처리
function processTrades(data) {
    let trades = [];

    // 데이터 구조에 따라 처리
    if (Array.isArray(data)) {
        trades = data;
    } else if (data.selected_trades && Array.isArray(data.selected_trades)) {
        trades = data.selected_trades;
    } else if (data.trades && Array.isArray(data.trades)) {
        trades = data.trades;
    } else if (data.rows && Array.isArray(data.rows)) {
        trades = data.rows;
    } else if (data.list && Array.isArray(data.list)) {
        trades = data.list;
    } else if (data.items && Array.isArray(data.items)) {
        trades = data.items;
    } else if (data.apt_trades || data.presale_trades) {
        trades = [
            ...(data.apt_trades || []).map(t => ({ ...t, type: 'apt' })),
            ...(data.presale_trades || []).map(t => ({ ...t, type: 'presale' }))
        ];
    } else if (data.apt || data.presale) {
        trades = [
            ...(data.apt || []).map(t => ({ ...t, type: 'apt' })),
            ...(data.presale || []).map(t => ({ ...t, type: 'presale' }))
        ];
    } else {
        // Fallback: 가장 큰 배열 찾기 (district_status 제외)
        let maxLen = 0;
        const keys = Object.keys(data);
        for (const key of keys) {
            if (Array.isArray(data[key]) && key !== 'district_status') {
                if (data[key].length > maxLen) {
                    trades = data[key];
                    maxLen = trades.length;
                }
            }
        }
    }

    // 데이터 표준화 및 정렬
    const processed = trades.map(trade => {
        // 유형: trade_type("분양권") 또는 type 사용
        const type = trade.trade_type === '분양권' || trade.type === 'presale' || trade._type === 'presale' ? 'presale' : 'apt';

        // 구/동
        const gu = trade.gu || trade.district?.split(' ')[1] || '';
        const dong = trade.dong || '';

        // 이름
        const name = trade.apt_name || trade.name || '알 수 없음';

        // 면적 
        let area = trade.area || trade['면적(㎡)'] || trade.exclusive_area || 0;
        if (typeof area === 'number') {
            area = area.toFixed(2);
        } else if (typeof area === 'string' && area.includes('.')) {
            area = parseFloat(area).toFixed(2);
        }

        // 층
        const floor = trade.floor || '-';

        // 신고가 여부
        const isNewHigh = trade.is_newhigh === true || trade._is_newhigh === true;

        // 가격 표시
        const priceVal = trade.amount || trade.price || 0;
        const formattedPrice = formatPrice(priceVal);
        const priceDisplay = isNewHigh ? `🔥 ${formattedPrice}` : formattedPrice;

        // 계약일 (null 체크)
        const contractDate = trade.contract_date || '-';

        // 건축년도
        const buildYear = trade.construction_year || trade.build_year || '';

        // 추가 정보
        let tradeCount3m = '';
        if (trade.trade_count_3m_total !== undefined) {
            tradeCount3m = `${trade.trade_count_3m_total}/${trade.trade_count_3m_area || 0}`;
        } else if (trade.trade_count_3m) {
            tradeCount3m = `${trade.trade_count_3m.total}/${trade.trade_count_3m.area}`;
        }

        const prevHigh = trade.previous_high || trade['직전최고가'] || 0;

        return {
            ...trade,
            type,
            gu,
            dong,
            name,
            area,
            floor,
            priceDisplay,
            isNewHigh,
            contractDate,
            buildYear,
            tradeCount3m,
            prevHigh
        };
    });

    // 정렬: 구(오름차순) > 동(오름차순)
    processed.sort((a, b) => {
        if (a.gu !== b.gu) return a.gu.localeCompare(b.gu, 'ko');
        if (a.dong !== b.dong) return a.dong.localeCompare(b.dong, 'ko');
        return 0;
    });

    return processed;
}

// 리포트 렌더링
// 리포트 렌더링
function renderReport(dateStr, trades, fullData = null) {
    // 1. 날짜 헤더 업데이트
    document.getElementById('report-date-text').textContent = formatDateDisplay(dateStr);

    let aptCount = 0;
    let presaleCount = 0;
    let totalCount = 0;
    let districts = [];
    let districtCounts = {};

    // JSON의 summary 필드가 있으면 사용
    if (fullData && fullData.summary) {
        aptCount = fullData.summary.total_apt_count || 0;
        presaleCount = fullData.summary.total_presale_count || 0;
        // 총 거래 건수 (별도 필드가 없으면 합산, 있으면 사용)
        totalCount = fullData.summary.total_count || (aptCount + presaleCount);

        // 구별 통계 사용
        if (fullData.district_status && Array.isArray(fullData.district_status)) {
            fullData.district_status.forEach(d => {
                // d.gu, d.count 구조
                districtCounts[d.gu] = d.count;
            });
            districts = fullData.district_status.map(d => d.gu);
        } else {
            // district_status가 없으면 trades에서 계산
            trades.forEach(t => {
                const gu = t.gu || '기타';
                districtCounts[gu] = (districtCounts[gu] || 0) + 1;
            });
            districts = Object.keys(districtCounts);
        }

    } else {
        // 기존 계산 로직 (Fallback)
        const aptTrades = trades.filter(t => t.type === 'apt');
        const presaleTrades = trades.filter(t => t.type === 'presale');

        aptCount = aptTrades.length;
        presaleCount = presaleTrades.length;
        totalCount = trades.length;

        trades.forEach(t => {
            const gu = t.gu || '기타';
            districtCounts[gu] = (districtCounts[gu] || 0) + 1;
        });
        districts = Object.keys(districtCounts);
    }

    // 2. 메인 카운트 UI 업데이트
    document.getElementById('summary-total-count').textContent = totalCount.toLocaleString() + '건';
    document.getElementById('summary-apt-count').textContent = aptCount.toLocaleString() + '건';
    document.getElementById('summary-presale-count').textContent = presaleCount.toLocaleString() + '건';

    // 3. 구별 거래 현황 정렬 및 생성
    const priorityOrder = ['수성구', '중구', '북구', '동구', '서구', '남구', '달서구', '달성군', '군위군'];
    districts.sort((a, b) => {
        const indexA = priorityOrder.indexOf(a);
        const indexB = priorityOrder.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB; // 둘 다 우선순위에 있으면 순서대로
        if (indexA !== -1) return -1; // A만 있으면 A가 먼저
        if (indexB !== -1) return 1;  // B만 있으면 B가 먼저
        return a.localeCompare(b, 'ko'); // 나머지는 가나다순
    });

    const gridEl = document.getElementById('district-summary-grid');
    if (gridEl) {
        let gridHtml = '';
        if (districts.length === 0) {
            gridHtml = '<p class="no-stats">데이터 없음</p>';
        } else {
            districts.forEach(gu => {
                gridHtml += `
                <div class="district-stat-item">
                    <span class="district-name">${gu}</span>
                    <span class="district-count">${districtCounts[gu]}건</span>
                </div>
                `;
            });
        }
        gridEl.innerHTML = gridHtml;
    }

    // 대시보드 표시
    document.getElementById('data-summary').classList.remove('hidden');

    // 리스트 렌더링을 위해 trades 분류
    const aptTrades = trades.filter(t => t.type === 'apt');
    const presaleTrades = trades.filter(t => t.type === 'presale');

    // 아파트 섹션 (구별 그룹핑)
    if (aptTrades.length > 0) {
        // 상세 카운트는 실제 리스트 개수 기준
        document.getElementById('apt-count').textContent = aptTrades.length + '건';
        renderSectionByGu('apt-cards', aptTrades);
        document.getElementById('apt-section').classList.remove('hidden');
    }

    // 분양권 섹션 (구별 그룹핑)
    if (presaleTrades.length > 0) {
        document.getElementById('presale-count').textContent = presaleTrades.length + '건';
        renderSectionByGu('presale-cards', presaleTrades);
        document.getElementById('presale-section').classList.remove('hidden');
    }

    // 컨테이너 및 푸터 표시
    document.getElementById('report-container').classList.remove('hidden');
    document.getElementById('report-footer').classList.remove('hidden');

    // 테이블 뷰도 렌더링 (데이터가 있을 때 미리 만들어둠)
    renderTableView(trades);

    // 현재 선택된 뷰 모드에 따라 표시 상태 갱신
    toggleViewMode();
}

// 뷰 모드 전환
function toggleViewMode() {
    const modeInput = document.querySelector('input[name="view-mode"]:checked');
    if (!modeInput) return;

    const mode = modeInput.value;
    const cardContainer = document.getElementById('card-view-container');
    const tableContainer = document.getElementById('table-view-container');

    if (mode === 'card') {
        cardContainer.classList.remove('hidden');
        tableContainer.classList.add('hidden');
    } else {
        cardContainer.classList.add('hidden');
        tableContainer.classList.remove('hidden');
    }
}

// 테이블 뷰 렌더링
function renderTableView(trades) {
    const tbody = document.getElementById('trades-tbody');
    if (!tbody) return;

    let html = '';
    trades.forEach(trade => {
        const name = trade.name;
        const dong = trade.dong;
        const area = trade.area;
        const floor = trade.floor;
        const price = trade.priceDisplay; // 이미 🔥 포함됨
        const contractDate = trade.contractDate;

        // 연식 정보
        const currentYear = new Date().getFullYear();
        let nameHtml = `<div class="apt-name-text">${name}</div>`;
        if (trade.buildYear) {
            const by = parseInt(trade.buildYear);
            if (!isNaN(by)) {
                const age = currentYear - by;
                const ageText = age <= 0 ? '신축' : `${age}년차`;
                nameHtml += `<div class="construction-info">${by} <span class="age-badge">(${ageText})</span></div>`;
            } else {
                nameHtml += `<div class="construction-info">${trade.buildYear}</div>`;
            }
        }

        // 추가 정보 (3개월, 전고점)
        // tradeCount3m은 (전체/전용) 형태
        const countText = trade.tradeCount3m ? `(${trade.tradeCount3m})` : '';
        const prevHighText = trade.prevHigh ? `(${formatPrice(trade.prevHigh)})` : '';

        let rowClass = 'trade-row';
        if (trade.isNewHigh) rowClass += ' new-high';

        // 가격 표시: priceDisplay에 이미 불꽃이 있으면 클래스 처리 주의
        // 여기서는 priceDisplay 문자열 그대로 사용

        html += `
            <tr class="${rowClass}">
                <td class="td-center td-dong">${dong}</td>
                <td class="td-center td-name">${nameHtml}</td>
                <td class="td-center">
                    <div class="cell-primary">${area}㎡</div>
                    <div class="cell-secondary">${floor}층</div>
                </td>
                <td class="td-center">
                    <div class="price-wrapper center-flex">
                        <span class="price-text ${trade.isNewHigh ? 'new-high' : ''}">${price}</span>
                        ${prevHighText ? `<div class="prev-high-wrapper" style="font-size:0.8em; color:#888;">${prevHighText}</div>` : ''}
                    </div>
                    <div class="date-wrapper">${contractDate} <span class="trade-count" style="font-size:0.8em; color:#aaa;">${countText}</span></div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// 구별로 그룹핑하여 렌더링
function renderSectionByGu(containerId, trades) {
    const container = document.getElementById(containerId);
    container.innerHTML = ''; // 초기화

    // 구별로 데이터 분류
    const tradesByGu = {};
    trades.forEach(trade => {
        const gu = trade.gu || '기타';
        if (!tradesByGu[gu]) {
            tradesByGu[gu] = [];
        }
        tradesByGu[gu].push(trade);
    });

    // 구 이름 정렬
    const guNames = Object.keys(tradesByGu).sort((a, b) => a.localeCompare(b, 'ko'));

    // 구별 섹션 생성
    guNames.forEach(gu => {
        // ... (이전 코드와 동일, 생략 가능하지만 전체 replace이므로 포함해야 함) ...
        const guTrades = tradesByGu[gu];

        // 구 헤더 생성
        const guWrapper = document.createElement('div');
        guWrapper.className = 'gu-section-wrapper';
        guWrapper.innerHTML = `
            <h4 class="gu-header">${gu} <span class="gu-count">(${guTrades.length})</span></h4>
            <div class="cards-grid">
                ${guTrades.map(createTradeCard).join('')}
            </div>
        `;

        container.appendChild(guWrapper);
    });

    container.className = 'gu-list-container';
}

// 거래 카드 생성
function createTradeCard(trade) {
    const typeClass = trade.type === 'apt' ? 'apt' : 'presale';
    const fullDistrict = trade.dong ? `${trade.gu} ${trade.dong}` : trade.gu;

    const name = trade.name;
    const area = trade.area;
    const floor = trade.floor;
    const price = trade.priceDisplay;
    const contractDate = trade.contractDate;
    const isNewHigh = trade.isNewHigh;

    // 추가 정보 처리
    const currentYear = new Date().getFullYear();
    let buildYearText = '';
    if (trade.buildYear) {
        const by = parseInt(trade.buildYear);
        if (!isNaN(by)) {
            const age = currentYear - by;
            buildYearText = `${by}년 (${age <= 0 ? '신축' : age + '년차'})`;
        } else {
            buildYearText = trade.buildYear;
        }
    }

    const prevHighText = trade.prevHigh ? `(${formatPrice(trade.prevHigh)})` : '';
    const tradeCountText = trade.tradeCount3m ? `3개월 거래: (${trade.tradeCount3m})` : '';

    return `
        <div class="trade-card ${typeClass}${isNewHigh ? ' new-high' : ''}">
            <div class="card-header">
                <div>
                    <div class="card-name">${name}</div>
                    <div class="card-district">${fullDistrict}</div>
                    ${buildYearText ? `<div class="card-year">${buildYearText}</div>` : ''}
                </div>
                <div class="card-price-block">
                    <div class="card-price">
                        ${price}
                        ${prevHighText ? `<span class="prev-high-mini">${prevHighText}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="card-body">
                <div class="card-info">
                    <span class="label">전용면적</span>
                    <span class="value">${area}㎡</span>
                </div>
                <div class="card-info">
                    <span class="label">층수</span>
                    <span class="value">${floor}층</span>
                </div>
                <div class="card-info">
                    <span class="label">계약일</span>
                    <span class="value">${contractDate}</span>
                </div>
            </div>
            ${tradeCountText ? `<div class="card-footer-info">${tradeCountText}</div>` : ''}
        </div>
    `;
}

// 금액 포맷팅
function formatPrice(price) {
    if (!price) return '-';

    // 문자열인 경우 숫자로 변환
    let numPrice = price;
    if (typeof price === 'string') {
        // 이미 억 단위 포맷이면 그대로 반환
        if (price.includes('억') || price.includes('만')) return price;
        numPrice = parseInt(price.replace(/[^0-9]/g, ''));
    }

    if (isNaN(numPrice)) return price;

    // 1억 이상: 소수점 둘째자리까지 (예: 6.56억)
    if (numPrice >= 100000000) {
        return (numPrice / 100000000).toFixed(2) + '억';
    }

    // 1만 이상 (1억 미만): 만원 단위 (예: 5,000만)
    if (numPrice >= 10000) {
        return Math.round(numPrice / 10000).toLocaleString() + '만';
    }

    return numPrice.toLocaleString();
}

// 전역 함수로 내보내기
window.loadSelectedTrades = loadSelectedTrades;
window.toggleViewMode = toggleViewMode;
