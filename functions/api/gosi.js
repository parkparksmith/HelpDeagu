// GET /api/gosi - 대구 고시공고 게시판 프록시
// 사이트(대구시청/각 구청) 고시공고 게시판을 서버에서 가져와 파싱 후 JSON으로 반환
// 쿼리: source(기관 ID, 기본 daegu), dept(콤마 구분 다중 검색어), page(페이지 번호)
//
// 게시판 시스템 종류:
// - daegu   : 대구시청 고시공고 (자체 시스템, fn_goLinkView 링크)
// - icms    : 대구시청 분야별 소식 게시판 (fn_icms_navi_common 링크)
// - eminwon : 새올 전자민원 (중구/수성구/달서구/달성군, searchDetail 링크)
// - saeol   : 새올 포털형 (동구/서구, data-action 링크)

// 새올 전자민원(eminwon) 고시공고 목록/상세 URL 생성 (구청 공통)
// initValue=Y 가 없으면 검색 필터가 무시된다. subCheck/yyyy 값은 기관마다 다르다.
function eminwonUrls(host, subCheck = 'Y', yyyy = null, pageSize = 10) {
    const common = `https://${host}/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do`
        + '?jndinm=OfrNotAncmtEJB&context=NTIS';
    const yyyyParam = yyyy ? `&yyyy=${yyyy}` : '';
    return {
        listUrl: common
            + '&method=selectListOfrNotAncmt&methodnm=selectListOfrNotAncmtHomepage'
            + `&homepage_pbs_yn=Y&subCheck=${subCheck}&ofr_pageSize=${pageSize}`
            + '&not_ancmt_se_code=01%2C04&initValue=Y&countYn=Y' + yyyyParam,
        viewUrl: common
            + '&method=selectOfrNotAncmt&methodnm=selectOfrNotAncmtRegst'
            + `&homepage_pbs_yn=Y&subCheck=${subCheck}`
            + '&title=%EA%B3%A0%EC%8B%9C%EA%B3%B5%EA%B3%A0'
    };
}

const JUNG = eminwonUrls('eminwon.jung.daegu.kr', 'Y', 2018);
const SUSEONG = eminwonUrls('eminwon.suseong.kr', 'N');
const DALSEO = eminwonUrls('eminwon.dalseo.daegu.kr', 'Y', 2013);
// 달성군은 서버측 담당부서 검색이 동작하지 않아 50건을 받아 자체 필터링한다
const DALSEONG = eminwonUrls('eminwon.dalseong.daegu.kr', 'Y', null, 50);

