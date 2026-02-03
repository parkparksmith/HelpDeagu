// POST /api/upload - 실거래가 데이터 업로드

export async function onRequest(context) {
    const { request, env } = context;
    
    // CORS 헤더
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
        'Content-Type': 'application/json'
    };

    // OPTIONS (CORS preflight)
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // POST만 허용
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ 
            success: false, 
            error: 'Method not allowed' 
        }), { status: 405, headers: corsHeaders });
    }

    try {
        // API 키 확인
        const apiKey = request.headers.get('X-API-Key');
        if (apiKey !== '3731') {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Invalid API Key' 
            }), { status: 401, headers: corsHeaders });
        }

        // 요청 본문 파싱
        const body = await request.json();
        
        if (!body.selected_date || !Array.isArray(body.trades)) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Required: selected_date, trades[]' 
            }), { status: 400, headers: corsHeaders });
        }

        const { selected_date, summary, trades } = body;
        
        // KV에 저장
        const key = `apt_${selected_date}`;
        const data = {
            selected_date,
            summary,
            trades,
            count: trades.length,
            updatedAt: new Date().toISOString()
        };

        await env.TRADES_KV.put(key, JSON.stringify(data));
        
        // 최신 목록 업데이트
        let latestList = [];
        try {
            const existing = await env.TRADES_KV.get('latest_list');
            if (existing) latestList = JSON.parse(existing);
        } catch (e) {}
        
        // 중복 제거 후 추가
        latestList = latestList.filter(item => item.date !== selected_date);
        latestList.unshift({
            date: selected_date,
            apt_count: summary?.total_apt_count || 0,
            presale_count: summary?.total_presale_count || 0,
            updatedAt: data.updatedAt
        });
        
        // 최근 30개만 유지
        latestList = latestList.slice(0, 30);
        
        await env.TRADES_KV.put('latest_list', JSON.stringify(latestList));

        return new Response(JSON.stringify({ 
            success: true, 
            message: `${trades.length}건 저장 완료`,
            key
        }), { status: 200, headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: error.message 
        }), { status: 500, headers: corsHeaders });
    }
}
