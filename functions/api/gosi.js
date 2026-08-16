// GET /api/gosi - 대구 고시공고 게시판 프록시
// 사이트(대구시청/각 구청) 고시공고 게시판을 서버에서 가져와 파싱 후 JSON으로 반환
// 쿼리: source(기관 ID, 기본 daegu), dept(부서명 필터), page(페이지 번호)

// 기관별 설정 (구청 추가 시 여기에 항목을 늘린다)
const SOURCES = {
    daegu: {
        name: '대구시청',
        boardUrl: 'https://www.daegu.go.kr/index.do?menu_id=00940170',
        listUrl: 'https://www.daegu.go.kr/index.do?menu_id=00940170&menu_link=/front/daeguSidoGosi/daeguSidoGosiList.do',
        viewUrl: 'https://www.daegu.go.kr/index.do?menu_id=00940170&menu_link=/front/daeguSidoGosi/daeguSidoGosiView.do',
        defaultDepts: ['도시', '건축'], // 부서명 부분검색 키워드 (검색별 결과를 병합)
        deptField: 'searchDept_nm',
        parse: parseDaeguList
    },
    daegu_build: {
        name: '대구시청 도시/주택/건설 소식',
        boardUrl: 'https://www.daegu.go.kr/build/index.do?menu_id=00001338',
        listUrl: 'https://www.daegu.go.kr/build/index.do?menu_id=00001338&menu_link=/icms/bbs/selectBoardList.do&bbsId=BBS_00153',
        viewUrl: 'https://www.daegu.go.kr/build/index.do?menu_id=00001338&menu_link=/icms/bbs/selectBoardArticle.do&bbsId=BBS_00153',
        defaultDepts: [], // 부서 필터 없이 전체 목록
        parse: parseIcmsList
    },
    jung: {
        name: '중구청 고시공고',
        boardUrl: 'https://www.jung.daegu.kr/new/pages/administration/page.html?mc=0159',
        // 새올 전자민원(eminwon) 목록 조회. initValue=Y 가 없으면 검색 필터가 무시된다
        listUrl: 'https://eminwon.jung.daegu.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do'
            + '?jndinm=OfrNotAncmtEJB&context=NTIS&method=selectListOfrNotAncmt&methodnm=selectListOfrNotAncmtHomepage'
            + '&homepage_pbs_yn=Y&subCheck=Y&ofr_pageSize=10&not_ancmt_se_code=01%2C04&initValue=Y&countYn=Y&yyyy=2018',
        viewUrl: 'https://eminwon.jung.daegu.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do'
            + '?jndinm=OfrNotAncmtEJB&context=NTIS&method=selectOfrNotAncmt&methodnm=selectOfrNotAncmtRegst'
            + '&homepage_pbs_yn=Y&subCheck=Y&title=%EA%B3%A0%EC%8B%9C%EA%B3%B5%EA%B3%A0',
        defaultDepts: ['건축'],
        deptField: 'dept_nm',
        parse: parseEminwonList
    }
};

// HTML 엔티티 디코딩 및 태그 제거
function cleanText(str) {
    return str
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&apos;|&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;|&#160;/g, ' ')
        .trim();
}

