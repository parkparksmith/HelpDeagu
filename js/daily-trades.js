// === 오늘의 실거래가 전부 - JavaScript ===

// GitHub 설정
//
const GITHUB_CONFIG = {
    token: '', // 토큰이 없으면 공개 리포지토리로 접근 (Rate Limit 주의: 60회/시간)
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
        const headers = {
            'Accept': 'application/vnd.github.v3+json'
        };
        if (GITHUB_CONFIG.token) {
            headers['Authorization'] = `token ${GITHUB_CONFIG.token}`;
        }

        const response = await fetch(url, { headers });

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

    const headers = {
        'Accept': 'application/vnd.github.v3+json'
    };
    if (GITHUB_CONFIG.token) {
        headers['Authorization'] = `token ${GITHUB_CONFIG.token}`;
    }

    const response = await fetch(url, { headers });

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

        // 건축년도
        construction_year: trade.construction_year || trade['건축년도'] || null,

        // 해제사유발생일 (취소된 거래)
        cancelDate: trade.termination_date || trade['해제사유발생일'] || null,

        // 이전 최고가
        previousHigh: trade.previous_high || trade['직전최고가'] || 0,

        // 신고가 여부
        isNewHigh: trade.is_newhigh === true || trade._is_newhigh === true || (typeof trade['거래금액(신고가)'] === 'string' && trade['거래금액(신고가)'].includes('🔥'))
    }));
}

// 요약 정보 업데이트
// 요약 정보 업데이트
function updateSummary(dateStr, trades) {
    // 날짜 표시는 UI에서 제거됨
    // document.getElementById('summary-date').textContent = formatDateDisplay(dateStr);

    document.getElementById('summary-count').textContent = trades.length.toLocaleString() + '건';

    const aptCount = trades.filter(t => t.type === 'apt').length;
    const presaleCount = trades.filter(t => t.type === 'presale').length;

    // 신고가 집계
    const aptNewHighCount = trades.filter(t => t.type === 'apt' && t.isNewHigh).length;
    const presaleNewHighCount = trades.filter(t => t.type === 'presale' && t.isNewHigh).length;

    document.getElementById('summary-apt').textContent = aptCount.toLocaleString() + '건';
    document.getElementById('summary-presale').textContent = presaleCount.toLocaleString() + '건';

    // 신고가 업데이트
    document.getElementById('summary-apt-newhigh').textContent = aptNewHighCount.toLocaleString() + '건';
    document.getElementById('summary-presale-newhigh').textContent = presaleNewHighCount.toLocaleString() + '건';
}

