// Supabase 인증 정보 (v2)
// 중요: 클라이언트(브라우저) 환경에서는 비밀번호 기반 직접 연결(TCP)이 불가능합니다.
// 브라우저에서는 보통 Supabase REST API (또는 GraphQL)를 통해 데이터를 호출합니다.
// 
// 주신 정보(사용자명, 비밀번호, 6543 포트)는 백엔드 서버(Node.js, Python 등)용 DB 접속 정보입니다.
// 브라우저 JS 환경에서 바로 접근하기 위해서는 Supabase 프로젝트의 'Anon public key'가 필요합니다.
// 대시보드 -> Project Settings -> API 탭에서 'anon' / 'public' 키를 복사해서 아래에 넣어주세요.
const SUPABASE_URL = 'https://glmerfqfaqzdphbienqh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsbWVyZnFmYXF6ZHBoYmllbnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjUyNjgsImV4cCI6MjA4NzIwMTI2OH0.xuiYzjDYWWJNg4P3wFS-fLoc_2cMWgdx3SeZHJcDPLs';

let supabaseClient;
if (SUPABASE_ANON_KEY !== '여기에_ANON_KEY_를_입력해주세요') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// 뷰 모드 가져오기
function currentViewMode() {
    const el = document.getElementById('view-mode');
    return el ? el.value : 'normal';
}

function changeViewMode() {
    if (filteredTrades.length > 0) {
        renderTradesByGu(filteredTrades);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 오늘 날짜를 기본값으로 세팅
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    document.getElementById('trade-date').value = dateStr;

    if (!supabaseClient) {
        document.getElementById('error-message').innerHTML = `
            <strong>설정 안내!</strong><br>
            Supabase DB에 접속하기 위한 연결 정보(Anon Key)가 아직 입력되지 않았습니다.<br>
            js/daily-trades-v2.js 파일을 열고 첫줄의 SUPABASE_ANON_KEY 값을 대시보드의 값으로 변경해주세요.<br>
            *(참고: 주신 6543 포트와 비밀번호는 백엔드용이며 프론트엔드에서는 직접 사용 불가함)*
        `;
        document.getElementById('error-message').classList.remove('hidden');
    }
});

let allTrades = [];
let filteredTrades = [];

