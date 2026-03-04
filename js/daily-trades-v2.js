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

function setViewMode(mode, autoRender = true) {
    activeViewMode = mode;

    // 스타일 업데이트: active 클래스 토글
    document.querySelectorAll('.icon-toggle-btn').forEach(btn => {
        if (btn.dataset.mode) {
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });

    if (autoRender && filteredTrades.length > 0) {
        renderTradesByGu(filteredTrades);
    }
}

let activeDealMode = 'sale'; // 'sale' or 'rent'

function setDealMode(mode, autoRender = true) {
    activeDealMode = mode;
    document.querySelectorAll('.deal-toggle-btn').forEach(btn => {
        if (btn.dataset.deal === mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    if (autoRender) {
        loadDailyTrades();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 세션 스토리지에서 상태 복원 (뒤로가기 시 유지 용도)
    const savedStateStr = sessionStorage.getItem('dailyTradesState');
    if (savedStateStr) {
        try {
            const state = JSON.parse(savedStateStr);
            if (state.dateType) document.getElementById('date-type').value = state.dateType;
            if (state.tradeDate) document.getElementById('trade-date').value = state.tradeDate;
            if (state.viewMode) setViewMode(state.viewMode, false);
            if (state.dealMode) setDealMode(state.dealMode, false);

            if (state.tradeDate) {
                setTimeout(() => {
                    loadDailyTrades();
                }, 100);
            }
        } catch (e) { }
    } else {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        document.getElementById('trade-date').value = dateStr;
    }

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
    const dateType = document.getElementById('date-type').value;

    // 현재 상태 저장
    sessionStorage.setItem('dailyTradesState', JSON.stringify({
        dateType: dateType,
        tradeDate: tradeDateStr,
        viewMode: activeViewMode,
        dealMode: activeDealMode
    }));

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

        // 쿼리 만들기
        let aptQuery, presaleQuery;

        if (activeDealMode === 'sale') {
            aptQuery = supabaseClient
                .from('apt_trades')
                .select('city, dong, apt_name, area, contractdate, amount, floor, buyer_type, transaction_type, newhigh, write_date, construction_year, termination_date');

            presaleQuery = supabaseClient
                .from('presale_trades')
                .select('city, dong, apt_name, area, contractdate, amount, floor, buyer_type, transaction_type, newhigh, write_date, presale_type, termination_date, preaptinfo_rawid');
        } else {
            aptQuery = supabaseClient
                .from('apt_rent_trades')
                .select('city, dong, apt_name, area, contractdate, deposit, monthly_rent, floor, newhigh, write_date, construction_year');
            presaleQuery = null; // 전월세는 분양권 없음
        }

        if (dateType === 'write_date') {
            aptQuery = aptQuery
                .gte('write_date', tradeDateStr + ' 00:00:00')
                .lte('write_date', tradeDateStr + ' 23:59:59')
                .gte('contractdate', minContractStr);

            if (presaleQuery) {
                presaleQuery = presaleQuery
                    .gte('write_date', tradeDateStr + ' 00:00:00')
                    .lte('write_date', tradeDateStr + ' 23:59:59')
                    .gte('contractdate', minContractStr);
            }
        } else {
            aptQuery = aptQuery.eq('contractdate', tradeDateStr);
            if (presaleQuery) presaleQuery = presaleQuery.eq('contractdate', tradeDateStr);
        }

        const promises = [];
        if (activeDealMode === 'sale') {
            promises.push(aptQuery.is('termination_date', null).order('amount', { ascending: false }).limit(2000));
            promises.push(presaleQuery.is('termination_date', null).order('amount', { ascending: false }).limit(2000));
        } else {
            promises.push(aptQuery.order('deposit', { ascending: false }).limit(2000));
        }

        const resArr = await Promise.all(promises);
        const aptRes = resArr[0];
        const presaleRes = resArr.length > 1 ? resArr[1] : null;

        if (aptRes.error) throw aptRes.error;
        if (presaleRes && presaleRes.error) throw presaleRes.error;

        if (aptRes.data) {
            aptTrades = aptRes.data.map(item => {
                let amount = item.amount;
                if (activeDealMode === 'rent') {
                    amount = item.deposit; // 기본 가격 (정렬/차트용)
                }
                return { ...item, isPresale: false, amount: amount };
            });
        }
        if (presaleRes && presaleRes.data) {
            presaleTrades = presaleRes.data.map(item => ({ ...item, isPresale: true }));
        }

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

                if (activeDealMode === 'sale') {
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
                } else {
                    // 전월세 과거 거래 프로미스
                    pastPromises.push(
                        supabaseClient
                            .from('apt_rent_trades')
                            .select('apt_name, area, contractdate, deposit, monthly_rent')
                            .in('apt_name', chunk)
                            .gte('contractdate', threeYearsAgoStr)
                            .lte('contractdate', tradeDateStr)
                            .order('contractdate', { ascending: false })
                            .limit(2000)
                    );
                }
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
            let pDivisor = activeDealMode === 'sale' ? 3 : 2;
            let pInfoIndex = activeDealMode === 'sale' ? 2 : 1;

            results.forEach((res, index) => {
                if (res.status === 'fulfilled' && res.value.data) {
                    let rentFormattedData = res.value.data;
                    // 전월세인 경우 amount를 deposit으로 통일
                    if (activeDealMode === 'rent' && (index % pDivisor) !== pInfoIndex) {
                        rentFormattedData = res.value.data.map(item => ({
                            ...item,
                            amount: item.deposit
                        }));
                    }
                    if (index % pDivisor === pInfoIndex) {
                        aptInfoList.push(...res.value.data);
                    } else {
                        pastTrades.push(...rentFormattedData);
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
            // 월세가 있는 거래는 차트 및 최고가 산정에서 제외
            const past3YSame = pastTrades.filter(pt => {
                const ptDate = (pt.contractdate || '').substring(0, 10);
                const isRentWithMonthly = activeDealMode === 'rent' && (pt.monthly_rent > 0 || pt._monthly_rent > 0);
                return pt.apt_name === t.apt_name &&
                    Math.abs(parseFloat(pt.area || 0) - parseFloat(t.area || 0)) < 1.0 &&
                    ptDate <= tDate && !isRentWithMonthly;
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
                preaptinfo_rawid: t.preaptinfo_rawid,
                gu: match ? match[2] : "기타",
                dong: adminDong,
                apt_name: t.apt_name,
                area: t.area,
                floor: t.floor,
                price: t.amount,
                _deposit: t.deposit || t._deposit,
                _monthly_rent: t.monthly_rent || t._monthly_rent,
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
                recentHistory: past3YSame.map(pt => ({
                    contractdate: pt.contractdate,
                    amount: pt.amount,
                    floor: pt.floor,
                    newhigh: pt.newhigh,
                    termination_date: pt.termination_date,
                    _deposit: pt._deposit || pt.deposit,
                    _monthly_rent: pt._monthly_rent || pt.monthly_rent
                })),
                recentHistoryFull: past3YSame.map(pt => ({
                    date: pt.contractdate,
                    amount: pt.amount,
                    _deposit: pt._deposit || pt.deposit,
                    _monthly_rent: pt._monthly_rent || pt.monthly_rent
                }))
            };
        });

        filteredTrades = [...allTrades];

        // UI 렌더링
        updateSummary(allTrades);
        populateDistrictFilter(allTrades);
        filterBySummary('all');

        document.getElementById('loading').classList.add('hidden');
        document.getElementById('data-summary').classList.remove('hidden');
        document.getElementById('sort-controls').classList.remove('hidden');
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

    let aptLabel = '아파트 거래';
    let presaleLabel = '분양권 거래';
    let newhighLabel = '신고가(아파트/분양권)';

    if (activeDealMode === 'rent') {
        aptLabel = '전월세 거래';
        presaleLabel = '분양권 (제외)';
        newhighLabel = '신고가(전월세)';
    }

    try {
        document.getElementById('summary-apt').previousElementSibling.textContent = aptLabel;
        document.getElementById('summary-presale').previousElementSibling.textContent = presaleLabel;
        document.getElementById('summary-newhigh').previousElementSibling.textContent = newhighLabel;
    } catch (e) { }

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

// 정렬 관련 상태 변수
let currentSortMode = 'price';
let currentSortOrder = 'desc';

function getPriceVal(t) {
    if (activeDealMode === 'rent') {
        let deps = typeof t._deposit === 'string' ? parseInt(t._deposit.replace(/[^0-9]/g, '')) : t._deposit;
        return isNaN(deps) ? 0 : deps;
    }
    let p = typeof t.price === 'string' ? parseInt(t.price.replace(/[^0-9]/g, '')) : t.price;
    return isNaN(p) ? 0 : p;
}

function toggleSort(mode) {
    if (currentSortMode === mode) {
        if (currentSortOrder === 'desc') {
            currentSortOrder = 'asc';
        } else if (currentSortOrder === 'asc') {
            currentSortMode = 'default';
            currentSortOrder = 'desc';
        }
    } else {
        currentSortMode = mode;
        currentSortOrder = 'desc';
    }

    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.remove('active');
        const icon = btn.querySelector('.sort-icon');
        if (currentSortMode !== 'default' && btn.dataset.sort === currentSortMode) {
            btn.classList.add('active');
            if (icon) icon.textContent = currentSortOrder === 'asc' ? '▲' : '▼';
        } else {
            if (icon) icon.textContent = '-';
        }
    });

    renderTradesByGu(filteredTrades);
}

let isGroupByGu = false;

function toggleGroupByGu() {
    isGroupByGu = !isGroupByGu;
    const btn = document.getElementById('group-by-gu-btn');
    if (isGroupByGu) {
        btn.classList.add('active');
        btn.innerHTML = '구별 그룹 <span class="material-icons-round" style="font-size: 14px;">check</span>';
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '그룹 해제 <span class="material-icons-round" style="font-size: 14px;">close</span>';
    }
    renderTradesByGu(filteredTrades);
}

// 구별로 정렬하여 렌더링 (v1 스타일)
function renderTradesByGu(trades) {
    const container = document.getElementById('trades-table-container');

    const tradesByGu = {};
    if (trades.length === 0) {
        container.innerHTML = '<div class="no-data"><span class="material-icons-round">inbox</span><p>조건에 맞는 데이터가 없습니다.</p></div>';
        return;
    }

    if (isGroupByGu) {
        trades.forEach(trade => {
            const gu = trade.gu || '기타';
            if (!tradesByGu[gu]) tradesByGu[gu] = [];
            tradesByGu[gu].push(trade);
        });
    } else {
        tradesByGu['전체 리스트'] = [...trades];
    }

    const priorityOrder = ['수성구', '중구', '달서구', '서구', '남구', '군위군'];

    let guNames = [];
    if (isGroupByGu) {
        guNames = Object.keys(tradesByGu).sort((a, b) => {
            const indexA = priorityOrder.indexOf(a);
            const indexB = priorityOrder.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b, 'ko');
        });
    } else {
        guNames = ['전체 리스트'];
    }

    let html = '';

    const sortLogic = (a, b) => {
        let valA, valB;
        if (currentSortMode === 'price') {
            valA = getPriceVal(a);
            valB = getPriceVal(b);
        } else if (currentSortMode === 'volume_same') {
            valA = a.recentVolumeSame || 0;
            valB = b.recentVolumeSame || 0;
        } else if (currentSortMode === 'volume_all') {
            valA = a.recentVolumeAll || 0;
            valB = b.recentVolumeAll || 0;
        } else if (currentSortMode === 'newhigh_price') {
            const isHighA = a.isNewHigh ? 1 : 0;
            const isHighB = b.isNewHigh ? 1 : 0;
            if (isHighA !== isHighB) {
                return currentSortOrder === 'asc' ? isHighA - isHighB : isHighB - isHighA;
            }
            valA = getPriceVal(a);
            valB = getPriceVal(b);
        }

        if (currentSortMode !== 'default') {
            if (valA !== valB) {
                return currentSortOrder === 'asc' ? valA - valB : valB - valA;
            }
            // 값이 같을 경우 아래의 기본 정렬로 넘어감
        }

        // 기본 정렬 (동 -> 단지명 -> 면적)
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
                let priceText = formatPrice(priceVal);

                if (activeDealMode === 'rent' && trade._monthly_rent > 0) {
                    priceText = `${formatPrice(trade._deposit)} / ${formatPrice(trade._monthly_rent)}`;
                }

                let rowClass = 'trade-row';
                if (viewMode === 'simple') rowClass += ' simple-mode';
                if (isCancelled) rowClass += ' cancelled';
                else if (isNewHigh) rowClass += ' new-high';

                let priceHtmlForSimple = '';
                let priceHtml = '';
                if (isCancelled) {
                    priceHtmlForSimple = `<span class="price-text cancelled" style="font-size:0.85em;">${priceText} <span class="cancel-badge">취소</span></span>`;
                    priceHtml = `<span class="price-text cancelled">${priceText} <span class="cancel-badge">취소</span></span>`;
                } else if (isNewHigh && activeDealMode !== 'rent') { // 전월세는 신고가 아이콘 렌더링 안함
                    priceHtmlForSimple = `<span class="price-text new-high" style="font-size:0.85em;">🔥 ${priceText}</span>`;
                    priceHtml = `<span class="price-text new-high">🔥 ${priceText}</span>`;
                } else {
                    priceHtmlForSimple = `<span class="price-text" style="font-size:0.85em;">${priceText}</span>`;
                    priceHtml = `<span class="price-text">${priceText}</span>`;
                }

                // 전월세가 아닐 때만 이전최고가 및 퍼센티지(상승률) 표시
                if (!isCancelled && trade.previousHigh > 0 && viewMode !== 'simple' && activeDealMode !== 'rent') {
                    const prevHighText = formatPrice(trade.previousHigh);
                    let pctHtml = '';
                    const pVal = getPriceVal(trade);
                    if (pVal > 0) {
                        const pct = Math.round((pVal / trade.previousHigh) * 100);
                        let pctColor = 'var(--text-secondary)';
                        if (isNewHigh || pct > 100) {
                            pctColor = '#ef4444';
                        } else if (pct < 85) {
                            pctColor = '#3b82f6';
                        }
                        pctHtml = ` <span style="color:${pctColor}; font-weight:600;">${pct}%</span>`;
                    }
                    priceHtml += `<span class="prev-high-wrapper" style="font-size:0.85em; color:var(--text-secondary, #64748b); font-weight:normal; margin-left:4px;">(${prevHighText},${pctHtml})</span>`;
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
function generateSparkline(historyList) {
    if (!historyList || historyList.length < 2) return '';

    const prices = historyList.map(item => {
        let v = typeof item === 'object' ? item.amount : item;
        if (typeof v === 'string') v = parseInt(v.replace(/[^0-9]/g, ''));
        return isNaN(v) ? 0 : v;
    }).filter(v => v > 0);

    if (prices.length < 2) return '';

    // 이력이 2개 이상일 때만 그림
    const width = 80;
    const height = 24;
    const minVal = Math.min(...prices);
    const maxVal = Math.max(...prices);
    const range = maxVal - minVal || 1;

    // 끝부분 마진
    const padX = 4;
    const padY = 4;

    const stepX = (width - padX * 2) / (prices.length - 1);

    let points = [];
    prices.forEach((val, i) => {
        const x = padX + i * stepX;
        // SVG 기준 Y=0이 맨 위
        const y = padY + (height - padY * 2) - ((val - minVal) / range) * (height - padY * 2);
        points.push(`${x},${y}`);
    });

    // 선 경로
    const pathData = `M ${points.join(' L ')}`;

    // 점 생성 (시작점 파란색, 마지막점 빨간색, 중간점 회색?)
    let circles = '';
    prices.forEach((val, i) => {
        const [xStr, yStr] = points[i].split(',');
        const isFirst = (i === 0);
        const isLast = (i === prices.length - 1);
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
let currentModalActivePeriod = 'all';
let modalChartInstance = null;

let currentModalAptName = '';
let currentModalDong = '';
let currentModalDealMode = 'sale';
let currentModalArea = 0;
let currentModalType = 'apt';
let currentModalConstructionYear = null;
let currentModalHouseholdCount = null;
let currentModalPreaptinfoRawid = null;

// 모달 표시 함수
async function showDetailModal(globalIndex) {
    const trade = allTrades[globalIndex];
    if (!trade) return;

    currentModalAptName = trade.apt_name;
    currentModalDong = trade.dong;
    currentModalDealMode = activeDealMode;
    currentModalType = trade.type;
    currentModalArea = parseFloat(trade.area || 0);
    currentModalConstructionYear = trade.construction_year;
    currentModalHouseholdCount = trade.household_count;
    currentModalPreaptinfoRawid = trade.preaptinfo_rawid || null;

    document.querySelectorAll('#modal-deal-mode-toggle button').forEach(btn => {
        if (btn.dataset.deal === currentModalDealMode) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    const modal = document.getElementById('trade-detail-modal');
    if (!modal) return;
    modal.classList.add('active');

    document.getElementById('modal-loading').style.display = 'block';
    document.getElementById('modal-content-area').style.display = 'none';

    await fetchModalAreaOptions();
    await loadModalData();

    incrementAptClickCount();

    // 모바일 뒤로가기 처리를 위한 상태 추가
    if (!history.state || !history.state.isModalOpen) {
        history.pushState({ isModalOpen: true }, '', '');
    }
}

async function fetchModalAreaOptions() {
    const areaSelect = document.getElementById('modal-area-select');
    areaSelect.innerHTML = `<option value="${currentModalArea}">${currentModalArea.toFixed(2)}㎡ (확인중...)</option>`;

    let sizes = [];
    if (currentModalType === 'presale') {
        // 분양권일 경우 preaptinfo_rawid 로 preaptinfo 에서 조회하거나 presale_trades 에서 직접 조회
        if (currentModalPreaptinfoRawid) {
            const { data: infoData } = await supabaseClient.from('preaptinfo').select('area').eq('rawid', currentModalPreaptinfoRawid);
            if (infoData && infoData.length > 0) {
                sizes = infoData.map(d => parseFloat(d.area)).filter(a => !isNaN(a));
            } else {
                const { data: tradeData } = await supabaseClient.from('presale_trades').select('area').eq('preaptinfo_rawid', currentModalPreaptinfoRawid).limit(1000);
                if (tradeData) sizes = tradeData.map(d => parseFloat(d.area)).filter(a => !isNaN(a));
            }
        } else {
            const { data: infoData } = await supabaseClient.from('preaptinfo').select('area').eq('apt_name', currentModalAptName);
            if (infoData && infoData.length > 0) {
                sizes = infoData.map(d => parseFloat(d.area)).filter(a => !isNaN(a));
            } else {
                const { data: tradeData } = await supabaseClient.from('presale_trades').select('area').eq('apt_name', currentModalAptName).limit(1000);
                if (tradeData) sizes = tradeData.map(d => parseFloat(d.area)).filter(a => !isNaN(a));
            }
        }
    } else {
        // 아파트일 경우 aptinfo 또는 apt_trades 에서 면적 조회
        const { data: infoData } = await supabaseClient.from('aptinfo').select('area').eq('apt_name', currentModalAptName);
        if (infoData && infoData.length > 0) {
            sizes = infoData.map(d => parseFloat(d.area)).filter(a => !isNaN(a));
        } else {
            const { data: tradeData } = await supabaseClient.from('apt_trades').select('area').eq('apt_name', currentModalAptName).limit(1000);
            if (tradeData) {
                sizes = tradeData.map(d => parseFloat(d.area)).filter(a => !isNaN(a));
            }
        }
    }
    sizes.push(currentModalArea);
    sizes = [...new Set(sizes.map(a => Math.round(a * 100) / 100))].sort((a, b) => a - b);

    let optionsHtml = '';
    let foundCurrent = false;
    sizes.forEach(sz => {
        let isSelected = false;
        if (!foundCurrent && Math.abs(sz - currentModalArea) < 1.0) {
            isSelected = true;
            foundCurrent = true;
        }
        optionsHtml += `<option value="${sz}" ${isSelected ? 'selected' : ''}>${sz.toFixed(2)}㎡</option>`;
    });
    areaSelect.innerHTML = optionsHtml;
}

function changeModalDealMode(mode) {
    if (currentModalDealMode === mode) return;
    currentModalDealMode = mode;
    document.querySelectorAll('#modal-deal-mode-toggle button').forEach(btn => {
        if (btn.dataset.deal === mode) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    loadModalData();
}

function changeModalArea(areaVal) {
    currentModalArea = parseFloat(areaVal);
    loadModalData();
}

async function loadModalData() {
    document.getElementById('modal-loading').style.display = 'block';

    document.getElementById('modal-apt-name').textContent = currentModalAptName;

    // 아파트/분양권 뱃지 업데이트
    const typeBadge = document.getElementById('modal-apt-type-badge');
    if (typeBadge) {
        if (currentModalType === 'presale') {
            typeBadge.textContent = '분양권';
            typeBadge.style.background = '#f59e0b';
        } else {
            typeBadge.textContent = '아파트';
            typeBadge.style.background = '#6b7280';
        }
    }

    let subInfoArr = [currentModalDong];
    if (currentModalConstructionYear) subInfoArr.push(`${currentModalConstructionYear}년`);
    if (currentModalHouseholdCount) subInfoArr.push(`${currentModalHouseholdCount}세대`);
    document.getElementById('modal-dong').innerHTML = subInfoArr.join('<span style="margin:0 8px; color:var(--border);">|</span>');

    let data = [];
    let error = null;

    if (currentModalDealMode === 'sale-rent') {
        const saleTableName = currentModalType === 'apt' ? 'apt_trades' : 'presale_trades';
        let saleQuery = supabaseClient.from(saleTableName).select('contractdate, amount, floor, newhigh, termination_date');
        let rentQuery = supabaseClient.from('apt_rent_trades').select('contractdate, deposit, monthly_rent, floor, newhigh');

        if (currentModalType === 'presale' && currentModalPreaptinfoRawid) {
            saleQuery = saleQuery.eq('preaptinfo_rawid', currentModalPreaptinfoRawid);
            rentQuery = rentQuery.eq('apt_name', '_임시차단용매칭불가이름_'); // 분양권은 전세가 없으므로 차단
        } else {
            saleQuery = saleQuery.eq('apt_name', currentModalAptName);
            rentQuery = rentQuery.eq('apt_name', currentModalAptName);
        }

        saleQuery = saleQuery.gte('area', currentModalArea - 1.0).lte('area', currentModalArea + 1.0)
            .order('contractdate', { ascending: true }).limit(5000);
        rentQuery = rentQuery.gte('area', currentModalArea - 1.0).lte('area', currentModalArea + 1.0)
            .order('contractdate', { ascending: true }).limit(5000);

        const [saleRes, rentRes] = await Promise.all([saleQuery, rentQuery]);
        if (saleRes.error) error = saleRes.error;
        if (rentRes.error) error = rentRes.error;

        const sales = (saleRes.data || []).map(d => ({ ...d, _type: 'sale' }));
        const rents = (rentRes.data || []).map(d => ({
            ...d,
            amount: d.deposit,
            _deposit: d.deposit,
            _monthly_rent: d.monthly_rent,
            _type: 'rent'
        }));

        data = [...sales, ...rents].sort((a, b) => (a.contractdate || '').localeCompare(b.contractdate || ''));

    } else {
        let tableName, queryCols;
        if (currentModalDealMode === 'rent') {
            tableName = 'apt_rent_trades';
            queryCols = 'contractdate, deposit, monthly_rent, floor, newhigh';
        } else {
            tableName = currentModalType === 'apt' ? 'apt_trades' : 'presale_trades';
            queryCols = 'contractdate, amount, floor, newhigh, termination_date';
        }

        let query = supabaseClient.from(tableName).select(queryCols);
        if (currentModalType === 'presale' && currentModalPreaptinfoRawid) {
            query = query.eq('preaptinfo_rawid', currentModalPreaptinfoRawid);
        } else {
            query = query.eq('apt_name', currentModalAptName);
        }
        query = query.gte('area', currentModalArea - 1.0).lte('area', currentModalArea + 1.0)
            .order('contractdate', { ascending: true }).limit(5000);

        const res = await query;
        data = res.data;
        error = res.error;
    }

    if (error) {
        console.error("모달 데이터 로딩 실패:", error);
        currentModalTradeHistory = [];
    } else {
        if (currentModalDealMode === 'rent') {
            currentModalTradeHistory = data.map(d => ({
                ...d,
                amount: d.deposit,
                _deposit: d.deposit,
                _monthly_rent: d.monthly_rent,
                _type: 'rent'
            }));
        } else if (currentModalDealMode === 'sale-rent') {
            currentModalTradeHistory = data || [];
        } else {
            // sale
            currentModalTradeHistory = (data || []).map(d => ({ ...d, _type: 'sale' }));
        }
    }

    let highestAll = 0;
    let highest3M = 0;
    let lowest3M = Infinity;

    let maxMonthlyRentDeposit = 0;
    let maxMonthlyRentAmount = 0;

    const limit3MDate = new Date();
    limit3MDate.setMonth(limit3MDate.getMonth() - 3);
    const limitStr3M = limit3MDate.toISOString().split('T')[0];

    let validVolumes3M = 0;
    let latestPrice = 0;
    let isLatestNewHigh = false;
    let latestContractDate = '-';

    currentModalTradeHistory.forEach(pt => {
        const ptDate = (pt.contractdate || '').substring(0, 10);
        let isStatTarget = false;
        if (currentModalDealMode === 'sale-rent') isStatTarget = (pt._type === 'sale');
        else if (currentModalDealMode === 'sale') isStatTarget = true;
        else isStatTarget = (!pt._monthly_rent && !pt.monthly_rent); // 렌트모드는 순수 전세만

        if (isStatTarget && !pt.termination_date) {
            let pVal = pt.amount;
            if (typeof pVal === 'string') pVal = parseInt(pVal.replace(/[^0-9]/g, ''));
            if (!isNaN(pVal)) {
                if (pVal > highestAll) highestAll = pVal;
                if (ptDate >= limitStr3M) {
                    if (pVal > highest3M) highest3M = pVal;
                    if (pVal < lowest3M) lowest3M = pVal;
                }
            }
        }

        if (currentModalDealMode === 'rent' && pt._monthly_rent > 0 && !pt.termination_date) {
            let mRent = pt._monthly_rent;
            if (typeof mRent === 'string') mRent = parseInt(mRent.replace(/[^0-9]/g, ''));
            if (!isNaN(mRent) && mRent > maxMonthlyRentAmount) {
                maxMonthlyRentAmount = mRent;
                maxMonthlyRentDeposit = pt._deposit;
            }
        }

        if (ptDate >= limitStr3M && !pt.termination_date && isStatTarget) {
            validVolumes3M++;
        }
    });

    if (lowest3M === Infinity) lowest3M = 0;

    let priceFormatted = '-';
    if (currentModalTradeHistory.length > 0) {
        let latestTrades = [...currentModalTradeHistory].reverse();
        if (currentModalDealMode === 'sale-rent') {
            latestTrades = latestTrades.filter(t => t._type === 'sale');
        }

        if (latestTrades.length > 0) {
            const latest = latestTrades.find(t => !t.termination_date) || latestTrades[0];

            latestPrice = latest.amount;
            isLatestNewHigh = latest.newhigh === true || latest.newhigh === 1 || latest.newhigh === '1';
            latestContractDate = (latest.contractdate || '').substring(0, 10);

            priceFormatted = formatPrice(latestPrice);
            if (currentModalDealMode === 'rent' && latest._monthly_rent > 0) {
                priceFormatted = `${formatPrice(latest._deposit)} / ${formatPrice(latest._monthly_rent)}`;
            }
        }
    }

    let modalPriceHtml = isLatestNewHigh ? `최근거래액 : 🔥 ${priceFormatted} <span style="font-size:0.6em; color:#fff; background:#ff5252; padding:2px 6px; border-radius:4px; vertical-align:middle; margin-left:4px;">신고가</span>` : `최근거래액 : ${priceFormatted}`;
    if (currentModalDealMode === 'sale-rent') modalPriceHtml = `<span style="color:#fbbf24; font-size:0.8em; margin-right:4px;">[매매]</span>` + modalPriceHtml;
    document.getElementById('modal-price').innerHTML = modalPriceHtml;

    let infoHtml = `
        <div style="font-size: 0.85em; display: flex; flex-wrap: wrap; gap: 15px; justify-content: flex-start; align-items: center; color: var(--text-secondary); background: rgba(0,0,0,0.15); padding: 10px 15px; border-radius: 8px; border: 1px solid var(--border);">
            <div><span style="color:var(--text-muted); margin-right:4px;">최근 계약일</span><span style="color:var(--text-primary); font-weight:500;">${latestContractDate}</span></div>
            <div><span style="color:var(--text-muted); margin-right:4px;">역대최고</span><span style="color:#ef4444; font-weight:bold;">${highestAll > 0 ? formatPrice(highestAll) : '-'}</span></div>
            <div><span style="color:var(--text-muted); margin-right:4px;">3개월최고</span><span style="color:#ef4444; font-weight:bold;">${highest3M > 0 ? formatPrice(highest3M) : '-'}</span></div>
            <div><span style="color:var(--text-muted); margin-right:4px;">3개월최저</span><span style="color:#3b82f6; font-weight:bold;">${lowest3M > 0 ? formatPrice(lowest3M) : '-'}</span></div>
            ${currentModalDealMode === 'rent' ? `<div><span style="color:var(--text-muted); margin-right:4px;">최고월세</span><span style="color:#ef4444; font-weight:bold;">${maxMonthlyRentAmount > 0 ? `${formatPrice(maxMonthlyRentDeposit)} / ${formatPrice(maxMonthlyRentAmount)}` : '-'}</span></div>` : ''}
            <div><span style="color:var(--text-muted); margin-right:4px;">최근3개월(동일면적)</span><span style="color:var(--text-primary); font-weight:500;">${validVolumes3M}건</span></div>
        </div>
    `;
    document.getElementById('modal-info').innerHTML = infoHtml;

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

    let tabsHtml = '';
    const tabs = [
        { label: '3개월', val: '3m' },
        { label: '6개월', val: '6m' },
        { label: '1년', val: '1y' },
        { label: '3년', val: '3y' },
        { label: '5년', val: '5y' },
        { label: '전체', val: 'all' }
    ];

    tabs.forEach((tab, index) => {
        tabsHtml += `<button class="icon-toggle-btn ${tab.val === 'all' ? 'active' : ''}" data-val="${tab.val}" onclick="selectModalPeriod('${tab.val}')" style="font-size:0.8rem; padding:4px 10px;">${tab.label}</button>`;
    });

    document.getElementById('modal-period-tabs').innerHTML = tabsHtml;
    // 기본으로 선택해 둘 기간 (전체)
    selectModalPeriod('all');
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
    if (period === '5y') targetDate.setFullYear(targetDate.getFullYear() - 5);
    else if (period === '3y') targetDate.setFullYear(targetDate.getFullYear() - 3);
    else if (period === '1y') targetDate.setFullYear(targetDate.getFullYear() - 1);
    else if (period === '6m') targetDate.setMonth(targetDate.getMonth() - 6);
    else if (period === '3m') targetDate.setMonth(targetDate.getMonth() - 3);
    else targetDate.setFullYear(1900); // 'all'

    const targetDateStr = targetDate.toISOString().split('T')[0];

    // 선택 기간에 맞춰 기록 필터링 (오름차순 유지)
    const filteredHistory = currentModalTradeHistory.filter(t => {
        const d = (t.contractdate || '').substring(0, 10);
        return d >= targetDateStr;
    });

    const chartHistory = filteredHistory.filter(t => currentModalDealMode === 'sale' || (!t._monthly_rent && !t.monthly_rent));

    const chartContainer = document.getElementById('modal-chart');
    if (chartHistory.length > 0) {
        chartContainer.innerHTML = `
            <div id="chart-growth-info" style="min-height:45px; display:flex; flex-direction:column; justify-content:flex-end; align-items:flex-end; text-align:right; font-size:0.85em; margin-bottom:4px; font-weight:bold; color:var(--text-secondary);">
                <!-- 범위 선택 시 상승률 표시 -->
            </div>
            <div class="modal-chart-wrapper" style="position: relative; width: 100%; user-select: none; height: 250px;">
                <canvas id="detail-chart-canvas"></canvas>
            </div>
            <div style="text-align:right; font-size:0.75em; color:var(--text-muted); margin-top:4px;">
                👆 차트 위를 <b>드래그(영역 선택)</b>하면 선택한 기간의 상승률을 볼 수 있습니다. (빈 공간 클릭 시 해제)
            </div>
        `;
        renderModalChartJS(chartHistory);
    } else {
        if (modalChartInstance) {
            modalChartInstance.destroy();
            modalChartInstance = null;
        }
        chartContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">조건에 맞는 전세(순수) 내역이 충분하지 않습니다. (월세 제외)</div>';
    }

    // 목록 그리기 (최신순이므로 역순 정렬)
    let listHtml = '';
    const reversedHistory = [...filteredHistory].reverse();

    // 기간 내 유효 거래 중 최고가/최저가 계산 (월세가 낀 내역은 제외)
    // t.monthly_rent와 t._monthly_rent 를 확인
    const validTrades = filteredHistory.filter(t => !t.termination_date && (currentModalDealMode === 'sale' || (!t._monthly_rent && !t.monthly_rent)));
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

        let priceText = formatPrice(t.amount);
        if (currentModalDealMode === 'rent' && t._monthly_rent > 0) {
            priceText = `${formatPrice(t._deposit)} / ${formatPrice(t._monthly_rent)}`;
        }

        const cDate = (t.contractdate || '').substring(0, 10);
        const floor = t.floor || '-';

        let pVal = t.amount;
        if (typeof pVal === 'string') pVal = parseInt(pVal.replace(/[^0-9]/g, ''));

        let displayPrice = priceText;

        if (isCancelled) {
            displayPrice = `<span style="text-decoration: line-through; color: var(--text-muted);">${priceText}</span> <span class="cancel-badge" style="font-size:0.7em;">취소</span>`;
        } else {
            let tags = '';

            if (currentModalDealMode === 'sale-rent') {
                if (t._type === 'rent') tags += '<span style="font-size:0.65em; color:#60a5fa; border: 1px solid #60a5fa; padding:1px 4px; border-radius:4px; margin-right:4px;">전세</span>';
                else if (t._type === 'sale') tags += '<span style="font-size:0.65em; color:#fbbf24; border: 1px solid #fbbf24; padding:1px 4px; border-radius:4px; margin-right:4px;">매매</span>';
            }

            if (isNewHigh) {
                tags += `<span style="font-size:0.65em; color:#fff; background:#ff5252; padding:2px 4px; border-radius:4px; margin-left:4px;">신고가</span>`;
            }

            // 기간 내 최고가/최저가 태그 (순수 전세, 즉 월세가 없는 경우만 표시)
            const isPureJeonse = currentModalDealMode === 'sale' || currentModalDealMode === 'sale-rent' || (!t._monthly_rent && !t.monthly_rent);

            if (isPureJeonse && maxPrice && pVal === maxPrice) {
                tags += `<span style="font-size:0.65em; color:#ef4444; border: 1px solid #ef4444; padding:1px 4px; border-radius:4px; margin-left:4px;">최고가</span>`;
            }
            if (isPureJeonse && minPrice && pVal === minPrice && minPrice !== maxPrice) {
                tags += `<span style="font-size:0.65em; color:#3b82f6; border: 1px solid #3b82f6; padding:1px 4px; border-radius:4px; margin-left:4px;">최저가</span>`;
            }

            let priceDisplayHtml = priceText;
            if (isNewHigh) {
                priceDisplayHtml = `🔥 ${priceText}`;
            }

            if (isNewHigh || (isPureJeonse && pVal === maxPrice)) {
                displayPrice = `<span style="color: #ff5252; font-weight: bold;">${priceDisplayHtml}</span>${tags}`;
            } else if (isPureJeonse && pVal === minPrice && minPrice !== maxPrice) {
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
    if (modal && modal.classList.contains('active')) {
        modal.classList.remove('active');
        // 뒤로가기 상태 보정을 위해 (x버튼이나 바깥영역 클릭으로 닫을 때)
        if (history.state && history.state.isModalOpen) {
            history.back();
        }
    }
}

// 모바일 기기 등에서 뒤로가기 버튼 누를 시 모달만 닫히도록 처리
window.addEventListener('popstate', function (event) {
    const modal = document.getElementById('trade-detail-modal');
    if (modal && modal.classList.contains('active')) {
        modal.classList.remove('active');
    }
});

// 모달 바깥쪽 클릭 시 닫기
window.addEventListener('click', function (event) {
    const modal = document.getElementById('trade-detail-modal');
    if (event.target === modal) {
        closeDetailModal();
    }

    // 모달 내 아파트 검색 닫기 (콤보박스 외부 영역 클릭 시)
    const searchContainer = document.getElementById('modal-apt-search-container');
    const triggerBtn = document.getElementById('modal-apt-name-trigger');

    if (searchContainer && searchContainer.style.display === 'block') {
        if (!searchContainer.contains(event.target) && (!triggerBtn || !triggerBtn.contains(event.target))) {
            closeModalAptSearch();
        }
    }
});



function openModalAptSearch() {
    document.getElementById('modal-apt-name-trigger').style.visibility = 'hidden';
    document.getElementById('modal-apt-search-container').style.display = 'block';
    const input = document.getElementById('modal-apt-search');
    input.value = ''; // 초기화
    document.getElementById('modal-apt-search-results').style.display = 'none';

    // 오픈될 때 기본적으로 현재 화면에 있는 단지들을 보여주기
    handleModalSearch('');
    setTimeout(() => input.focus(), 50);
}

function closeModalAptSearch() {
    document.getElementById('modal-apt-name-trigger').style.visibility = 'visible';
    document.getElementById('modal-apt-search-container').style.display = 'none';
    document.getElementById('modal-apt-search-results').style.display = 'none';
}

let searchModalTimeout = null;

async function handleModalSearch(query) {
    const resultsUl = document.getElementById('modal-apt-search-results');
    const q = (query || '').trim().toLowerCase();

    // 이전에 예약된 검색 취소
    if (searchModalTimeout) clearTimeout(searchModalTimeout);

    // 0.2초 디바운싱 후 DB 쿼리 실행
    searchModalTimeout = setTimeout(async () => {
        try {
            // aptinfo와 preaptinfo 두 테이블에서 동시에 검색
            let aptQuery = supabaseClient
                .from('aptinfo')
                .select('apt_name, city_3, construction_year, household_count, area');

            let preQuery = supabaseClient
                .from('preaptinfo')
                .select('apt_name, city_3, area, rawid'); // preaptinfo는 dong 대신 city_3 에 동 정보가 있음

            if (q) {
                // 검색어가 있으면 일치하는 아파트명 검색
                aptQuery = aptQuery.ilike('apt_name', `%${q}%`).limit(30);
                preQuery = preQuery.ilike('apt_name', `%${q}%`).limit(10);
            } else {
                // 검색어가 없으면 기본으로 몇 개만 보여주기
                aptQuery = aptQuery.limit(30);
                preQuery = preQuery.limit(5);
            }

            const [aptRes, preRes] = await Promise.all([aptQuery, preQuery]);

            if (aptRes.error) throw aptRes.error;
            if (preRes.error) throw preRes.error;

            const aptData = aptRes.data || [];
            const preData = preRes.data || [];

            if (aptData.length === 0 && preData.length === 0) {
                resultsUl.innerHTML = '<li style="padding:10px; color:var(--text-muted); text-align:center;">검색 결과가 없습니다</li>';
                resultsUl.style.display = 'block';
                return;
            }

            // 단지명 + 동 기준으로 중복 제거 및 병합
            const uniqueApts = [];
            const seen = new Set();

            // 일반 아파트 추가
            aptData.forEach(d => {
                const dongVal = d.city_3 || ''; // city_3 컬럼을 dong으로 사용
                const key = `${d.apt_name}|${dongVal}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueApts.push({ ...d, dong: dongVal, isPre: false });
                }
            });

            // 분양권 추가
            preData.forEach(d => {
                const dongVal = d.city_3 || ''; // city_3 컬럼을 dong으로 사용
                const key = `${d.apt_name}|${dongVal}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueApts.push({
                        ...d,
                        dong: dongVal, // 화면 표시에 쓰기 위해 dong 필드로 매핑
                        isPre: true,
                        preaptinfo_rawid: d.rawid
                    });
                }
            });

            // 화면에 렌더링
            resultsUl.innerHTML = uniqueApts.map(d => {
                const yearStr = d.construction_year ? `${d.construction_year}년` : '';
                const cntStr = d.household_count ? `${d.household_count}세대` : '';
                const typeBadge = d.isPre ? '<span style="color:#f59e0b; font-size:0.7em; border:1px solid #f59e0b; padding:1px 4px; border-radius:4px; margin-right:4px;">분양권</span>' : '';
                const infoStr = [d.dong, yearStr, cntStr].filter(x => x).join(' | ');

                const safeName = (d.apt_name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const safeDong = (d.dong || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

                // onclick 핸들러 수정: isPre와 preaptinfo_rawid 전달
                const onClickHandler = d.isPre
                    ? `selectSearchedModalApt('${safeName}', '${safeDong}', '', '', '${d.area || 0}', true, '${d.preaptinfo_rawid}')`
                    : `selectSearchedModalApt('${safeName}', '${safeDong}', '${d.construction_year || ''}', '${d.household_count || ''}', '${d.area || 0}', false, null)`;

                return `
                    <li style="padding: 10px; border-bottom: 1px solid var(--border); cursor: pointer;"
                        onmouseover="this.style.background='var(--bg-body)'" onmouseout="this.style.background='transparent'"
                        onclick="${onClickHandler}">
                        <div style="font-weight:bold; color:var(--text-primary); font-size:0.9rem;">${typeBadge}${d.apt_name}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${infoStr}</div>
                    </li>
                `;
            }).join('');
            resultsUl.style.display = 'block';

        } catch (e) {
            console.error('모달 내 아파트 검색 오류:', e);
            resultsUl.innerHTML = '<li style="padding:10px; color:var(--text-muted); text-align:center;">오류가 발생했습니다</li>';
            resultsUl.style.display = 'block';
        }
    }, 200);
}

function selectSearchedModalApt(name, dong, year, count, avgArea, isPre = false, preaptinfoRawid = null) {
    closeModalAptSearch();

    currentModalAptName = name;
    currentModalDong = dong;
    currentModalConstructionYear = year || null;
    currentModalHouseholdCount = count || null;
    currentModalType = isPre ? 'presale' : 'apt';
    currentModalPreaptinfoRawid = preaptinfoRawid && preaptinfoRawid !== 'null' && preaptinfoRawid !== 'undefined' ? preaptinfoRawid : null;
    currentModalArea = parseFloat(avgArea) || 84;

    document.getElementById('modal-loading').style.display = 'block';
    document.getElementById('modal-content-area').style.display = 'none';

    // 해당 아파트로 새로 데이터 수집 및 렌더링
    fetchModalAreaOptions().then(() => {
        loadModalData();
    });

    incrementAptClickCount();
}

async function incrementAptClickCount() {
    try {
        if (currentModalType === 'presale') {
            if (currentModalPreaptinfoRawid) {
                const { data } = await supabaseClient.from('preaptinfo').select('clickcount').eq('rawid', currentModalPreaptinfoRawid).limit(1);
                if (data && data.length > 0) {
                    await supabaseClient.from('preaptinfo').update({ clickcount: (data[0].clickcount || 0) + 1 }).eq('rawid', currentModalPreaptinfoRawid);
                }
            }
        } else {
            let q = supabaseClient.from('aptinfo').select('clickcount, apt_name, city_3').eq('apt_name', currentModalAptName);
            if (currentModalDong) q = q.eq('city_3', currentModalDong);
            const { data } = await q.limit(1);
            if (data && data.length > 0) {
                const target = data[0];
                let uq = supabaseClient.from('aptinfo').update({ clickcount: (target.clickcount || 0) + 1 }).eq('apt_name', target.apt_name);
                if (target.city_3) uq = uq.eq('city_3', target.city_3);
                else uq = uq.is('city_3', null);
                await uq;
            }
        }
    } catch (e) {
        console.error('클릭 카운트 업데이트 오류:', e);
    }
}

function renderModalChartJS(history) {
    const ctx = document.getElementById('detail-chart-canvas').getContext('2d');

    if (modalChartInstance) {
        modalChartInstance.destroy();
    }

    const scatterData = [];
    const monthlyGroups = {};

    let maxAmount = -Infinity;
    let minAmount = Infinity;

    // 1차 순회: 최고/최저가 찾기
    history.forEach(t => {
        if (!t.contractdate) return;
        const amount = typeof t.amount === 'string' ? parseInt(t.amount.replace(/[^0-9]/g, '')) : t.amount;
        if (isNaN(amount) || amount === 0) return;
        if (amount > maxAmount) maxAmount = amount;
        if (amount < minAmount) minAmount = amount;
    });

    // 2차 순회: 데이터 구성
    history.forEach(t => {
        if (!t.contractdate) return;
        const amount = typeof t.amount === 'string' ? parseInt(t.amount.replace(/[^0-9]/g, '')) : t.amount;
        if (isNaN(amount) || amount === 0) return;

        const dateStr = t.contractdate.replace(/\./g, '-').substring(0, 10);
        const isNewHigh = (t.newhigh === true || t.newhigh === 1 || t.newhigh === '1');
        const isMax = (amount === maxAmount);
        const isMin = (amount === minAmount);

        scatterData.push({ x: dateStr, y: amount, isNewHigh: isNewHigh, isMax: isMax, isMin: isMin, original: t });

        const monthKey = dateStr.substring(0, 7) + '-01';
        if (!monthlyGroups[monthKey]) {
            monthlyGroups[monthKey] = { sum: 0, count: 0 };
        }
        monthlyGroups[monthKey].sum += amount;
        monthlyGroups[monthKey].count += 1;
    });

    let datasets = [];
    let barData = [];

    if (currentModalDealMode === 'sale-rent') {
        const monthlyGroupsSale = {};
        const monthlyGroupsRent = {};

        scatterData.forEach(d => {
            const monthKey = d.x.substring(0, 7) + '-01';
            if (d.original._type === 'sale') {
                if (!monthlyGroupsSale[monthKey]) monthlyGroupsSale[monthKey] = { sum: 0, count: 0 };
                monthlyGroupsSale[monthKey].sum += d.y;
                monthlyGroupsSale[monthKey].count += 1;
            } else if (d.original._type === 'rent') {
                if (!monthlyGroupsRent[monthKey]) monthlyGroupsRent[monthKey] = { sum: 0, count: 0 };
                monthlyGroupsRent[monthKey].sum += d.y;
                monthlyGroupsRent[monthKey].count += 1;
            }
        });

        const monthsSet = new Set([...Object.keys(monthlyGroupsSale), ...Object.keys(monthlyGroupsRent)]);

        if (scatterData.length >= 2) {
            const dateValues = scatterData.map(d => new Date(d.x).getTime());
            const minDate = new Date(Math.min(...dateValues));
            const maxDate = new Date(Math.max(...dateValues));
            let current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
            const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
            while (current <= end) {
                const yyyy = current.getFullYear();
                const mm = String(current.getMonth() + 1).padStart(2, '0');
                monthsSet.add(`${yyyy}-${mm}-01`);
                current.setMonth(current.getMonth() + 1);
            }
        }

        const months = Array.from(monthsSet).sort();

        const lineDataSale = [];
        const lineDataRent = [];

        let lastSaleAvg = null;
        let lastRentAvg = null;

        months.forEach(m => {
            let saleAvg = monthlyGroupsSale[m] ? monthlyGroupsSale[m].sum / monthlyGroupsSale[m].count : null;
            let rentAvg = monthlyGroupsRent[m] ? monthlyGroupsRent[m].sum / monthlyGroupsRent[m].count : null;

            if (saleAvg !== null) lastSaleAvg = saleAvg;
            else saleAvg = lastSaleAvg;

            if (rentAvg !== null) lastRentAvg = rentAvg;
            else rentAvg = lastRentAvg;

            if (saleAvg !== null) lineDataSale.push({ x: m, y: saleAvg, rentAvgForGap: rentAvg });
            if (rentAvg !== null) lineDataRent.push({ x: m, y: rentAvg });

            const count = (monthlyGroupsSale[m] ? monthlyGroupsSale[m].count : 0) + (monthlyGroupsRent[m] ? monthlyGroupsRent[m].count : 0);
            barData.push({ x: m, y: count });
        });

        datasets = [
            {
                type: 'bar',
                label: '총 거래량',
                data: barData,
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                yAxisID: 'y1',
                barThickness: 'flex',
                maxBarThickness: 15,
                order: 4
            },
            {
                type: 'scatter',
                label: '매매 실거래',
                data: scatterData.filter(d => d.original._type === 'sale'),
                backgroundColor: function (ctx) {
                    if (!ctx.raw) return 'rgba(255, 255, 255, 0.25)';
                    if (ctx.raw.isMax) return '#b91c1c';
                    if (ctx.raw.isMin) return '#1d4ed8';
                    return ctx.raw.isNewHigh ? '#ef4444' : 'rgba(255, 255, 255, 0.25)';
                },
                borderColor: function (ctx) {
                    if (!ctx.raw) return 'rgba(255, 255, 255, 0.4)';
                    if (ctx.raw.isMax) return '#991b1b';
                    if (ctx.raw.isMin) return '#1e40af';
                    return ctx.raw.isNewHigh ? '#ef4444' : 'rgba(255, 255, 255, 0.4)';
                },
                pointRadius: function (ctx) { return (!ctx.raw) ? 3 : (ctx.raw.isMax || ctx.raw.isMin) ? 5 : 3; },
                pointHoverRadius: function (ctx) { return (!ctx.raw) ? 5 : (ctx.raw.isMax || ctx.raw.isMin) ? 7 : 5; },
                yAxisID: 'y',
                order: 2
            },
            {
                type: 'scatter',
                label: '전세 실거래',
                data: scatterData.filter(d => d.original._type === 'rent'),
                backgroundColor: 'rgba(59, 130, 246, 0.3)',
                borderColor: 'rgba(59, 130, 246, 0.6)',
                pointRadius: 3,
                pointHoverRadius: 5,
                yAxisID: 'y',
                order: 3
            },
            {
                type: 'line',
                label: '매매 월평균',
                data: lineDataSale,
                borderColor: '#fbbf24', // 매매: 금색
                backgroundColor: 'transparent',
                borderWidth: 2,
                tension: 0,
                pointRadius: 0,
                pointHoverRadius: 0,
                yAxisID: 'y',
                order: 1
            },
            {
                type: 'line',
                label: '전세 월평균',
                data: lineDataRent,
                borderColor: '#60a5fa', // 전세: 파란색
                backgroundColor: 'transparent',
                borderWidth: 2,
                tension: 0,
                pointRadius: 0,
                pointHoverRadius: 0,
                yAxisID: 'y',
                order: 1
            }
        ];

    } else {
        const monthsSet = new Set(Object.keys(monthlyGroups));
        if (scatterData.length >= 2) {
            const dateValues = scatterData.map(d => new Date(d.x).getTime());
            const minDate = new Date(Math.min(...dateValues));
            const maxDate = new Date(Math.max(...dateValues));
            let current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
            const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
            while (current <= end) {
                const yyyy = current.getFullYear();
                const mm = String(current.getMonth() + 1).padStart(2, '0');
                monthsSet.add(`${yyyy}-${mm}-01`);
                current.setMonth(current.getMonth() + 1);
            }
        }

        const months = Array.from(monthsSet).sort();
        const lineData = [];

        let lastAvg = null;
        months.forEach(m => {
            let avg = monthlyGroups[m] ? monthlyGroups[m].sum / monthlyGroups[m].count : null;
            if (avg !== null) lastAvg = avg;
            else avg = lastAvg;

            if (avg !== null) lineData.push({ x: m, y: avg });
            barData.push({ x: m, y: monthlyGroups[m] ? monthlyGroups[m].count : 0 });
        });

        datasets = [
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
                    if (!ctx.raw) return 'rgba(255, 255, 255, 0.25)';
                    if (ctx.raw.isMax) return '#b91c1c'; // 찐한 빨간색 (red-700)
                    if (ctx.raw.isMin) return '#1d4ed8'; // 찐한 파란색 (blue-700)
                    return ctx.raw.isNewHigh ? '#ef4444' : 'rgba(255, 255, 255, 0.25)';
                },
                borderColor: function (ctx) {
                    if (!ctx.raw) return 'rgba(255, 255, 255, 0.4)';
                    if (ctx.raw.isMax) return '#991b1b'; // 테두리 (red-800)
                    if (ctx.raw.isMin) return '#1e40af'; // 테두리 (blue-800)
                    return ctx.raw.isNewHigh ? '#ef4444' : 'rgba(255, 255, 255, 0.4)';
                },
                pointRadius: function (ctx) {
                    if (!ctx.raw) return 3;
                    if (ctx.raw.isMax || ctx.raw.isMin) return 5;
                    return 3;
                },
                pointHoverRadius: function (ctx) {
                    if (!ctx.raw) return 5;
                    if (ctx.raw.isMax || ctx.raw.isMin) return 7;
                    return 5;
                },
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
        ];
    }

    modalChartInstance = new Chart(ctx, {
        type: 'line',
        data: { datasets: datasets },
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
                                return `총 거래량: ${context.parsed.y}건`;
                            }
                            let label = `${context.dataset.label}: ${formatPrice(context.parsed.y)}`;
                            if (currentModalDealMode === 'sale-rent' && context.dataset.label === '매매 월평균') {
                                const rentAvg = context.raw.rentAvgForGap;
                                if (rentAvg != null) {
                                    const gap = context.parsed.y - rentAvg;
                                    label += ` (전세 갭: ${formatPrice(gap)})`;
                                }
                            }
                            return label;
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
                    time: (function () {
                        if (currentModalActivePeriod === '3m') {
                            return {
                                unit: 'week',
                                displayFormats: { week: 'MM.dd' },
                                tooltipFormat: 'yyyy.MM.dd'
                            };
                        } else if (currentModalActivePeriod === '6m') {
                            return {
                                unit: 'day',
                                stepSize: 10,
                                displayFormats: { day: 'MM.dd' },
                                tooltipFormat: 'yyyy.MM.dd'
                            };
                        } else {
                            return {
                                unit: 'month',
                                displayFormats: { month: 'yyyy.MM' },
                                tooltipFormat: 'yyyy.MM'
                            };
                        }
                    })(),
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
                } else if (event.type === 'mousemove' && !state.isDragging) {
                    if (typeof updateChartHoverInfo === 'function') {
                        updateChartHoverInfo(chart, event.x);
                    }
                } else if (event.type === 'mouseup' || event.type === 'mouseout') {
                    if (event.type === 'mouseout' && !state.isDragging) {
                        if (typeof updateChartHoverInfo === 'function') {
                            updateChartHoverInfo(chart, null);
                        }
                    }
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

function updateChartHoverInfo(chart, pixX) {
    const infoDiv = document.getElementById('chart-growth-info');
    if (!infoDiv || currentModalDealMode !== 'sale-rent') return;

    const state = chart.dragState;
    if (state && (state.isDragging || state.completed)) return;

    if (pixX === null) {
        infoDiv.innerHTML = '';
        return;
    }

    const xScale = chart.scales.x;
    const hoverTime = xScale.getValueForPixel(pixX);

    const saleDataset = chart.data.datasets.find(d => d.type === 'line' && d.label === '매매 월평균');
    if (!saleDataset || !saleDataset.data || saleDataset.data.length === 0) return;

    let nearestData = saleDataset.data[0];
    let minDist = Infinity;
    saleDataset.data.forEach(d => {
        const dx = new Date(d.x).getTime();
        const dist = Math.abs(dx - hoverTime);
        if (dist < minDist) { minDist = dist; nearestData = d; }
    });

    if (minDist > 45 * 24 * 60 * 60 * 1000) {
        infoDiv.innerHTML = '';
        return;
    }

    const saleAvg = nearestData.y;
    const rentAvg = nearestData.rentAvgForGap;

    if (rentAvg != null && rentAvg > 0) {
        const gap = saleAvg - rentAvg;
        const jeonseRate = saleAvg > 0 ? (rentAvg / saleAvg) * 100 : 0;
        const hoverMonth = nearestData.x.substring(0, 7).replace('-', '.');
        infoDiv.innerHTML = `
            <span style="color:var(--text-muted);">${hoverMonth} 기준</span>
            <span style="margin-left:8px; font-weight:normal; color:#fbbf24;">(매매가: ${formatPrice(saleAvg)}, 전세가: ${formatPrice(rentAvg)} &nbsp;&nbsp; 평균 전세 갭: ${formatPrice(gap)}, 전세가율: ${jeonseRate.toFixed(1)}%)</span>
        `;
    } else {
        infoDiv.innerHTML = '';
    }
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

    let allVisibleTrades = visibleTrades;

    if (infoDiv) {
        if (currentModalDealMode === 'sale-rent') {
            // 매매+전세 모드일 때는 선택된 기간의 매매 평균과 전세 평균을 구해 갭과 전세가율 표시
            const rentDataset = chart.data.datasets.find(d => d.type === 'scatter' && d.label === '전세 실거래');
            let rentAvg = null;
            let gapHtml = '';

            if (rentDataset && rentDataset.data) {
                const visibleRents = rentDataset.data.filter(d => {
                    const tTime = new Date(d.x).getTime();
                    return tTime >= minTime && tTime <= maxTime;
                });

                allVisibleTrades = [...visibleTrades, ...visibleRents].sort((a, b) => new Date(a.x) - new Date(b.x));

                if (visibleRents.length > 0) {
                    const sumRent = visibleRents.reduce((sum, t) => sum + t.y, 0);
                    rentAvg = sumRent / visibleRents.length;

                    const sumSale = visibleTrades.reduce((sum, t) => sum + t.y, 0);
                    const saleAvg = sumSale / visibleTrades.length;

                    const gap = saleAvg - rentAvg;
                    const jeonseRate = saleAvg > 0 ? (rentAvg / saleAvg) * 100 : 0;

                    gapHtml = `<span style="margin-left:12px; font-weight:normal; color:#fbbf24;">(매매가: ${formatPrice(saleAvg)}, 전세가: ${formatPrice(rentAvg)} &nbsp;&nbsp; 평균 전세 갭: ${formatPrice(gap)}, 전세가율: ${jeonseRate.toFixed(1)}%)</span>`;
                }
            }

            infoDiv.innerHTML = `
                선택기간: ${startYM} ~ ${endYM} 
                ${gapHtml}
            `;
        } else {
            infoDiv.innerHTML = `
                선택기간: ${startYM} ~ ${endYM} 
                <span style="color:${color}; margin-left:8px; font-size:1.1em;">
                    ${icon} ${formatPrice(Math.abs(diffVal))} (${sign}${pct.toFixed(1)}%)
                </span>
            `;
        }
    }

    renderModalTradeList(allVisibleTrades.map(t => t.original));
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

        let tags = '';

        if (currentModalDealMode === 'sale-rent') {
            if (t._type === 'rent') tags += '<span style="font-size:0.65em; color:#60a5fa; border: 1px solid #60a5fa; padding:1px 4px; border-radius:4px; margin-right:4px;">전세</span>';
            else if (t._type === 'sale') tags += '<span style="font-size:0.65em; color:#fbbf24; border: 1px solid #fbbf24; padding:1px 4px; border-radius:4px; margin-right:4px;">매매</span>';
        }

        if (isNewHigh) {
            tags += `<span style="font-size:0.65em; color:#fff; background:#ff5252; padding:2px 4px; border-radius:4px; margin-left:4px;">신고가</span>`;
        }

        let displayPrice = priceText;
        if (isCancelled) {
            displayPrice = `<span style="text-decoration: line-through; color: var(--text-muted);">${priceText}</span> <span class="cancel-badge" style="font-size:0.7em;">취소</span>`;
        } else if (isNewHigh) {
            displayPrice = `<span style="color: #ff5252; font-weight: bold;">🔥 ${priceText}</span>${tags}`;
        } else {
            displayPrice = `<span>${priceText}</span>${tags}`;
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