// 대구시청 고시공고 목록 HTML 파싱
// 행 구조: 번호 / 제목(fn_goLinkView('sno','gbn')) / 부서명 / 게재일자 / 조회
function parseDaeguList(html, source) {
    const items = [];

    // 목록 테이블 tbody만 잘라서 행 단위로 파싱
    const tableMatch = html.match(/<table id="bbsList"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
    if (!tableMatch) return items;

    const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let row;
    while ((row = rowRegex.exec(tableMatch[1])) !== null) {
        const tr = row[1];

        const linkMatch = tr.match(/fn_goLinkView\('(\d+)',\s*'([A-Z])'\)">([\s\S]*?)<\/a>/);
        if (!linkMatch) continue; // "등록된 자료가 없습니다" 등 데이터 행이 아닌 경우

        const tds = [...tr.matchAll(/<td[^>]*data-table-type="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g)];
        const cell = {};
        const hideVals = [];
        for (const td of tds) {
            const text = cleanText(td[2]);
            if (td[1] === 'hide_t') hideVals.push(text);
            else cell[td[1]] = text;
        }

        items.push({
            no: cell.number || '',
            title: cleanText(linkMatch[3]),
            dept: hideVals[0] || '',
            date: cell.date || '',
            views: hideVals[1] || '',
            url: `${source.viewUrl}&sno=${linkMatch[1]}&gosi_gbn=${linkMatch[2]}`
        });
    }
    return items;
}

// icms 공통 게시판(도시/주택/건설 소식 등) 목록 HTML 파싱
// 행 구조: 번호 / 제목(fn_icms_navi_common('view','nttId')) / 작성자 / 등록일 / 조회
function parseIcmsList(html, source) {
    const items = [];

    const tableMatch = html.match(/<table id="bbsList"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
    if (!tableMatch) return items;

    const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let row;
    while ((row = rowRegex.exec(tableMatch[1])) !== null) {
        const tr = row[1];

        const linkMatch = tr.match(/fn_icms_navi_common\('view',\s*'(\d+)'\)[^>]*>([\s\S]*?)<\/a>/);
        if (!linkMatch) continue;

        const tds = [...tr.matchAll(/<td[^>]*data-table-type="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g)];
        const cell = {};
        const hideVals = [];
        for (const td of tds) {
            const text = cleanText(td[2]);
            if (td[1] === 'hide_t') hideVals.push(text);
            else cell[td[1]] = text;
        }

        items.push({
            no: cell.number || '',
            title: cleanText(linkMatch[2]),
            dept: hideVals[0] || '', // 이 게시판은 부서 대신 작성자
            date: cell.date || '',
            views: hideVals[1] || '',
            url: `${source.viewUrl}&nttId=${linkMatch[1]}`
        });
    }
    return items;
}

// 새올 전자민원(eminwon) 고시공고 목록 파싱 (구청 공통)
// 행 구조: 번호 / 고시공고번호 / 제목(searchDetail('mgtNo')) / 담당부서 / 등록일 / 조회수
function parseEminwonList(html, source) {
    const items = [];

    const tableMatch = html.match(/<table[^>]*class="boardList[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
    if (!tableMatch) return items;

    // 줄무늬 행은 <tr style="..."> 형태라 속성까지 허용해야 한다
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let row;
    while ((row = rowRegex.exec(tableMatch[1])) !== null) {
        const tr = row[1];

        const linkMatch = tr.match(/searchDetail\('(\d+)'\)[^>]*>([\s\S]*?)<\/a>/);
        if (!linkMatch) continue;

        const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(td => cleanText(td[1]));
        // 공고번호("대구광역시 중구 공고 제2026-748호")에서 짧은 번호만 추출
        const noMatch = (tds[1] || '').match(/제?(\d{4}-\d+)호?/);

        items.push({
            no: noMatch ? noMatch[1] : (tds[1] || ''),
            title: cleanText(linkMatch[2]),
            dept: tds[3] || '',
            date: tds[4] || '',
            views: tds[5] || '',
            url: `${source.viewUrl}&not_ancmt_mgt_no=${linkMatch[1]}`
        });
    }
    return items;
}

export async function onRequest(context) {
    const { request } = context;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json; charset=utf-8',
        // 게시판 특성상 10분 캐시로 원 사이트 부하를 줄인다
        'Cache-Control': 'public, max-age=600'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const params = new URL(request.url).searchParams;
        const sourceId = params.get('source') || 'daegu';
        const source = SOURCES[sourceId];

        if (!source) {
            return new Response(JSON.stringify({
                success: false,
                error: `지원하지 않는 기관입니다: ${sourceId}`
            }), { status: 400, headers: corsHeaders });
        }

        // dept는 콤마로 구분된 여러 검색어를 받는다 (예: dept=도시,건축)
        const deptRaw = params.get('dept');
        const depts = deptRaw !== null
            ? deptRaw.split(',').map(s => s.trim()).filter(Boolean)
            : source.defaultDepts;
        const page = params.get('page') || '1';

        // 검색어별로 목록을 조회한다 (파라미터 이름은 기관마다 다름)
        const fetchOne = async (dept) => {
            const deptParam = dept && source.deptField ? `&${source.deptField}=${encodeURIComponent(dept)}` : '';
            const res = await fetch(`${source.listUrl}${deptParam}&pageIndex=${encodeURIComponent(page)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    'Accept-Language': 'ko-KR,ko;q=0.9'
                }
            });
            if (!res.ok) throw new Error(`원본 사이트 응답 오류 (HTTP ${res.status})`);
            return source.parse(await res.text(), source);
        };

        const lists = await Promise.all((depts.length ? depts : ['']).map(fetchOne));

        // 병합 후 중복 제거(상세 URL 기준), 등록일 내림차순 정렬
        const seen = new Set();
        const items = [];
        for (const list of lists) {
            for (const item of list) {
                if (seen.has(item.url)) continue;
                seen.add(item.url);
                items.push(item);
            }
        }
        items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        return new Response(JSON.stringify({
            success: true,
            source: sourceId,
            sourceName: source.name,
            boardUrl: source.boardUrl,
            depts,
            page: Number(page),
            count: items.length,
            items
        }), { headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { status: 500, headers: corsHeaders });
    }
}
