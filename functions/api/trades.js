// GET /api/trades - 실거래가 데이터 조회

export async function onRequest(context) {
    const { request, env } = context;
    
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // OPTIONS
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const url = new URL(request.url);
        const params = url.searchParams;

        // 최신 목록 조회
        if (params.get('list') === 'true') {
            const list = await env.TRADES_KV.get('latest_list');
            return new Response(JSON.stringify({
                success: true,
                data: list ? JSON.parse(list) : []
            }), { headers: corsHeaders });
        }

        // 날짜별 데이터 조회
        const date = params.get('date');
        
        if (!date) {
            // 날짜 없으면 가장 최근 데이터
            const list = await env.TRADES_KV.get('latest_list');
            if (!list) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'No data'
                }), { status: 404, headers: corsHeaders });
            }
            const latestList = JSON.parse(list);
            if (latestList.length === 0) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'No data'
                }), { status: 404, headers: corsHeaders });
            }
            // 가장 최근 날짜로
            const latestDate = latestList[0].date;
            const data = await env.TRADES_KV.get(`apt_${latestDate}`);
            return new Response(JSON.stringify({
                success: true,
                data: data ? JSON.parse(data) : null
            }), { headers: corsHeaders });
        }

        const key = `apt_${date}`;
        const data = await env.TRADES_KV.get(key);
        
        if (!data) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Data not found'
            }), { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
            success: true,
            data: JSON.parse(data)
        }), { headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { status: 500, headers: corsHeaders });
    }
}
