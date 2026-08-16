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
        defaultDept: '도시주택국',
        parse: parseDaeguList
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

        const dept = params.get('dept') ?? source.defaultDept;
        const page = params.get('page') || '1';

        const targetUrl = `${source.listUrl}&searchDept_nm=${encodeURIComponent(dept)}&pageIndex=${encodeURIComponent(page)}`;

        const res = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept-Language': 'ko-KR,ko;q=0.9'
            }
        });

        if (!res.ok) {
            return new Response(JSON.stringify({
                success: false,
                error: `원본 사이트 응답 오류 (HTTP ${res.status})`
            }), { status: 502, headers: corsHeaders });
        }

        const html = await res.text();
        const items = source.parse(html, source);

        return new Response(JSON.stringify({
            success: true,
            source: sourceId,
            sourceName: source.name,
            boardUrl: source.boardUrl,
            dept,
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