// 구/군 필터 채우기
function populateDistrictFilter(trades) {
    // 사용자 지정 순서
    const priorityOrder = ['수성구', '중구', '달서구', '서구', '남구', '군위군'];

    const districts = [...new Set(trades.map(t => t.gu || '기타'))];

    districts.sort((a, b) => {
        const indexA = priorityOrder.indexOf(a);
        const indexB = priorityOrder.indexOf(b);

        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        return a.localeCompare(b, 'ko');
    });

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
// 구별로 정렬하여 렌더링
// 구별로 정렬하여 렌더링
function renderTradesByGu(trades) {
    const container = document.getElementById('trades-table-container');

    // 기존 테이블 숨기거나 제거하고 새로운 구조 생성
    // 구별로 데이터 분류
    const tradesByGu = {};
    if (trades.length === 0) {
        container.innerHTML = '<div class="no-data"><span class="material-icons-round">inbox</span><p>조건에 맞는 데이터가 없습니다.</p></div>';
        return;
    }

    trades.forEach(trade => {
        const gu = trade.gu || '기타';
        if (!tradesByGu[gu]) tradesByGu[gu] = [];
        tradesByGu[gu].push(trade);
    });

    // 사용자 지정 순서 적용
    const priorityOrder = ['수성구', '중구', '달서구', '서구', '남구', '군위군'];

    const guNames = Object.keys(tradesByGu).sort((a, b) => {
        const indexA = priorityOrder.indexOf(a);
        const indexB = priorityOrder.indexOf(b);

        // 둘 다 우선순위 목록에 있는 경우, 목록 순서대로 정렬
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;

        // 하나만 있는 경우, 있는 것이 먼저 옴
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        // 둘 다 없는 경우, 가나다순 정렬
        return a.localeCompare(b, 'ko');
    });

    let html = '';

    // 정렬 함수: 동 -> 단지명 -> 전용면적
    const sortLogic = (a, b) => {
        // 1. 동 정렬
        if (a.dong !== b.dong) return a.dong.localeCompare(b.dong, 'ko');

        // 2. 단지명 정렬
        const nameA = a['단지명'] || a.apt_name || a.name || '';
        const nameB = b['단지명'] || b.apt_name || b.name || '';
        if (nameA !== nameB) return nameA.localeCompare(nameB, 'ko');

        // 3. 전용면적 정렬 (숫자로 변환 후 비교)
        const areaA = parseFloat(a.area || a['면적'] || 0);
        const areaB = parseFloat(b.area || b['면적'] || 0);
        return areaA - areaB;
    };

    guNames.forEach((gu, index) => {
        const guTrades = tradesByGu[gu];

        // 아파트와 분양권 분리 및 정렬
        const aptTrades = guTrades.filter(t => t.type === 'apt').sort(sortLogic);
        const presaleTrades = guTrades.filter(t => t.type === 'presale').sort(sortLogic);

        // Animation delay for stagger effect
        const styleDelay = `animation-delay: ${index * 0.1}s`;

        html += `
            <div class="gu-section slide-in-up" style="${styleDelay}">
                <div class="gu-header-card">
                    <h4 class="gu-title">${gu} <span class="badge-count">${guTrades.length}</span></h4>
                </div>
                <div class="table-responsive">
                    <table class="premium-table">
                        <thead>
                            <tr>
                                <th class="text-center th-dong">동</th>
                                <th class="text-center th-name">단지명</th>
                                <th class="text-center th-area">전용<br><span style="font-size:0.8em; opacity:0.7">층</span></th>
                                <th class="text-center th-price">거래금액<br><span style="font-size:0.8em; opacity:0.7">계약일(거래건수)</span></th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        // 렌더링 헬퍼 함수
        const renderRows = (list) => {
            const currentYear = new Date().getFullYear();
            let rowHtml = '';
            list.forEach(trade => {
                const name = trade['단지명'] || trade.apt_name || trade.name || trade.title || '-';
                const dong = trade.dong || '-';

                // 건축년도 및 연차 계산
                let nameHtml = `<div class="apt-name-text">${name}</div>`;
                if (trade.construction_year) {
                    const buildYear = parseInt(trade.construction_year);
                    if (!isNaN(buildYear)) {
                        const age = currentYear - buildYear;
                        const ageText = age <= 0 ? '신축' : `${age}년차`;
                        nameHtml += `<div class="construction-info">${buildYear} <span class="age-badge">(${ageText})</span></div>`;
                    }
                }

                // 전용면적 포맷팅 (소수점 2자리)
                let area = trade.area || trade['면적'] || 0;
                area = parseFloat(area).toFixed(2);

                const floor = trade.floor || trade['층'] || '-';

                // 계약일 포맷팅 (MM-dd)
                let contractDate = trade.contract_date || trade['계약일'] || '-';
                if (contractDate.length === 8) {
                    // YYYYMMDD -> MM-dd
                    contractDate = `${contractDate.substring(4, 6)}-${contractDate.substring(6, 8)}`;
                } else if (contractDate.includes('-')) {
                    // YYYY-MM-DD -> MM-dd
                    const parts = contractDate.split('-');
                    if (parts.length === 3) contractDate = `${parts[1]}-${parts[2]}`;
                }

                // 거래건수 (3개월: 전체/전용)
                const countTotal = trade.trade_count_3m_total || 0;
                const countArea = trade.trade_count_3m_area || 0;
                const tradeCounts = `(${countTotal}/${countArea})`;

                // 가격 처리
                const isNewHigh = trade.isNewHigh;
                const isCancelled = !!trade.cancelDate;
                const priceVal = trade.price || 0;
                const priceText = formatPrice(priceVal);

                let rowClass = 'trade-row';
                if (isCancelled) rowClass += ' cancelled';
                else if (isNewHigh) rowClass += ' new-high';

                // 가격 표시 (취소된 경우 취소 태그 추가)
                let priceHtml = '';

                if (isCancelled) {
                    priceHtml = `<span class="price-text cancelled">${priceText} <span class="cancel-badge">취소</span></span>`;
                } else if (isNewHigh) {
                    priceHtml = `<span class="price-text new-high">🔥 ${priceText}</span>`;
                } else {
                    priceHtml = `<span class="price-text">${priceText}</span>`;
                }

                // 이전 최고가 (직전최고가) 표시
                if (!isCancelled && trade.previousHigh) {
                    const prevHighVal = parseFloat(trade.previousHigh);
                    if (prevHighVal > 0) {
                        const prevHighText = formatPrice(prevHighVal);
                        priceHtml += `<div class="prev-high-wrapper">(${prevHighText})</div>`;
                    }
                }

                rowHtml += `
                    <tr class="${rowClass}">
                        <td class="td-center td-dong">${dong}</td>
                        <td class="td-center td-name">${nameHtml}</td>
                        <td class="td-center">
                            <div class="cell-primary">${area}㎡</div>
                            <div class="cell-secondary">${floor}층</div>
                        </td>
                        <td class="td-center">
                            <div class="price-wrapper center-flex">${priceHtml}</div>
                            <div class="date-wrapper">${contractDate} <span class="trade-count">${tradeCounts}</span></div>
                        </td>
                    </tr>
                `;
            });
            return rowHtml;
        };

        // 아파트 리스트 렌더링
        if (aptTrades.length > 0) {
            html += `
                <tr class="category-row">
                    <td colspan="4" style="padding: 0;">
                        <div class="category-header apt-header">
                            <span class="material-icons-round">apartment</span> 아파트
                        </div>
                    </td>
                </tr>
            `;
            html += renderRows(aptTrades);
        }

        // 분양권 리스트 렌더링
        if (presaleTrades.length > 0) {
            html += `
                <tr class="category-row">
                    <td colspan="4" style="padding: 0;">
                        <div class="category-header presale-header">
                            <span class="material-icons-round">receipt_long</span> 분양권
                        </div>
                    </td>
                </tr>
            `;
            html += renderRows(presaleTrades);
        }

        html += `
                        </tbody>
                    </table>
                </div>
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
