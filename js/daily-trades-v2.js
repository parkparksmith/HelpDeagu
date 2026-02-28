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

let activeViewMode = 'detailed';

// 뷰 모드 가져오기
function currentViewMode() {
    return activeViewMode;
}

function setViewMode(mode) {
    activeViewMode = mode;

    // 스타일 업데이트: active 클래스 토글
    document.querySelectorAll('.icon-toggle-btn').forEach(btn => {
        if (btn.dataset.mode === mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

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
let currentSummaryFilter = 'all'; // 'all', 'apt', 'presale', 'newhigh'

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

        // 35일 이전 날짜 계산 (python의 min_contract_date 로직 복원 - DB 풀스캔 방지용)
        const targetDateObj = new Date(tradeDateStr);
        const minContractDate = new Date(targetDateObj);
        minContractDate.setDate(minContractDate.getDate() - 40); // 여유있게 40일
        const minContractStr = minContractDate.toISOString().split('T')[0];

        // 아파트 쿼리 만들기
        let aptQuery = supabaseClient
            .from('apt_trades')
            .select('city, dong, apt_name, area, contractdate, amount, floor, buyer_type, transaction_type, newhigh, write_date, construction_year');

        let presaleQuery = supabaseClient
            .from('presale_trades')
            .select('city, dong, apt_name, area, contractdate, amount, floor, buyer_type, transaction_type, newhigh, write_date, presale_type');

        if (dateType === 'write_date') {
            // 등록일 기준: write_date 조건과 함께 DB 스캔을 줄이기 위해 계약일 범위도 추가
            aptQuery = aptQuery
                .gte('write_date', tradeDateStr + ' 00:00:00')
                .lte('write_date', tradeDateStr + ' 23:59:59')
                .gte('contractdate', minContractStr);

            presaleQuery = presaleQuery
                .gte('write_date', tradeDateStr + ' 00:00:00')
                .lte('write_date', tradeDateStr + ' 23:59:59')
                .gte('contractdate', minContractStr);
        } else {
            // 계약일 기준: 문자열 매칭
            aptQuery = aptQuery.eq('contractdate', tradeDateStr);
            presaleQuery = presaleQuery.eq('contractdate', tradeDateStr);
        }

        // 공통 조건 추가 후 실행
        const [aptRes, presaleRes] = await Promise.all([
            aptQuery.is('termination_date', null).order('amount', { ascending: false }).limit(2000),
            presaleQuery.is('termination_date', null).order('amount', { ascending: false }).limit(2000)
        ]);

        if (aptRes.error) throw aptRes.error;
        if (presaleRes.error) throw presaleRes.error;

        if (aptRes.data) aptTrades = aptRes.data.map(item => ({ ...item, isPresale: false }));
        if (presaleRes.data) presaleTrades = presaleRes.data.map(item => ({ ...item, isPresale: true }));

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
        let aptInfoList = [];

        try {
            const chunkSize = 20;
            const pastPromises = [];

            for (let i = 0; i < aptNamesList.length; i += chunkSize) {
                const chunk = aptNamesList.slice(i, i + chunkSize);

                // 아파트 과거 거래 프로미스
                pastPromises.push(
                    supabaseClient
                        .from('apt_trades')
                        .select('apt_name, area, contractdate, amount')
                        .in('apt_name', chunk)
                        .gte('contractdate', threeYearsAgoStr)
                        .lte('contractdate', tradeDateStr)
                        .is('termination_date', null)
                        .order('contractdate', { ascending: false })
                        .limit(2000)
                );

                // 분양권 과거 거래 프로미스
                pastPromises.push(
                    supabaseClient
                        .from('presale_trades')
                        .select('apt_name, area, contractdate, amount')
                        .in('apt_name', chunk)
                        .gte('contractdate', threeYearsAgoStr)
                        .lte('contractdate', tradeDateStr)
                        .is('termination_date', null)
                        .order('contractdate', { ascending: false })
                        .limit(2000)
                );
                // aptinfo 테이블에서 해당 단지의 최고가(high_price) 정보 가져오기용 프로미스
                pastPromises.push(
                    supabaseClient
                        .from('aptinfo')
                        .select('apt_name, area, high_price, household_count')
                        .in('apt_name', chunk)
                        .limit(2000)
                );
            }

            // 병렬로 모두 실행하여 쿼리 타임아웃/병목 해소
            const results = await Promise.allSettled(pastPromises);
            results.forEach((res, index) => {
                if (res.status === 'fulfilled' && res.value.data) {
                    // pastPromises의 인덱스 중 3의 배수+2(즉 2, 5, 8...)가 aptinfo임
                    if (index % 3 === 2) {
                        aptInfoList.push(...res.value.data);
                    } else {
                        pastTrades.push(...res.value.data);
                    }
                }
            });

        } catch (e) {
            console.error("과거 데이터 로딩 실패:", e);
        }

        const tradeDateStrForFilter = document.getElementById('trade-date').value;
        const qDateFiltered3M = new Date(tradeDateStrForFilter);
        qDateFiltered3M.setMonth(qDateFiltered3M.getMonth() - 3);
        const limitStr3M = qDateFiltered3M.toISOString().split('T')[0];

        // v1 구조로 데이터 정제
        allTrades = rawTrades.map(t => {
            const regex = /(대구광역시|대구\S*)\s*(\S+구|\S+군)/;
            const match = (t.city || '').match(regex);

            const cityParts = (t.city || '').trim().split(/\s+/);
            const adminDong = cityParts.length >= 3 ? cityParts.slice(2).join(' ') : (t.dong || '-');

            const tDate = (t.contractdate || '').substring(0, 10);
            let limitStr3M = '1900-01-01';
            if (tDate.length >= 10) {
                const tObj = new Date(tDate);
                tObj.setMonth(tObj.getMonth() - 3);
                limitStr3M = tObj.toISOString().split('T')[0];
            }

            // 개별 거래건의 계약일(tDate)을 기준으로 3개월 전 ~ 계약일까지를 카운트
            const past3MAll = pastTrades.filter(pt => {
                const ptDate = (pt.contractdate || '').substring(0, 10);
                return pt.apt_name === t.apt_name &&
                    ptDate >= limitStr3M &&
                    ptDate <= tDate;
            });

            // 3개월 이내 같은 타입(면적) 거래
            const past3MSame = past3MAll.filter(pt =>
                Math.abs(parseFloat(pt.area || 0) - parseFloat(t.area || 0)) < 1.0
            );

            // 3년 이내 같은 타입 거래 (풀 이력, 모달/그래프용, 계약일 이전(포함) 이력)
            const past3YSame = pastTrades.filter(pt => {
                const ptDate = (pt.contractdate || '').substring(0, 10);
                return pt.apt_name === t.apt_name &&
                    Math.abs(parseFloat(pt.area || 0) - parseFloat(t.area || 0)) < 1.0 &&
                    ptDate <= tDate;
            }).sort((a, b) => (a.contractdate || '').localeCompare(b.contractdate || ''));

            let currentPriceNum = t.amount;
            if (typeof currentPriceNum === 'string') {
                currentPriceNum = parseInt(currentPriceNum.replace(/[^0-9]/g, ''));
            }
            if (isNaN(currentPriceNum)) currentPriceNum = 0;

            // 이전 최고가는 '현재 거래의 계약일보다 이전(미만)'인 거래들 중에서 찾음
            const pastBeforeContractAllTime = past3YSame.filter(pt => {
                const ptDate = (pt.contractdate || '').substring(0, 10);
                return ptDate < tDate;
            });
            const pastBeforeContract3M = pastBeforeContractAllTime.filter(pt => {
                const ptDate = (pt.contractdate || '').substring(0, 10);
                return ptDate >= limitStr3M;
            });

            let highestPrice3M = 0;
            if (pastBeforeContract3M.length > 0) {
                const prices = pastBeforeContract3M.map(pt => {
                    let val = pt.amount;
                    if (typeof val === 'string') val = parseInt(val.replace(/[^0-9]/g, ''));
                    return isNaN(val) ? 0 : val;
                });
                highestPrice3M = Math.max(...prices);
            }

            let highestPriceAllTime = 0;
            if (pastBeforeContractAllTime.length > 0) {
                const prices = pastBeforeContractAllTime.map(pt => {
                    let val = pt.amount;
                    if (typeof val === 'string') val = parseInt(val.replace(/[^0-9]/g, ''));
                    return isNaN(val) ? 0 : val;
                });
                highestPriceAllTime = Math.max(...prices);
            }

            // aptinfo에서 high_price 및 household_count 반영
            const matchedAptInfo = aptInfoList.filter(info =>
                info.apt_name === t.apt_name &&
                Math.abs(parseFloat(info.area || 0) - parseFloat(t.area || 0)) < 1.0
            );

            let household_count = 0;
            if (matchedAptInfo.length > 0) {
                const infoMax = Math.max(...matchedAptInfo.map(i => i.high_price || 0));
                if (infoMax > highestPriceAllTime) {
                    highestPriceAllTime = infoMax;
                }
                const counts = matchedAptInfo.map(i => i.household_count || 0).filter(c => c > 0);
                if (counts.length > 0) household_count = Math.max(...counts);
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
                household_count: household_count,
                cancelDate: t.termination_date,
                isNewHigh: t.newhigh === true || t.newhigh === 1,
                previousHigh: highestPrice3M, // 기본 호환용
                highestPrice3M: highestPrice3M,
                highestPriceAllTime: highestPriceAllTime,
                recentVolumeAll: past3MAll.length,
                recentVolumeSame: past3MSame.length,
                recentHistory: past3YSame.map(pt => pt.amount),
                recentHistoryFull: past3YSame.map(pt => ({ date: pt.contractdate, amount: pt.amount }))
            };
        });

        filteredTrades = [...allTrades];

        // UI 렌더링
        updateSummary(allTrades);
        populateDistrictFilter(allTrades);
        filterBySummary('all');

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

function filterBySummary(type) {
    currentSummaryFilter = type;

    // UI 업데이트: 선택된 카드 강조
    const cards = document.querySelectorAll('.summary-card');
    cards.forEach(card => {
        card.style.border = '1px solid var(--border)';
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = '0 4px 6px -1px var(--shadow)';
    });

    // 선택된 카드 찾기
    const indexMap = { 'all': 0, 'apt': 1, 'presale': 2, 'newhigh': 3 };
    if (cards[indexMap[type]]) {
        cards[indexMap[type]].style.border = '2px solid var(--primary)';
        cards[indexMap[type]].style.transform = 'translateY(-4px)';
        cards[indexMap[type]].style.boxShadow = '0 10px 15px -3px var(--shadow)';
    }

    filterTrades();
}

function filterTrades() {
    const districtFilter = document.getElementById('filter-district').value;

    filteredTrades = allTrades.filter(trade => {
        const district = trade.gu || '기타';
        const districtMatch = districtFilter === 'all' || district === districtFilter;

        let summaryMatch = true;
        if (currentSummaryFilter === 'apt') summaryMatch = trade.type === 'apt';
        else if (currentSummaryFilter === 'presale') summaryMatch = trade.type === 'presale';
        else if (currentSummaryFilter === 'newhigh') summaryMatch = trade.isNewHigh;

        return districtMatch && summaryMatch;
    });

    renderTradesByGu(filteredTrades);
}

function updateSummary(trades) {
    const totalCount = trades.length;
    const aptCount = trades.filter(t => t.type === 'apt').length;
    const presaleCount = trades.filter(t => t.type === 'presale').length;

    const newHighCount = trades.filter(t => t.isNewHigh).length;

    document.getElementById('summary-count').textContent = totalCount.toLocaleString() + '건';
    document.getElementById('summary-apt').textContent = aptCount.toLocaleString() + '건';
    document.getElementById('summary-presale').textContent = presaleCount.toLocaleString() + '건';
    document.getElementById('summary-newhigh').textContent = newHighCount.toLocaleString() + '건';
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

                // 전체 인덱스 찾기
                const gIndex = allTrades.indexOf(trade);
                const isDetailedMenu = viewMode === 'detailed';
                let doubleClickAction = '';

                // 모달 팝업 액션을 전역(모든 모드)으로 확대
                doubleClickAction = `onclick="showDetailModal(${gIndex})"`;

                rowHtml += `
                    <tr class="${rowClass}" style="cursor:pointer; ${viewMode === 'simple' ? 'height:30px;' : ''}" ${doubleClickAction}>
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

let currentModalTradeHistory = [];
let currentModalTrade = null;
let currentModalActivePeriod = 'all';
let modalChartInstance = null;

// 모달 표시 함수
async function showDetailModal(globalIndex) {
    const trade = allTrades[globalIndex];
    if (!trade) return;

    currentModalTrade = trade;

    // 모달 DOM 가져오기
    const modal = document.getElementById('trade-detail-modal');
    if (!modal) return;

    // 상세 내용 채우기
    document.getElementById('modal-apt-name').textContent = trade.apt_name + ` (${trade.area}㎡ / ${trade.floor}층)`;

    // 동 이름 옆에 준공년도, 세대수 추가
    let subInfoArr = [trade.dong];
    if (trade.construction_year) subInfoArr.push(`${trade.construction_year}년`);
    if (trade.household_count) subInfoArr.push(`${trade.household_count}세대`);

    document.getElementById('modal-dong').innerHTML = subInfoArr.join('<span style="margin:0 8px; color:var(--border);">|</span>');
    document.getElementById('modal-price').innerHTML = trade.isNewHigh ? `🔥 ${formatPrice(trade.price)} <span style="font-size:0.6em; color:#fff; background:#ff5252; padding:2px 6px; border-radius:4px; vertical-align:middle; margin-left:4px;">신고가</span>` : formatPrice(trade.price);

    // 모달 인포를 작게 한 줄(또는 유연한 두 줄)로 표시
    let infoHtml = `
        <div style="font-size: 0.85em; display: flex; flex-wrap: wrap; gap: 15px; justify-content: flex-start; align-items: center; color: var(--text-secondary); background: rgba(0,0,0,0.15); padding: 10px 15px; border-radius: 8px; border: 1px solid var(--border);">
            <div><span style="color:var(--text-muted); margin-right:4px;">계약일</span><span style="color:var(--text-primary); font-weight:500;">${trade.contract_date || '-'}</span></div>
            <div><span style="color:var(--text-muted); margin-right:4px;">역대최고</span><span style="color:#ef4444; font-weight:bold;">${trade.highestPriceAllTime ? formatPrice(trade.highestPriceAllTime) : '-'}</span></div>
            <div><span style="color:var(--text-muted); margin-right:4px;">3개월최고</span><span style="color:#ef4444; font-weight:bold;">${trade.highestPrice3M ? formatPrice(trade.highestPrice3M) : '-'}</span></div>
            <div><span style="color:var(--text-muted); margin-right:4px;">최근3개월 동일거래</span><span style="color:var(--text-primary); font-weight:500;">${trade.recentVolumeSame}건</span></div>
        </div>
    `;

    document.getElementById('modal-info').innerHTML = infoHtml;

    document.getElementById('modal-loading').style.display = 'block';
    document.getElementById('modal-content-area').style.display = 'none';
    modal.classList.add('active');

    // 비동기 전체 내역 로딩
    const tableName = trade.type === 'apt' ? 'apt_trades' : 'presale_trades';
    const areaFloat = parseFloat(trade.area || 0);
    const { data, error } = await supabaseClient
        .from(tableName)
        .select('contractdate, amount, floor, newhigh, termination_date')
        .eq('apt_name', trade.apt_name)
        .gte('area', areaFloat - 1.0)
        .lte('area', areaFloat + 1.0)
        .order('contractdate', { ascending: true })
        .limit(5000);

    if (error) {
        console.error("모달 데이터 로딩 실패:", error);
        currentModalTradeHistory = [];
    } else {
        currentModalTradeHistory = data || [];
    }

    document.getElementById('modal-loading').style.display = 'none';
    document.getElementById('modal-content-area').style.display = 'block';

    renderModalTabs();
}

function renderModalTabs() {
    if (currentModalTradeHistory.length === 0) {
        document.getElementById('modal-period-tabs').innerHTML = '';
        selectModalPeriod('all');
        return;
    }

    // 가장 오래된 날짜 찾기
    const oldestDateStr = currentModalTradeHistory[0].contractdate || '';
    const today = new Date();
    let oldestDate = new Date(oldestDateStr);
    if (isNaN(oldestDate)) oldestDate = today;

    // 햇수 차이 계산
    const diffYears = (today - oldestDate) / (1000 * 60 * 60 * 24 * 365.25);

    let tabsHtml = '';
    let tabs = [];
    if (diffYears >= 3) {
        tabs = [{ label: '3년', val: '3y' }, { label: '전체', val: 'all' }];
    } else {
        tabs = [{ label: '6개월', val: '6m' }, { label: '1년', val: '1y' }, { label: '전체', val: 'all' }];
    }

    tabs.forEach((tab, index) => {
        tabsHtml += `<button class="icon-toggle-btn ${index === 0 ? 'active' : ''}" data-val="${tab.val}" onclick="selectModalPeriod('${tab.val}')" style="font-size:0.8rem; padding:4px 10px;">${tab.label}</button>`;
    });

    document.getElementById('modal-period-tabs').innerHTML = tabsHtml;
    selectModalPeriod(tabs[0].val);
}

function selectModalPeriod(period) {
    currentModalActivePeriod = period;

    // 탭 UI 업데이트
    const buttons = document.querySelectorAll('#modal-period-tabs button');
    buttons.forEach(btn => {
        if (btn.dataset.val === period) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // 필터 기준 날짜 구하기
    const targetDate = new Date();
    if (period === '3y') targetDate.setFullYear(targetDate.getFullYear() - 3);
    else if (period === '1y') targetDate.setFullYear(targetDate.getFullYear() - 1);
    else if (period === '6m') targetDate.setMonth(targetDate.getMonth() - 6);
    else targetDate.setFullYear(1900); // 'all'

    const targetDateStr = targetDate.toISOString().split('T')[0];

    // 선택 기간에 맞춰 기록 필터링 (오름차순 유지)
    const filteredHistory = currentModalTradeHistory.filter(t => {
        const d = (t.contractdate || '').substring(0, 10);
        return d >= targetDateStr;
    });

    const chartContainer = document.getElementById('modal-chart');
    if (filteredHistory.length > 0) {
        chartContainer.innerHTML = `
            <div id="chart-growth-info" style="min-height:20px; text-align:right; font-size:0.85em; margin-bottom:4px; font-weight:bold; color:var(--text-secondary);">
                <!-- 범위 선택 시 상승률 표시 -->
            </div>
            <div class="modal-chart-wrapper" style="position: relative; width: 100%; user-select: none; height: 250px;">
                <canvas id="detail-chart-canvas"></canvas>
            </div>
            <div style="text-align:right; font-size:0.75em; color:var(--text-muted); margin-top:4px;">
                👆 차트 위를 <b>드래그(영역 선택)</b>하면 선택한 기간의 상승률을 볼 수 있습니다. (빈 공간 클릭 시 해제)
            </div>
        `;
        renderModalChartJS(filteredHistory);
    } else {
        if (modalChartInstance) {
            modalChartInstance.destroy();
            modalChartInstance = null;
        }
        chartContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">조건에 맞는 거래 기록이 충분하지 않습니다.</div>';
    }

    // 목록 그리기 (최신순이므로 역순 정렬)
    let listHtml = '';
    const reversedHistory = [...filteredHistory].reverse();

    // 기간 내 유효 거래 중 최고가/최저가 계산
    const validTrades = filteredHistory.filter(t => !t.termination_date);
    let maxPrice = -1;
    let minPrice = Infinity;

    validTrades.forEach(t => {
        let p = t.amount;
        if (typeof p === 'string') p = parseInt(p.replace(/[^0-9]/g, ''));
        if (!isNaN(p)) {
            if (p > maxPrice) maxPrice = p;
            if (p < minPrice) minPrice = p;
        }
    });

    if (maxPrice === -1) maxPrice = null;
    if (minPrice === Infinity) minPrice = null;

    reversedHistory.forEach(t => {
        const isCancelled = !!t.termination_date;
        const isNewHigh = (t.newhigh === true || t.newhigh === 1 || t.newhigh === '1');
        const priceText = formatPrice(t.amount);
        const cDate = (t.contractdate || '').substring(0, 10);
        const floor = t.floor || '-';

        let pVal = t.amount;
        if (typeof pVal === 'string') pVal = parseInt(pVal.replace(/[^0-9]/g, ''));

        let displayPrice = priceText;

        if (isCancelled) {
            displayPrice = `<span style="text-decoration: line-through; color: var(--text-muted);">${priceText}</span> <span class="cancel-badge" style="font-size:0.7em;">취소</span>`;
        } else {
            let tags = '';

            if (isNewHigh) {
                tags += `<span style="font-size:0.65em; color:#fff; background:#ff5252; padding:2px 4px; border-radius:4px; margin-left:4px;">신고가</span>`;
            }

            // 기간 내 최고가/최저가 태그
            // (신고가와 기간내 최고가가 겹칠 수 있으나 태그 모두 표시)
            if (maxPrice && pVal === maxPrice) {
                tags += `<span style="font-size:0.65em; color:#ef4444; border: 1px solid #ef4444; padding:1px 4px; border-radius:4px; margin-left:4px;">최고가</span>`;
            }
            // 거래내역 하나뿐이거나 같은 가격이면 최저가는 표시 생략
            if (minPrice && pVal === minPrice && minPrice !== maxPrice) {
                tags += `<span style="font-size:0.65em; color:#3b82f6; border: 1px solid #3b82f6; padding:1px 4px; border-radius:4px; margin-left:4px;">최저가</span>`;
            }

            let priceDisplayHtml = priceText;
            if (isNewHigh) {
                priceDisplayHtml = `🔥 ${priceText}`;
            }

            if (isNewHigh || pVal === maxPrice) {
                displayPrice = `<span style="color: #ff5252; font-weight: bold;">${priceDisplayHtml}</span>${tags}`;
            } else if (pVal === minPrice && minPrice !== maxPrice) {
                displayPrice = `<span style="color: #3b82f6; font-weight: bold;">${priceDisplayHtml}</span>${tags}`;
            } else {
                displayPrice = `<span>${priceDisplayHtml}</span>${tags}`;
            }
        }

        listHtml += `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px; color: var(--text-secondary);">${cDate}</td>
                <td style="padding: 10px;">${displayPrice}</td>
                <td style="padding: 10px; color: var(--text-secondary);">${floor}층</td>
            </tr>
        `;
    });

    if (reversedHistory.length === 0) {
        listHtml = '<tr><td colspan="3" style="padding: 20px; color: var(--text-muted);">거래 내역이 없습니다.</td></tr>';
    }
    document.getElementById('modal-trade-list').innerHTML = listHtml;
}

function closeDetailModal() {
    const modal = document.getElementById('trade-detail-modal');
    if (modal) modal.classList.remove('active');
}

// 모달 바깥쪽 클릭 시 닫기
window.addEventListener('click', function (event) {
    const modal = document.getElementById('trade-detail-modal');
    if (event.target === modal) {
        closeDetailModal();
    }
});

function renderModalChartJS(history) {
    const ctx = document.getElementById('detail-chart-canvas').getContext('2d');

    if (modalChartInstance) {
        modalChartInstance.destroy();
    }

    const scatterData = [];
    const monthlyGroups = {};

    history.forEach(t => {
        if (!t.contractdate) return;
        const amount = typeof t.amount === 'string' ? parseInt(t.amount.replace(/[^0-9]/g, '')) : t.amount;
        if (isNaN(amount) || amount === 0) return;

        const dateStr = t.contractdate.replace(/\./g, '-').substring(0, 10);
        const isNewHigh = (t.newhigh === true || t.newhigh === 1 || t.newhigh === '1');
        scatterData.push({ x: dateStr, y: amount, isNewHigh: isNewHigh, original: t });

        const monthKey = dateStr.substring(0, 7) + '-01';
        if (!monthlyGroups[monthKey]) {
            monthlyGroups[monthKey] = { sum: 0, count: 0 };
        }
        monthlyGroups[monthKey].sum += amount;
        monthlyGroups[monthKey].count += 1;
    });

    const months = Object.keys(monthlyGroups).sort();
    const lineData = months.map(m => ({ x: m, y: monthlyGroups[m].sum / monthlyGroups[m].count }));
    const barData = months.map(m => ({ x: m, y: monthlyGroups[m].count }));

    modalChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    type: 'bar',
                    label: '거래량',
                    data: barData,
                    backgroundColor: 'rgba(255, 255, 255, 0.12)',
                    yAxisID: 'y1',
                    barThickness: 'flex',
                    maxBarThickness: 15,
                    order: 3 // 가장 뒤에 (바닥) 그려짐
                },
                {
                    type: 'scatter',
                    label: '실거래',
                    data: scatterData,
                    backgroundColor: function (ctx) {
                        return ctx.raw && ctx.raw.isNewHigh ? '#ef4444' : 'rgba(255, 255, 255, 0.25)';
                    },
                    borderColor: function (ctx) {
                        return ctx.raw && ctx.raw.isNewHigh ? '#ef4444' : 'rgba(255, 255, 255, 0.4)';
                    },
                    pointRadius: 3,
                    yAxisID: 'y',
                    order: 2 // 선보다 뒤에, 바보다 앞에
                },
                {
                    type: 'line',
                    label: '월평균',
                    data: lineData,
                    borderColor: '#fbbf24', // 고급스러운 금색 (amber-400)
                    backgroundColor: 'rgba(251, 191, 36, 0.15)', // 금색 그라데이션 베이스
                    borderWidth: 2,
                    tension: 0, // 꺾은선 형태
                    stepped: false,
                    pointRadius: 0, // 선에 점 표시 안함
                    pointHoverRadius: 0,
                    yAxisID: 'y',
                    order: 1 // 가장 위쪽(앞쪽)에 그려짐
                }
            ]
        },
        options: {
            events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'mousedown', 'mouseup'],
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: false // 범례 숨김
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            if (context.dataset.type === 'bar') {
                                return `거래량: ${context.parsed.y}건`;
                            }
                            return `${context.dataset.label}: ${formatPrice(context.parsed.y)}`;
                        }
                    }
                },
                dragSelectPlugin: {
                    // Custom plugin logic attached via global or inline
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'month',
                        displayFormats: {
                            month: 'yyyy.MM'
                        },
                        tooltipFormat: 'yyyy.MM'
                    },
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#ffffff', // 뚜렷한 흰색
                        font: { size: 10 }
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: {
                        color: 'rgba(255, 255, 255, 0.08)' // 백그라운드 선도 살짝 밝게
                    },
                    ticks: {
                        color: '#ffffff', // 뚜렷한 흰색
                        font: { size: 11 },
                        callback: function (value) {
                            if (value >= 100000000) {
                                const uk = value / 100000000;
                                return Number.isInteger(uk) ? uk + '억' : uk.toFixed(1) + '억';
                            }
                            return (value / 10000) + '만';
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { display: false },
                    min: 0,
                    // 거래량 바가 위쪽 차트와 겹치지 않게 하기 위해 max를 여유있게 (약 4~5배)
                    suggestedMax: Math.max(...barData.map(d => d.y), 1) * 4,
                    ticks: { display: false }
                }
            }
        },
        plugins: [{
            id: 'dragSelectPlugin',
            beforeEvent(chart, args, options) {
                const event = args.event;
                if (!chart.dragState) {
                    chart.dragState = { isDragging: false, startX: null, currentX: null, completed: false };
                }
                const state = chart.dragState;

                if (event.type === 'mousedown') {
                    // Start drag
                    state.isDragging = true;
                    state.startX = event.x;
                    state.currentX = event.x;
                    state.completed = false;
                } else if (event.type === 'mousemove' && state.isDragging) {
                    // Update drag
                    state.currentX = event.x;
                    args.changed = true; // 강제 재렌더링
                    if (Math.abs(state.currentX - state.startX) > 5) {
                        updateChartSelectionInfo(chart, Math.min(state.startX, state.currentX), Math.max(state.startX, state.currentX));
                    }
                } else if (event.type === 'mouseup' || event.type === 'mouseout') {
                    if (state.isDragging) {
                        state.isDragging = false;
                        args.changed = true;
                        if (Math.abs(state.currentX - state.startX) > 10) {
                            state.completed = true;
                            // Trigger calculation
                            updateChartSelectionInfo(chart, Math.min(state.startX, state.currentX), Math.max(state.startX, state.currentX));
                        } else {
                            // 단순 클릭이면 리셋
                            state.completed = false;
                            state.startX = null;
                            state.currentX = null;
                            updateChartSelectionInfo(chart, null, null);
                        }
                    }
                }
            },
            afterDraw(chart, args, options) {
                const ctx = chart.ctx;
                const chartArea = chart.chartArea;
                const xScale = chart.scales.x;
                const yScale = chart.scales.y;

                // 1. 역대 최고/최저가 텍스트 표시 (전체 데이터 기준)
                const scatterDataset = chart.data.datasets.find(d => d.type === 'scatter');
                if (scatterDataset && scatterDataset.data && scatterDataset.data.length > 0) {
                    let maxPt = scatterDataset.data[0];
                    let minPt = scatterDataset.data[0];
                    scatterDataset.data.forEach(d => {
                        if (d.y > maxPt.y) maxPt = d;
                        if (d.y < minPt.y) minPt = d;
                    });

                    ctx.save();
                    ctx.font = 'bold 11px sans-serif';
                    ctx.textAlign = 'center';

                    // 최고점
                    let maxPxX = xScale.getPixelForValue(new Date(maxPt.x).getTime());
                    let maxPxY = yScale.getPixelForValue(maxPt.y) - 10;
                    if (maxPxY < chartArea.top + 10) maxPxY = chartArea.top + 15; // 짤림 방지
                    ctx.fillStyle = '#ef4444'; // 빨간색
                    ctx.fillText('최고가', maxPxX, maxPxY);

                    // 최저점
                    let minPxX = xScale.getPixelForValue(new Date(minPt.x).getTime());
                    let minPxY = yScale.getPixelForValue(minPt.y) + 15;
                    if (minPxY > chartArea.bottom - 10) minPxY = chartArea.bottom - 10;
                    ctx.fillStyle = '#3b82f6'; // 파란색
                    ctx.fillText('최저가', minPxX, minPxY);

                    ctx.restore();
                }

                // 2. 드래그 오버레이 및 선택된 양 끝 점(실선 기준) 표시
                const state = chart.dragState;
                if (!state || (!state.isDragging && !state.completed) || state.startX === null || state.currentX === null) return;

                const xStart = Math.max(chartArea.left, Math.min(state.startX, state.currentX));
                const xEnd = Math.min(chartArea.right, Math.max(state.startX, state.currentX));
                const width = xEnd - xStart;

                if (width <= 0) return;

                ctx.save();
                ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; // 파란색 반투명 선택영역
                ctx.fillRect(xStart, chartArea.top, width, chartArea.bottom - chartArea.top);
                ctx.restore();

                // 선택 기간 양 끝점에 뚜렷한 마커 그리기 (실선 위)
                const minTime = xScale.getValueForPixel(xStart);
                const maxTime = xScale.getValueForPixel(xEnd);
                const lineDataset = chart.data.datasets.find(d => d.type === 'line');

                if (scatterDataset && scatterDataset.data && lineDataset && lineDataset.data) {
                    let visibleTrades = scatterDataset.data.filter(d => {
                        const tTime = new Date(d.x).getTime();
                        return tTime >= minTime && tTime <= maxTime;
                    });

                    if (visibleTrades.length >= 2) {
                        visibleTrades.sort((a, b) => new Date(a.x) - new Date(b.x));
                        const startX = new Date(visibleTrades[0].x).getTime();
                        const endX = new Date(visibleTrades[visibleTrades.length - 1].x).getTime();

                        // 실선(월평균선) 위에서 가장 가까운 포인트 찾기
                        const findLinePt = (targetX) => {
                            let nearest = lineDataset.data[0];
                            let minDist = Infinity;
                            lineDataset.data.forEach(d => {
                                const dx = new Date(d.x).getTime();
                                const dist = Math.abs(dx - targetX);
                                if (dist < minDist) { minDist = dist; nearest = d; }
                            });
                            return nearest;
                        };

                        const ptStart = findLinePt(startX);
                        const ptEnd = findLinePt(endX);

                        const sx = xScale.getPixelForValue(new Date(ptStart.x).getTime());
                        const sy = yScale.getPixelForValue(ptStart.y);
                        const ex = xScale.getPixelForValue(new Date(ptEnd.x).getTime());
                        const ey = yScale.getPixelForValue(ptEnd.y);

                        ctx.save();
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = '#ffffff';

                        // 시작점 원 (파란색)
                        ctx.fillStyle = '#3b82f6';
                        ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();

                        // 끝점 원 (상승 빨강 / 하락 파랑)
                        ctx.fillStyle = (ptEnd.y >= ptStart.y) ? '#ef4444' : '#3b82f6';
                        ctx.beginPath(); ctx.arc(ex, ey, 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
                        ctx.restore();
                    }
                }
            }
        }]
    });
}

function updateChartSelectionInfo(chart, pixMinX, pixMaxX) {
    const infoDiv = document.getElementById('chart-growth-info');

    if (pixMinX === null || pixMaxX === null) {
        if (infoDiv) infoDiv.innerHTML = '';
        const scatterDataset = chart.data.datasets.find(d => d.type === 'scatter');
        if (scatterDataset && scatterDataset.data) {
            renderModalTradeList(scatterDataset.data.map(t => t.original)); // 전체 리셋
        }
        return;
    }

    const xScale = chart.scales.x;
    const minTime = xScale.getValueForPixel(pixMinX);
    const maxTime = xScale.getValueForPixel(pixMaxX);

    // 현재 보이는 범위 내의 실거래 데이타(scatter) 추출
    const scatterDataset = chart.data.datasets.find(d => d.type === 'scatter');
    if (!scatterDataset || !scatterDataset.data) return;

    let visibleTrades = scatterDataset.data.filter(d => {
        const tTime = new Date(d.x).getTime();
        return tTime >= minTime && tTime <= maxTime;
    });

    if (visibleTrades.length < 2) {
        if (infoDiv) infoDiv.innerHTML = '<span style="color:var(--text-muted); font-weight:normal;">선택 구간 내 비교할 거래가 부족합니다.</span>';
        renderModalTradeList(visibleTrades.map(t => t.original));
        return;
    }

    // 날짜 오름차순
    visibleTrades.sort((a, b) => new Date(a.x) - new Date(b.x));

    const startTrade = visibleTrades[0];
    const endTrade = visibleTrades[visibleTrades.length - 1];

    const diffVal = endTrade.y - startTrade.y;
    const pct = startTrade.y !== 0 ? ((endTrade.y - startTrade.y) / startTrade.y) * 100 : 0;

    let color = '#94a3b8';
    let sign = '';
    let icon = '';

    if (diffVal > 0) {
        color = '#ef4444'; // 빨강 (상승)
        sign = '+';
        icon = '▲';
    } else if (diffVal < 0) {
        color = '#3b82f6'; // 파랑 (하락)
        icon = '▼';
    }

    const startYM = startTrade.x.substring(0, 7).replace('-', '.');
    const endYM = endTrade.x.substring(0, 7).replace('-', '.');

    if (infoDiv) {
        infoDiv.innerHTML = `
            선택기간: ${startYM} ~ ${endYM} 
            <span style="color:${color}; margin-left:8px; font-size:1.1em;">
                ${icon} ${formatPrice(Math.abs(diffVal))} (${sign}${pct.toFixed(1)}%)
            </span>
        `;
    }

    renderModalTradeList(visibleTrades.map(t => t.original));
}

function renderModalTradeList(tradeList) {
    const tbody = document.getElementById('modal-trade-list');
    if (!tbody) return;

    let listHtml = '';
    const reversedHistory = [...tradeList].reverse();
    reversedHistory.forEach(t => {
        // t는 x, y를 가지는 scatter 데이터이거나 원본 필터데이터일 수 있음
        const rawDate = t.x ? t.x : (t.contractdate ? t.contractdate.substring(0, 10) : '-');
        const priceVal = t.y ? t.y : t.amount;
        const priceText = formatPrice(priceVal);
        const isCancelled = t.termination_date ? !!t.termination_date : false;
        const isNewHigh = t.isNewHigh !== undefined ? t.isNewHigh : (t.newhigh === true || t.newhigh === 1 || t.newhigh === '1');
        const floor = t.floor || '-';

        // UI에 맞게 표시
        let displayPrice = priceText;
        if (isCancelled) {
            displayPrice = `<span style="text-decoration: line-through; color: var(--text-muted);">${priceText}</span> <span class="cancel-badge" style="font-size:0.7em;">취소</span>`;
        } else if (isNewHigh) {
            displayPrice = `<span style="color: #ff5252; font-weight: bold;">🔥 ${priceText}</span> <span style="font-size:0.65em; color:#fff; background:#ff5252; padding:2px 4px; border-radius:4px;">신고가</span>`;
        }
        listHtml += `
        <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 10px; color: var(--text-secondary);">${rawDate}</td>
            <td style="padding: 10px;">${displayPrice}</td>
            <td style="padding: 10px; color: var(--text-secondary);">${floor}${floor === '-' ? '' : '층'}</td>
        </tr>
        `;
    });

    if (reversedHistory.length === 0) {
        listHtml = '<tr><td colspan="3" style="padding: 20px; color: var(--text-muted);">표시할 거래 내역이 없습니다.</td></tr>';
    }
    tbody.innerHTML = listHtml;
}