async function loadDailyTrades() {
    if (!supabaseClient) {
        alert("Anon public key 가 입력되지 않았습니다. 소스코드를 확인해주세요.");
        return;
    }

    const tradeDateStr = document.getElementById('trade-date').value;
    const dateType = document.getElementById('date-type').value; // 'write_date' or 'contract_date'

    if (!tradeDateStr) {
        alert('조회할 날짜를 선택해주세요.');
        return;
    }

    // 초기화
    document.getElementById('error-message').classList.add('hidden');
    document.getElementById('data-summary').classList.add('hidden');
    document.getElementById('trades-container').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');

    try {
        let aptTrades = [];
        let presaleTrades = [];

        // Supabase DB 쿼리
        // date_type 이 write_date 이면 등록일 기준 검색
        // contract_date 이면 계약일 기준 검색
        // (APTAPT 프로젝트 db_manager.py의 쿼리와 흡사하게 작성하되, 여기서는 단순 조회 후 JS에서 조작합니다)

        let targetField = dateType === 'write_date' ? 'write_date' : 'contractdate';

        // 아파트 쿼리
        const { data: aptData, error: aptError } = await supabaseClient
            .from('apt_trades')
            .select(`
                city, dong, apt_name, area, contractdate, amount, floor, 
                buyer_type, transaction_type, newhigh, write_date, construction_year
            `)
            .gte(targetField, tradeDateStr + ' 00:00:00')
            .lte(targetField, tradeDateStr + ' 23:59:59')
            .is('termination_date', null)
            .order('amount', { ascending: false })
            .limit(2000);

        if (aptError) throw aptError;
        if (aptData) aptTrades = aptData.map(item => ({ ...item, isPresale: false }));

        // 분양권 쿼리
        const { data: presaleData, error: presaleError } = await supabaseClient
            .from('presale_trades')
            .select(`
                city, dong, apt_name, area, contractdate, amount, floor, 
                buyer_type, transaction_type, newhigh, write_date, presale_type
            `)
            .gte(targetField, tradeDateStr + ' 00:00:00')
            .lte(targetField, tradeDateStr + ' 23:59:59')
            .is('termination_date', null)
            .order('amount', { ascending: false })
            .limit(2000);

        if (presaleError) throw presaleError;
        if (presaleData) presaleTrades = presaleData.map(item => ({ ...item, isPresale: true }));

        const rawTrades = [...aptTrades, ...presaleTrades];

        // 3개월 전 및 3년 전 날짜 계산
        const qDate3M = new Date(tradeDateStr);
        qDate3M.setMonth(qDate3M.getMonth() - 3);
        const threeMonthsAgoStr = qDate3M.toISOString().split('T')[0];

        const qDate3Y = new Date(tradeDateStr);
        qDate3Y.setFullYear(qDate3Y.getFullYear() - 3);
        const threeYearsAgoStr = qDate3Y.toISOString().split('T')[0];

        // 검색된 아파트들의 과거 데이터 가져오기
        const aptNamesSet = new Set(rawTrades.filter(t => t.apt_name).map(t => t.apt_name));
        const aptNamesList = Array.from(aptNamesSet);
        let pastTrades = [];

        try {
            const chunkSize = 30; // 범위가 3년이므로 청크를 줄임
            for (let i = 0; i < aptNamesList.length; i += chunkSize) {
                const chunk = aptNamesList.slice(i, i + chunkSize);
                // 아파트 과거 거래
                const { data: pastAptData } = await supabaseClient
                    .from('apt_trades')
                    .select('apt_name, area, contractdate, amount')
                    .in('apt_name', chunk)
                    .gte('contractdate', threeYearsAgoStr)
                    .lte('contractdate', tradeDateStr)
                    .is('termination_date', null)
                    .order('contractdate', { ascending: false })
                    .limit(3000); // supabase default limit 1000 대비 안전하게
                if (pastAptData) pastTrades.push(...pastAptData);

                // 분양권 과거 거래
                const { data: pastPresaleData } = await supabaseClient
                    .from('presale_trades')
                    .select('apt_name, area, contractdate, amount')
                    .in('apt_name', chunk)
                    .gte('contractdate', threeYearsAgoStr)
                    .lte('contractdate', tradeDateStr)
                    .is('termination_date', null)
                    .order('contractdate', { ascending: false })
                    .limit(3000);
                if (pastPresaleData) pastTrades.push(...pastPresaleData);
            }
        } catch (e) {
            console.error("과거 데이터 로딩 실패:", e);
        }

        // v1 구조로 데이터 정제
        allTrades = rawTrades.map(t => {
            const regex = /(대구광역시|대구\S*)\s*(\S+구|\S+군)/;
            const match = (t.city || '').match(regex);

            const cityParts = (t.city || '').trim().split(/\s+/);
            const adminDong = cityParts.length >= 3 ? cityParts.slice(2).join(' ') : (t.dong || '-');

            // 3개월 이내 전체 타입 거래
            // DB날짜 형식 YYYY-MM-DD 를 문자열 비교
            const past3MAll = pastTrades.filter(pt =>
                pt.apt_name === t.apt_name &&
                (pt.contractdate || '') >= threeMonthsAgoStr
            );
            // 3개월 이내 같은 타입 거래
            const past3MSame = past3MAll.filter(pt =>
                Math.abs(parseFloat(pt.area || 0) - parseFloat(t.area || 0)) < 1.0
            );

            // 3년 이내 같은 타입 거래 (그래프용)
            const past3YSame = pastTrades.filter(pt =>
                pt.apt_name === t.apt_name &&
                Math.abs(parseFloat(pt.area || 0) - parseFloat(t.area || 0)) < 1.0
            ).sort((a, b) => (a.contractdate || '').localeCompare(b.contractdate || ''));

            let currentPriceNum = t.amount;
            if (typeof currentPriceNum === 'string') {
                currentPriceNum = parseInt(currentPriceNum.replace(/[^0-9]/g, ''));
            }
            if (isNaN(currentPriceNum)) currentPriceNum = 0;

            let highestPrice = currentPriceNum;
            if (past3YSame.length > 0) {
                const prices = past3YSame.map(pt => {
                    let val = pt.amount;
                    if (typeof val === 'string') val = parseInt(val.replace(/[^0-9]/g, ''));
                    return isNaN(val) ? 0 : val;
                });
                const maxPast = Math.max(...prices);
                if (maxPast > highestPrice) highestPrice = maxPast;
            }

            return {
                type: t.isPresale ? 'presale' : 'apt',
                gu: match ? match[2] : "기타",
                dong: adminDong,
                apt_name: t.apt_name,
                area: t.area,
                floor: t.floor,
                price: t.amount,
                contract_date: t.contractdate,
                construction_year: t.construction_year,
                cancelDate: t.termination_date,
                isNewHigh: t.newhigh === true || t.newhigh === 1,
                previousHigh: highestPrice,
                recentVolumeAll: past3MAll.length,
                recentVolumeSame: past3MSame.length,
                recentHistory: past3YSame.map(pt => pt.amount)
            };
        });

        filteredTrades = [...allTrades];

        // UI 렌더링
        updateSummary(allTrades);
        populateDistrictFilter(allTrades);
        renderTradesByGu(filteredTrades);

        document.getElementById('loading').classList.add('hidden');
        document.getElementById('data-summary').classList.remove('hidden');
        document.getElementById('trades-container').classList.remove('hidden');

    } catch (err) {
        console.error("Supabase 로드 에러:", err);
        document.getElementById('loading').classList.add('hidden');
        const errorMsg = document.getElementById('error-message');
        errorMsg.textContent = `데이터를 불러오지 못했습니다. DB가 살아있는지 또는 권한(RLS)을 확인하세요.\n[오류] ${err.message}`;
        errorMsg.classList.remove('hidden');
    }
}

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

