// 대구 고시정보 - 기관별 고시공고 리스트
// 데이터 로딩 순서:
//   1) /api/gosi 프록시 (Cloudflare Pages 등 서버 환경에서 실시간 조회)
//   2) 저장소에 커밋된 Json/Gosi/gosi_<id>.json (fetch_gosi.py 로 생성, GitHub Pages 용)
//   3) GitHub raw 콘텐츠 (로컬에서 열었을 때 등 최후 폴백)
// 구청 추가 시 GOSI_SOURCES 배열과 fetch_gosi.py 의 SOURCES 에 항목을 추가한다.

// 대구시청 고시공고: GET 파라미터로 부서명 검색이 걸린 상태의 게시판 URL을 만든다
const DAEGU_LIST_URL = 'https://www.daegu.go.kr/index.do?menu_id=00940170&menu_link=/front/daeguSidoGosi/daeguSidoGosiList.do';

const GOSI_SOURCES = [
    {
        id: 'daegu',
        name: '대구시청 고시공고',
        desc: '부서명 검색 결과 통합 (중복 제거, 날짜순)',
        depts: ['도시건설국', '건축주택과'], // 부서명 부분검색 키워드 (검색별 결과를 병합)
        boardUrl: `${DAEGU_LIST_URL}&pageIndex=1`,
        jsonPath: '../Json/Gosi/gosi_daegu.json',
        rawUrl: 'https://raw.githubusercontent.com/parkparksmith/HelpDeagu/main/Json/Gosi/gosi_daegu.json'
    },
    {
        id: 'daegu_build',
        name: '대구시청 도시/주택/건설 소식',
        desc: '도시·주택·건설 분야 소식 게시판 1페이지',
        depts: [], // 검색 필터 없이 전체 목록
        boardUrl: 'https://www.daegu.go.kr/build/index.do?menu_id=00001338',
        jsonPath: '../Json/Gosi/gosi_daegu_build.json',
        rawUrl: 'https://raw.githubusercontent.com/parkparksmith/HelpDeagu/main/Json/Gosi/gosi_daegu_build.json'
    },
    {
        id: 'jung',
        name: '중구청 고시공고',
        desc: '담당부서 검색 결과 통합 (중복 제거, 날짜순)',
        depts: ['도시디자인', '주택', '건설'],
        // 게시판이 iframe(새올 전자민원)이라 검색 상태 링크는 불가, 게시판 페이지로 이동
        boardUrl: 'https://www.jung.daegu.kr/new/pages/administration/page.html?mc=0159',
        jsonPath: '../Json/Gosi/gosi_jung.json',
        rawUrl: 'https://raw.githubusercontent.com/parkparksmith/HelpDeagu/main/Json/Gosi/gosi_jung.json'
    },
    {
        id: 'suseong',
        name: '수성구청 고시공고',
        desc: '담당부서 검색 결과 통합 (중복 제거, 날짜순)',
        depts: ['도시디자인', '건축', '건설'],
        boardUrl: 'https://www.suseong.kr/index.do?menu_id=00000064',
        jsonPath: '../Json/Gosi/gosi_suseong.json',
        rawUrl: 'https://raw.githubusercontent.com/parkparksmith/HelpDeagu/main/Json/Gosi/gosi_suseong.json'
    },
    {
        id: 'dalseo',
        name: '달서구청 고시공고',
        desc: '담당부서 검색 결과 통합 (중복 제거, 날짜순)',
        depts: ['도시디자인', '건설', '건축', '토지정보'],
        boardUrl: 'https://www.dalseo.daegu.kr/index.do?menu_id=10000104',
        jsonPath: '../Json/Gosi/gosi_dalseo.json',
        rawUrl: 'https://raw.githubusercontent.com/parkparksmith/HelpDeagu/main/Json/Gosi/gosi_dalseo.json'
    },
    {
        id: 'dong',
        name: '동구청 고시공고',
        desc: '담당부서 검색 결과 통합 (중복 제거, 날짜순)',
        depts: ['도시', '주택', '건설', '토지'],
        boardUrl: 'https://dong.daegu.kr/portal/saeol/gosi/list.do?seCode=01&mid=0201020000',
        jsonPath: '../Json/Gosi/gosi_dong.json',
        rawUrl: 'https://raw.githubusercontent.com/parkparksmith/HelpDeagu/main/Json/Gosi/gosi_dong.json'
    },
    {
        id: 'seogu',
        name: '서구청 고시공고',
        desc: '담당부서 검색 결과 통합 (중복 제거, 날짜순)',
        depts: ['도시', '건축', '건설'],
        boardUrl: 'https://www.dgs.go.kr/portal/saeol/gosi/list.do?seCode=01&endYn=N&mid=0601020100',
        jsonPath: '../Json/Gosi/gosi_seogu.json',
        rawUrl: 'https://raw.githubusercontent.com/parkparksmith/HelpDeagu/main/Json/Gosi/gosi_seogu.json'
    },
    {
        id: 'dalseong',
        name: '달성군청 고시공고',
        desc: '최근 50건 중 담당부서 필터 (사이트 부서검색 미지원)',
        depts: ['건설', '도시', '건축', '토지'],
        boardUrl: 'https://www.dalseong.daegu.kr/index.do?menu_id=00000194',
        jsonPath: '../Json/Gosi/gosi_dalseong.json',
        rawUrl: 'https://raw.githubusercontent.com/parkparksmith/HelpDeagu/main/Json/Gosi/gosi_dalseong.json'
    }
    // TODO: 남구청, 북구청, 군위군청 추가 예정
];

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 기관 카드 골격 렌더링 (첫줄: 게시판 바로가기 링크)
function renderSourceCard(source) {
    const card = document.createElement('div');
    card.className = 'gosi-source';
    card.id = `gosi-source-${source.id}`;
    card.innerHTML = `
        <a class="gosi-source-header" href="${escapeHtml(source.boardUrl)}" target="_blank" rel="noopener">
            <div class="icon-box">
                <span class="material-icons-round">campaign</span>
            </div>
            <div class="source-info">
                <h2>${escapeHtml(source.name)}${source.depts.map(d => `<span class="gosi-filter-badge"><span class="material-icons-round" style="font-size:0.8rem;">filter_alt</span>${escapeHtml(d)}</span>`).join('')}</h2>
                <p class="source-desc">${escapeHtml(source.desc)} · 클릭하면 검색된 게시판으로 이동</p>
            </div>
            <span class="material-icons-round go-icon">open_in_new</span>
        </a>
        <ul class="gosi-list">
            <li class="gosi-empty">불러오는 중...</li>
        </ul>
    `;
    return card;
}

