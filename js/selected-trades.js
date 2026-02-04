// === 선택된 실거래가 리포트 - JavaScript ===

// GitHub 설정
const GITHUB_CONFIG = {
    token: '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',
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
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_CONFIG.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

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

    const response = await fetch(url, {
        headers: {
            'Authorization': `token ${GITHUB_CONFIG.token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });

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
function hideAllUI() {
    document.getElementById('report-header').classList.add('hidden');
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

        renderReport(selectedDate, trades);
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
    } else if (data.trades) {
        trades = data.trades;
    } else if (data.selected_trades) {
        trades = data.selected_trades;
    } else if (data.apt_trades && data.presale_trades) {
        trades = [
            ...data.apt_trades.map(t => ({ ...t, type: 'apt' })),
            ...data.presale_trades.map(t => ({ ...t, type: 'presale' }))
        ];
    } else if (data.apt || data.presale) {
        trades = [
            ...(data.apt || []).map(t => ({ ...t, type: 'apt' })),
            ...(data.presale || []).map(t => ({ ...t, type: 'presale' }))
        ];
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
            buildYear
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
function renderReport(dateStr, trades) {
    // 헤더 업데이트
    document.getElementById('report-date-display').textContent = formatDateDisplay(dateStr);
    document.getElementById('report-header').classList.remove('hidden');

    // 요약 업데이트
    const aptTrades = trades.filter(t => t.type === 'apt');
    const presaleTrades = trades.filter(t => t.type === 'presale');

    document.getElementById('summary-date').textContent = formatDateDisplay(dateStr);
    document.getElementById('summary-count').textContent = trades.length.toLocaleString() + '건';
    document.getElementById('summary-apt').textContent = aptTrades.length.toLocaleString() + '건';
    document.getElementById('summary-presale').textContent = presaleTrades.length.toLocaleString() + '건';
    document.getElementById('data-summary').classList.remove('hidden');

    // 아파트 섹션 (구별 그룹핑)
    if (aptTrades.length > 0) {
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

    // 기존 cards-grid 스타일을 덮어쓰기 위해 container의 클래스 조정이 필요할 수 있으나,
    // 여기서는 container 내부에 새로운 구조를 넣었으므로 CSS 수정이 필요함.
    // 기존 container가 'cards-grid' 클래스를 가지고 있다면 그리드 안에 그리드가 되어 깨질 수 있음.
    // 따라서 HTML 구조 변경에 맞춰 CSS도 수정해야 함.
    container.className = 'gu-list-container';
}

// 거래 카드 생성
function createTradeCard(trade) {
    const typeClass = trade.type === 'apt' ? 'apt' : 'presale';
    const fullDistrict = trade.dong ? `${trade.gu} ${trade.dong}` : trade.gu;

    // processTrades에서 이미 처리된 필드 사용
    const name = trade.name;
    const area = trade.area;
    const floor = trade.floor;
    const price = trade.priceDisplay;
    const contractDate = trade.contractDate;
    const buildYear = trade.buildYear;
    const isNewHigh = trade.isNewHigh;

    return `
        <div class="trade-card ${typeClass}${isNewHigh ? ' new-high' : ''}">
            <div class="card-header">
                <div>
                    <div class="card-name">${name}</div>
                    <div class="card-district">${fullDistrict}</div>
                    ${buildYear ? `<div class="card-year">${buildYear}</div>` : ''}
                </div>
                <div class="card-price">
                    ${price}
                    <div class="card-price-unit">거래금액</div>
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