function updateSummary(trades) {
    const totalCount = trades.length;
    const aptCount = trades.filter(t => t.type === 'apt').length;
    const presaleCount = trades.filter(t => t.type === 'presale').length;

    const aptNewHighCount = trades.filter(t => t.type === 'apt' && t.isNewHigh).length;
    const presaleNewHighCount = trades.filter(t => t.type === 'presale' && t.isNewHigh).length;

    document.getElementById('summary-count').textContent = totalCount.toLocaleString() + '건';
    document.getElementById('summary-apt').textContent = aptCount.toLocaleString() + '건';
    document.getElementById('summary-presale').textContent = presaleCount.toLocaleString() + '건';
    document.getElementById('summary-apt-newhigh').textContent = aptNewHighCount.toLocaleString() + '건';
    document.getElementById('summary-presale-newhigh').textContent = presaleNewHighCount.toLocaleString() + '건';
}

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

    const filter = document.getElementById('filter-district');
    filter.innerHTML = '<option value="all">전체 구/군</option>';

    districts.forEach(d => {
        const option = document.createElement('option');
        option.value = d;
        option.textContent = d;
        filter.appendChild(option);
    });
}

// 구별로 정렬하여 렌더링 (v1 스타일)
function renderTradesByGu(trades) {
    const container = document.getElementById('trades-table-container');

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

    const priorityOrder = ['수성구', '중구', '달서구', '서구', '남구', '군위군'];

    const guNames = Object.keys(tradesByGu).sort((a, b) => {
        const indexA = priorityOrder.indexOf(a);
        const indexB = priorityOrder.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b, 'ko');
    });

    let html = '';

    const sortLogic = (a, b) => {
        if (a.dong !== b.dong) return a.dong.localeCompare(b.dong, 'ko');
        const nameA = a.apt_name || '';
        const nameB = b.apt_name || '';
        if (nameA !== nameB) return nameA.localeCompare(nameB, 'ko');
        const areaA = parseFloat(a.area || 0);
        const areaB = parseFloat(b.area || 0);
        return areaA - areaB;
    };

    guNames.forEach((gu, index) => {
        const guTrades = tradesByGu[gu];
        const aptTrades = guTrades.filter(t => t.type === 'apt').sort(sortLogic);
        const presaleTrades = guTrades.filter(t => t.type === 'presale').sort(sortLogic);

        const viewMode = currentViewMode();
        const styleDelay = `animation-delay: ${index * 0.1}s`;
        const alignStyle = viewMode === 'simple' ? 'text-align: left; padding-left: 10px;' : 'text-align: center;';
        const volumeLabel = viewMode !== 'simple' ? '<br><span style="font-size:0.75em; font-weight:normal; opacity:0.8;">(3M 동일/전체)</span>' : '';

        html += `
            <div class="gu-section slide-in-up" style="${styleDelay}">
                <div class="gu-header-card">
                    <h4 class="gu-title">${gu} <span class="badge-count">${guTrades.length}</span></h4>
                </div>
                <div class="table-responsive">
                    <table class="premium-table">
                        <thead>
                            <tr>
                                <th class="th-dong" style="${alignStyle}; ${viewMode === 'simple' ? 'width:15%;' : ''}">동</th>
                                <th class="th-name" style="${alignStyle}; ${viewMode === 'simple' ? 'width:55%;' : ''}">단지명 ${viewMode === 'simple' ? '<span style="font-size:0.8em; opacity:0.7">(전용/층)</span>' : ''}</th>
                                ${viewMode !== 'simple' ? `<th class="th-area" style="${alignStyle}">전용<br><span style="font-size:0.8em; opacity:0.7">층</span></th>` : ''}
                                <th class="th-price" style="${alignStyle}; ${viewMode === 'simple' ? 'width:30%;' : ''}">거래금액 ${viewMode !== 'simple' ? '<span style="font-size:0.85em; opacity:0.8; font-weight:normal;">(신고가)</span>' : ''}<br><span style="font-size:0.8em; opacity:0.7">계약일</span>${volumeLabel}</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        const renderRows = (list) => {
            const currentYear = new Date().getFullYear();
            let rowHtml = '';

            list.forEach(trade => {
                const name = trade.apt_name || '-';
                const dong = trade.dong || '-';

                let area = trade.area || 0;
                area = parseFloat(area).toFixed(2);
                const floor = trade.floor || '-';

                let nameHtml = '';
                if (viewMode === 'simple') {
                    // 한 줄 텍스트로 결합 (단지명 전용 층)
                    nameHtml = `<div class="apt-name-text" style="font-size:0.9em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name} <span style="font-size:0.85em; color:var(--text-secondary); margin-left:2px; font-weight:normal;">${area}㎡(${floor}층)</span></div>`;
                } else {
                    nameHtml = `<div class="apt-name-text">${name}</div>`;
                    if (trade.construction_year) {
                        const buildYear = parseInt(trade.construction_year);
                        if (!isNaN(buildYear)) {
                            const age = currentYear - buildYear;
                            const ageText = age <= 0 ? '신축' : `${age}년차`;
                            nameHtml += `<div class="construction-info">${buildYear} <span class="age-badge">(${ageText})</span></div>`;
                        }
                    }
                }

                let contractDate = trade.contract_date || '-';
                if (contractDate.length > 10) contractDate = contractDate.substring(0, 10);
                if (contractDate.includes('-')) {
                    const parts = contractDate.split('-');
                    if (parts.length >= 3) contractDate = `${parts[1]}-${parts[2]}`;
                }

                const isNewHigh = trade.isNewHigh;
                const isCancelled = !!trade.cancelDate;
                const priceVal = trade.price || 0;
                const priceText = formatPrice(priceVal);

                let rowClass = 'trade-row';
                if (viewMode === 'simple') rowClass += ' simple-mode';
                if (isCancelled) rowClass += ' cancelled';
                else if (isNewHigh) rowClass += ' new-high';

                let priceHtmlForSimple = '';
                let priceHtml = '';
                if (isCancelled) {
                    priceHtmlForSimple = `<span class="price-text cancelled" style="font-size:0.85em;">${priceText} <span class="cancel-badge">취소</span></span>`;
                    priceHtml = `<span class="price-text cancelled">${priceText} <span class="cancel-badge">취소</span></span>`;
                } else if (isNewHigh) {
                    priceHtmlForSimple = `<span class="price-text new-high" style="font-size:0.85em;">🔥 ${priceText}</span>`;
                    priceHtml = `<span class="price-text new-high">🔥 ${priceText}</span>`;
                } else {
                    priceHtmlForSimple = `<span class="price-text" style="font-size:0.85em;">${priceText}</span>`;
                    priceHtml = `<span class="price-text">${priceText}</span>`;
                }

                if (!isCancelled && trade.previousHigh > 0 && viewMode !== 'simple') {
                    const prevHighText = formatPrice(trade.previousHigh);
                    priceHtml += `<span class="prev-high-wrapper" style="font-size:0.85em; color:var(--text-secondary, #64748b); font-weight:normal; margin-left:4px;">(${prevHighText})</span>`;
                }

                // 일반형, 자세히 모드에서 보이는 날짜/거래량
                let dateHtml = `<div class="date-wrapper">`;
                dateHtml += `${contractDate}`;
                if (viewMode !== 'simple') {
                    dateHtml += ` <span style="font-size:0.85em; color:var(--text-secondary); margin-left:4px;">(${trade.recentVolumeSame}건/${trade.recentVolumeAll}건)</span>`;
                }
                dateHtml += `</div>`;

                // 자세히 모드일 때만 그래프 렌더링
                let graphHtml = '';
                if (viewMode === 'detailed' && trade.recentHistory && trade.recentHistory.length > 1) {
                    graphHtml = generateSparkline(trade.recentHistory);
                }

                // simple 모드일 때 텍스트 정렬 적용
                let tdStyleSimple = viewMode === 'simple' ? 'padding:2px 6px; text-align:left; ' : '';
                // td-dong은 기본 padding, td-name도 padding 적용
                let flexStyleSimple = viewMode === 'simple' ? 'display:flex; justify-content:flex-start; align-items:center; gap:6px;' : '';

                rowHtml += `
                    <tr class="${rowClass}" style="${viewMode === 'simple' ? 'height:30px;' : ''}">
                        <td class="${viewMode === 'simple' ? 'td-dong' : 'td-center td-dong'}" style="${tdStyleSimple} ${viewMode === 'simple' ? 'font-size:0.85em; padding-left:10px;' : ''}">${dong}</td>
                        <td class="${viewMode === 'simple' ? 'td-name' : 'td-center td-name'}" style="${tdStyleSimple}">${nameHtml}</td>
                        ${viewMode !== 'simple' ? `
                        <td class="td-center">
                            <div class="cell-primary">${area}㎡</div><div class="cell-secondary">${floor}층</div>
                        </td>` : ''}
                        <td class="${viewMode === 'simple' ? '' : 'td-center'}" style="${tdStyleSimple}">
                            ${viewMode === 'simple'
                        ? `<div style="${flexStyleSimple}">
                                     ${priceHtmlForSimple}
                                     <span style="font-size:0.7em; color:var(--text-secondary);">${contractDate}</span>
                                   </div>`
                        : `<div class="price-wrapper center-flex">${priceHtml}</div>
                                   ${dateHtml}
                                   ${graphHtml}`}
                        </td>
                    </tr>
                `;
            });
            return rowHtml;
        };

        if (aptTrades.length > 0) {
            html += `
                <tr class="category-row">
                    <td colspan="${viewMode === 'simple' ? 3 : 4}" style="padding: 0;">
                        <div class="category-header apt-header">
                            <span class="material-icons-round">apartment</span> 아파트
                        </div>
                    </td>
                </tr>
            `;
            html += renderRows(aptTrades);
        }

        if (presaleTrades.length > 0) {
            html += `
                <tr class="category-row">
                    <td colspan="${viewMode === 'simple' ? 3 : 4}" style="padding: 0;">
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
function formatPrice(price) {
    if (!price) return '-';

    let numPrice = price;
    if (typeof price === 'string') {
        if (price.includes('억') || price.includes('만')) return price;
        numPrice = parseInt(price.replace(/[^0-9]/g, ''));
    }

    if (isNaN(numPrice)) return price;

    if (numPrice >= 100000000) {
        return (numPrice / 100000000).toFixed(2) + '억';
    }

    if (numPrice >= 10000) {
        return Math.round(numPrice / 10000).toLocaleString() + '만';
    }

    return numPrice.toLocaleString();
}

// 스파크라인 SVG 생성 유틸
function generateSparkline(historyPrices) {
    if (!historyPrices || historyPrices.length < 2) return '';

    // 이력이 2개 이상일 때만 그림
    const width = 80;
    const height = 24;
    const minVal = Math.min(...historyPrices);
    const maxVal = Math.max(...historyPrices);
    const range = maxVal - minVal || 1;

    // 끝부분 마진
    const padX = 4;
    const padY = 4;

    const stepX = (width - padX * 2) / (historyPrices.length - 1);

    let points = [];
    historyPrices.forEach((val, i) => {
        const x = padX + i * stepX;
        // SVG 기준 Y=0이 맨 위
        const y = padY + (height - padY * 2) - ((val - minVal) / range) * (height - padY * 2);
        points.push(`${x},${y}`);
    });

    // 선 경로
    const pathData = `M ${points.join(' L ')}`;

    // 점 생성 (시작점 파란색, 마지막점 빨간색, 중간점 회색?)
    let circles = '';
    historyPrices.forEach((val, i) => {
        const [xStr, yStr] = points[i].split(',');
        const isFirst = (i === 0);
        const isLast = (i === historyPrices.length - 1);
        const color = isLast ? '#ef4444' : (isFirst ? '#3b82f6' : '#94a3b8');
        const radius = isLast ? 2.5 : 1.5;
        circles += `<circle cx="${xStr}" cy="${yStr}" r="${radius}" fill="${color}" />`;
    });

    return `
        <div style="margin-top:4px; display:flex; justify-content:center;">
            <svg width="${width}" height="${height}" style="overflow:visible;">
                <path d="${pathData}" fill="none" stroke="#cbd5e1" stroke-width="1.5" />
                ${circles}
            </svg>
        </div>
    `;
}