// 고시공고 목록 렌더링
function renderItems(source, items, updatedAt) {
    const list = document.querySelector(`#gosi-source-${source.id} .gosi-list`);
    if (!list) return;

    // 수집 시각 표시 (커밋된 JSON 사용 시)
    if (updatedAt) {
        const desc = document.querySelector(`#gosi-source-${source.id} .source-desc`);
        if (desc) {
            desc.textContent = `${source.desc} · ${updatedAt} 수집 · 클릭하면 검색된 게시판으로 이동`;
        }
    }

    if (!items || items.length === 0) {
        list.innerHTML = '<li class="gosi-empty">등록된 고시공고가 없습니다.</li>';
        return;
    }

    // 항목당 한 줄: [공고번호] 제목(말줄임) ... 부서 날짜
    list.innerHTML = items.map(item => `
        <li>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" title="${escapeHtml(item.title)}">
                <span class="gosi-item-no">${escapeHtml(item.no)}</span>
                <span class="gosi-item-title">${escapeHtml(item.title)}</span>
                <span class="gosi-item-dept">${escapeHtml(item.dept)}</span>
                <span class="gosi-item-date">${escapeHtml(item.date)}</span>
            </a>
        </li>
    `).join('');
}

function renderError(source, message) {
    const list = document.querySelector(`#gosi-source-${source.id} .gosi-list`);
    if (list) {
        list.innerHTML = `<li class="gosi-error">불러오기 실패: ${escapeHtml(message)}</li>`;
    }
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.success === false) throw new Error(json.error || '알 수 없는 오류');
    return json;
}

async function loadSource(source) {
    const cacheBust = `t=${Date.now()}`;
    const apiParams = new URLSearchParams({ source: source.id, dept: source.depts.join(','), page: '1' });

    // 실시간 API → 커밋된 JSON → GitHub raw 순서로 시도
    const attempts = [
        () => fetchJson(`/api/gosi?${apiParams}`),
        () => fetchJson(`${source.jsonPath}?${cacheBust}`),
        () => fetchJson(`${source.rawUrl}?${cacheBust}`)
    ];

    let lastError = null;
    for (const attempt of attempts) {
        try {
            const json = await attempt();
            renderItems(source, json.items, json.updatedAt);
            return;
        } catch (err) {
            lastError = err;
        }
    }
    renderError(source, lastError ? lastError.message : '데이터를 가져올 수 없습니다');
}

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('gosi-sources');
    const loading = document.getElementById('loading');

    GOSI_SOURCES.forEach(source => container.appendChild(renderSourceCard(source)));

    await Promise.all(GOSI_SOURCES.map(loadSource));

    loading.classList.add('hidden');
});