// 기관별 설정 (구청 추가 시 여기에 항목을 늘린다)
const SOURCES = {
    daegu: {
        name: '대구시청 고시공고',
        boardUrl: 'https://www.daegu.go.kr/index.do?menu_id=00940170',
        listUrl: 'https://www.daegu.go.kr/index.do?menu_id=00940170&menu_link=/front/daeguSidoGosi/daeguSidoGosiList.do',
        viewUrl: 'https://www.daegu.go.kr/index.do?menu_id=00940170&menu_link=/front/daeguSidoGosi/daeguSidoGosiView.do',
        defaultDepts: ['도시', '주택', '건설', '건축', '토지'], // 부서명 부분검색 키워드 (검색별 결과를 병합)
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
        listUrl: JUNG.listUrl,
        viewUrl: JUNG.viewUrl,
        defaultDepts: ['도시디자인', '주택', '건설'],
        deptField: 'dept_nm',
        parse: parseEminwonList
    },
    suseong: {
        name: '수성구청 고시공고',
        boardUrl: 'https://www.suseong.kr/index.do?menu_id=00000064',
        listUrl: SUSEONG.listUrl,
        viewUrl: SUSEONG.viewUrl,
        defaultDepts: ['도시디자인', '건축', '건설'],
        deptField: 'dept_nm',
        parse: parseEminwonList
    },
    dalseo: {
        name: '달서구청 고시공고',
        boardUrl: 'https://www.dalseo.daegu.kr/index.do?menu_id=10000104',
        listUrl: DALSEO.listUrl,
        viewUrl: DALSEO.viewUrl,
        defaultDepts: ['도시디자인', '건설', '건축', '토지정보'],
        deptField: 'dept_nm',
        parse: parseEminwonList
    },
    dong: {
        name: '동구청 고시공고',
        boardUrl: 'https://dong.daegu.kr/portal/saeol/gosi/list.do?seCode=01&mid=0201020000',
        origin: 'https://dong.daegu.kr',
        listUrl: 'https://dong.daegu.kr/portal/saeol/gosi/list.do?seCode=01&mid=0201020000&searchType=dnm',
        defaultDepts: ['도시', '주택', '건설', '토지'],
        deptField: 'searchTxt',
        pageField: 'page',
        parse: parseSaeolList
    },
    seogu: {
        name: '서구청 고시공고',
        boardUrl: 'https://www.dgs.go.kr/portal/saeol/gosi/list.do?seCode=01&endYn=N&mid=0601020100',
        origin: 'https://www.dgs.go.kr',
        listUrl: 'https://www.dgs.go.kr/portal/saeol/gosi/list.do?seCode=01&endYn=N&mid=0601020100&searchType=dnm',
        defaultDepts: ['도시', '건축', '건설'],
        deptField: 'searchTxt',
        pageField: 'page',
        parse: parseSaeolList
    },
    dalseong: {
        name: '달성군청 고시공고',
        boardUrl: 'https://www.dalseong.daegu.kr/index.do?menu_id=00000194',
        listUrl: DALSEONG.listUrl,
        viewUrl: DALSEONG.viewUrl,
        defaultDepts: ['건설', '도시', '건축', '토지'],
        // 서버측 담당부서 검색이 무시되어 목록 50건을 받아 자체 필터링
        deptFilter: 'client',
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
        .replace(/\s+/g, ' ')
        .trim();
}

// 대구시청 고시공고 목록 HTML 파싱
// 행 구조: 번호 / 제목(fn_goLinkView('sno','gbn')) / 부서명 / 게재일자 / 조회
function parseDaeguList(html, source) {
    const items = [];

    const tableMatch = html.match(/<table id="bbsList"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
    if (!tableMatch) return items;

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
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

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
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
// 기관마다 마크업이 조금씩 다르다:
// - 중구: class="boardList", td 에 data-table-type 없음 (순서 고정)
// - 수성/달서/달성: id="bbsList", td 에 data-table-type(dpt/date/subject 등) 있음
function parseEminwonList(html, source) {
    const items = [];

    const tableMatch = html.match(/<table[^>]*(?:id="bbsList"|class="boardList)[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
    if (!tableMatch) return items;

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let row;
    while ((row = rowRegex.exec(tableMatch[1])) !== null) {
        const tr = row[1];

        const idMatch = tr.match(/searchDetail\('(\d+)'\)/);
        if (!idMatch) continue;

        const tds = [...tr.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)]
            .map(m => ({ attrs: m[1], text: cleanText(m[2]) }));
        const texts = tds.map(td => td.text);
        const tdByType = (t) => {
            const td = tds.find(td => td.attrs.includes(`data-table-type="${t}"`));
            return td ? td.text : null;
        };

        // 제목: subject 셀의 링크 텍스트, 없으면(중구) 행의 마지막 searchDetail 링크 텍스트
        let title = '';
        const subjectTd = tr.match(/<td[^>]*data-table-type="subject"[^>]*>([\s\S]*?)<\/td>/);
        if (subjectTd) {
            const a = subjectTd[1].match(/<a[^>]*>([\s\S]*?)<\/a>/);
            title = cleanText(a ? a[1] : subjectTd[1]);
        } else {
            const links = [...tr.matchAll(/searchDetail\('\d+'\)[^>]*>([\s\S]*?)<\/a>/g)];
            title = links.length ? cleanText(links[links.length - 1][1]) : '';
        }

        // 공고번호("대구광역시 ○○구 공고 제2026-748호")에서 짧은 번호만 추출
        let no = '';
        for (const text of texts) {
            const noMatch = text.match(/제?\s*(\d{4}-\d+)\s*호/);
            if (noMatch) { no = noMatch[1]; break; }
        }

        let dept = tdByType('dpt');
        if (dept === null) dept = texts[3] || '';

        // 등록일: date 타입 셀 우선, 그 외에는 날짜 형식 셀 탐색
        let date = tdByType('date');
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            date = texts.find(t => /^\d{4}-\d{2}-\d{2}$/.test(t)) || '';
        }

        const last = texts[texts.length - 1] || '';
        const views = /^\d+$/.test(last) ? last : '';

        items.push({
            no,
            title,
            dept,
            date,
            views,
            url: `${source.viewUrl}&not_ancmt_mgt_no=${idMatch[1]}`
        });
    }
    return items;
}

// 새올 포털형(saeol) 고시공고 목록 파싱 (동구/서구)
// 행 구조: 번호 / 공고번호 / 제목(a[data-action=view.do]) / 담당부서 / 등록일
function parseSaeolList(html, source) {
    const items = [];

    const tableMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tableMatch) return items;

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let row;
    while ((row = rowRegex.exec(tableMatch[1])) !== null) {
        const tr = row[1];

        const linkMatch = tr.match(/data-action="([^"]*notAncmtMgtNo=[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
        if (!linkMatch) continue;

        const tds = [...tr.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)]
            .map(m => ({ attrs: m[1], text: cleanText(m[2]) }));
        const tdByClass = (cls) => {
            const td = tds.find(td => td.attrs.includes(cls));
            return td ? td.text : '';
        };

        let no = '';
        for (const td of tds) {
            const noMatch = td.text.match(/제?\s*(\d{4}-\d+)\s*호/);
            if (noMatch) { no = noMatch[1]; break; }
        }

        const path = linkMatch[1].replace(/&amp;/g, '&');
        items.push({
            no,
            title: cleanText(linkMatch[2]),
            dept: tdByClass('list_dept'),
            date: tdByClass('list_date'),
            views: '',
            url: `${source.origin}${path}`
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
        const pageField = source.pageField || 'pageIndex';

        const fetchOne = async (dept) => {
            const deptParam = dept && source.deptField ? `&${source.deptField}=${encodeURIComponent(dept)}` : '';
            const res = await fetch(`${source.listUrl}${deptParam}&${pageField}=${encodeURIComponent(page)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    'Accept-Language': 'ko-KR,ko;q=0.9'
                }
            });
            if (!res.ok) throw new Error(`원본 사이트 응답 오류 (HTTP ${res.status})`);
            return source.parse(await res.text(), source);
        };

        let lists;
        if (source.deptFilter === 'client') {
            // 서버측 부서 검색이 동작하지 않는 기관: 전체 목록을 받아 자체 필터링
            const all = await fetchOne('');
            lists = [all.filter(item => depts.some(kw => item.dept.includes(kw)))];
        } else {
            lists = await Promise.all((depts.length ? depts : ['']).map(fetchOne));
        }

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
        // 등록일 1년 이상 지난 항목 제외 (날짜 없는 항목은 유지)
        const cutoff = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        const recent = items.filter(item => !item.date || item.date >= cutoff);

        recent.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        return new Response(JSON.stringify({
            success: true,
            source: sourceId,
            sourceName: source.name,
            boardUrl: source.boardUrl,
            depts,
            page: Number(page),
            count: recent.length,
            items: recent
        }), { headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { status: 500, headers: corsHeaders });
    }
}
