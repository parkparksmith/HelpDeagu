// === 오늘의 실거래가 전부 - JavaScript ===

// GitHub 설정
const GITHUB_CONFIG = {
    token: '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',
    repo: 'parkparksmith/HelpDeagu',
    branch: 'main'
};

// 전역 변수
let allTrades = [];
let filteredTrades = [];

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    initializeDateSelect();
});

// 날짜 선택 콤보박스 초기화
async function initializeDateSelect() {
    const dateSelect = document.getElementById('trade-date');

    try {
        // GitHub API로 Daily 폴더의 파일 목록 조회
        const url = `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/Json/Daily?ref=${GITHUB_CONFIG.branch}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_CONFIG.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) throw new Error('날짜 목록을 불러오는데 실패했습니다.');

        const files = await response.json();

        // daily_trades_YYYYMMDD.json 패턴에서 날짜 추출 및 정렬 (최신순)
        const dates = files
            .filter(file => file.name.startsWith('daily_trades_') && file.name.endsWith('.json'))
            .map(file => {
                const match = file.name.match(/daily_trades_(\d{8})\.json/);
                return match ? match[1] : null;
            })
            .filter(date => date !== null)
            .sort((a, b) => b.localeCompare(a)); // 내림차순 정렬

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

        // 가장 최신 날짜 자동 선택 및 로드
        if (dates.length > 0) {
            dateSelect.value = dates[0];
            // 초기 데이터 자동 로드 (선택 사항)
            // loadDailyTrades(); 
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
    // YYYYMMDD 또는 YYYY-MM-DD 모두 처리
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
            throw new Error('해당 날짜의 데이터가 없습니다.');
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
    document.getElementById('data-summary').classList.add('hidden');
    document.getElementById('trades-container').classList.add('hidden');
    hideError();
}

// 오늘의 실거래가 로드
async function loadDailyTrades() {
    const dateInput = document.getElementById('trade-date');
    const selectedDate = dateInput.value;

    if (!selectedDate) {
        showError('날짜를 선택해주세요.');
        return;
    }

    hideAllUI();
    showLoading(true);

    try {
        const formattedDate = selectedDate; // 이미 YYYYMMDD 형식이므로 변환 불필요
        const filePath = `Json/Daily/daily_trades_${formattedDate}.json`;

        const data = await fetchFromGitHub(filePath);
        allTrades = processTrades(data);
        filteredTrades = [...allTrades];

        updateSummary(selectedDate, allTrades);
        populateDistrictFilter(allTrades);
        renderTradesByGu(filteredTrades);

        document.getElementById('data-summary').classList.remove('hidden');
        document.getElementById('trades-container').classList.remove('hidden');
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
    } else if (data.apt || data.presale) {
        trades = [
            ...(data.apt || []).map(t => ({ ...t, type: 'apt' })),
            ...(data.presale || []).map(t => ({ ...t, type: 'presale' }))
        ];
    }

    // type 및 필드 표준화
    // DailyData JSON 구조: amount, gu, dong, trade_type, is_newhigh
    return trades.map(trade => ({
        ...trade,
        // 타입: trade_type("아파트"|"분양권") 또는 raw type
        type: (trade.trade_type === '분양권' || trade['유형'] === '분양권') ? 'presale' : 'apt',

        // 구/동
        gu: trade.gu || trade['구'] || trade.district?.split(' ')[1] || '',
        dong: trade.dong || trade['동'] || '',

        // 가격 (DailyData는 amount 숫자로 옴)
        price: trade.amount || trade['거래금액'] || trade.price || 0,

        // 신고가 여부
        isNewHigh: trade.is_newhigh === true || trade._is_newhigh === true || (typeof trade['거래금액(신고가)'] === 'string' && trade['거래금액(신고가)'].includes('🔥'))
    }));
}

// 요약 정보 업데이트
function updateSummary(dateStr, trades) {
    document.getElementById('summary-date').textContent = formatDateDisplay(dateStr);
    document.getElementById('summary-count').textContent = trades.length.toLocaleString() + '건';

    const aptCount = trades.filter(t => t.type === 'apt').length;
    const presaleCount = trades.filter(t => t.type === 'presale').length;

    document.getElementById('summary-apt').textContent = aptCount.toLocaleString() + '건';
    document.getElementById('summary-presale').textContent = presaleCount.toLocaleString() + '건';
}

// 구/군 필터 채우기
function populateDistrictFilter(trades) {
    const districts = [...new Set(trades.map(t => t.gu || '기타'))];
    districts.sort((a, b) => a.localeCompare(b, 'ko'));

    const filterSelect = document.getElementById('filter-district');
    filterSelect.innerHTML = '<option value="all">전체 구/군</option>';

    districts.forEach(district => {
        const option = document.createElement('option');
        option.value = district;
        option.textContent = district;
        filterSelect.appendChild(option);
    });
}

// 거래 필터링
function filterTrades() {
    const typeFilter = document.getElementById('filter-type').value;
    const districtFilter = document.getElementById('filter-district').value;

    filteredTrades = allTrades.filter(trade => {
        const typeMatch = typeFilter === 'all' || trade.type === typeFilter;
        const district = trade.gu || '기타';
        const districtMatch = districtFilter === 'all' || district === districtFilter;
        return typeMatch && districtMatch;
    });

    renderTradesByGu(filteredTrades);
}

// 구별로 정렬하여 렌더링
function renderTradesByGu(trades) {
    const container = document.getElementById('trades-table-container');

    // 기존 테이블 숨기거나 제거하고 새로운 구조 생성
    // 구별로 데이터 분류
    const tradesByGu = {};
    if (trades.length === 0) {
        container.innerHTML = '<div style="padding:40px; text-align:center; color:#888;">조건에 맞는 데이터가 없습니다.</div>';
        return;
    }

    trades.forEach(trade => {
        const gu = trade.gu || '기타';
        if (!tradesByGu[gu]) tradesByGu[gu] = [];
        tradesByGu[gu].push(trade);
    });

    const guNames = Object.keys(tradesByGu).sort((a, b) => a.localeCompare(b, 'ko'));
    let html = '';

    guNames.forEach(gu => {
        const guTrades = tradesByGu[gu];
        // 동별 정렬
        guTrades.sort((a, b) => a.dong.localeCompare(b.dong, 'ko') || b.price - a.price);

        html += `
            <div class="gu-section-wrapper" style="margin-bottom: 30px;">
                <h4 class="gu-header" style="padding-left: 10px; border-left: 4px solid var(--accent);">${gu} <span class="gu-count">(${guTrades.length})</span></h4>
                <table class="trades-table-style" style="width:100%; border-collapse: collapse; margin-top: 10px; font-size: 0.85rem;">
                    <thead>
                        <tr style="background: var(--bg-card); border-bottom: 2px solid var(--border);">
                            <th style="padding:10px; text-align:left;">유형</th>
                            <th style="padding:10px; text-align:left;">동</th>
                            <th style="padding:10px; text-align:left;">단지명</th>
                            <th style="padding:10px; text-align:center;">전용(㎡)</th>
                            <th style="padding:10px; text-align:center;">층</th>
                            <th style="padding:10px; text-align:right;">거래금액</th>
                            <th style="padding:10px; text-align:right;">계약일</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        guTrades.forEach(trade => {
            const typeBadge = trade.type === 'apt'
                ? '<span class="type-badge apt" style="font-size:0.7rem;">아파트</span>'
                : '<span class="type-badge presale" style="font-size:0.7rem; background:rgba(255,152,0,0.2); color:#ff9800;">분양권</span>';

            const name = trade['단지명'] || trade.apt_name || trade.name || trade.title || '-';
            const dong = trade.dong || '-';
            const area = trade.area || trade['면적'] || '-';
            const floor = trade.floor || trade['층'] || '-';
            const contractDate = trade.contract_date || trade['계약일'] || '-';

            // 가격 처리
            const isNewHigh = trade.isNewHigh;
            const priceVal = trade.price || 0;
            const priceText = formatPrice(priceVal);

            // 신고가 스타일
            const priceClass = isNewHigh ? 'price-cell new-high-text' : 'price-cell';
            const priceDisplay = isNewHigh ? `🔥 ${priceText}` : priceText;
            const rowClass = isNewHigh ? 'highlight-row' : '';
            const rowStyle = isNewHigh ? 'background: rgba(248, 81, 73, 0.05);' : '';

            html += `
                <tr style="border-bottom: 1px solid var(--border); ${rowStyle}">
                    <td style="padding:10px;">${typeBadge}</td>
                    <td style="padding:10px; color:var(--text-secondary);">${dong}</td>
                    <td style="padding:10px; font-weight:600; color:var(--text-primary);">${name}</td>
                    <td style="padding:10px; text-align:center;">${area}</td>
                    <td style="padding:10px; text-align:center;">${floor}</td>
                    <td style="padding:10px; text-align:right;" class="${priceClass}">
                        <span style="${isNewHigh ? 'color:#ff6b6b; font-weight:bold;' : 'font-weight:bold;'}">${priceDisplay}</span>
                    </td>
                    <td style="padding:10px; text-align:right; color:var(--text-muted); font-size:0.8rem;">${contractDate}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
    });

    container.innerHTML = html;
}

// 금액 포맷팅
// 금액 포맷팅
function formatPrice(price) {
    if (!price) return '-';

    // 문자열인 경우 숫자로 변환
    let numPrice = price;
    if (typeof price === 'string') {
        // 이미 억 단위 포맷이면 그대로 반환 (SelectData인 경우)
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
window.loadDailyTrades = loadDailyTrades;
window.filterTrades = filterTrades;
