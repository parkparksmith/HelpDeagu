// GET /api/APTTrades - 아파트/분양권 실거래가 데이터 조회 API
// 사용법: 
//   GET /api/APTTrades?date=2026-02-03 (날짜별 전체)
//   GET /api/APTTrades?date=2026-02-03&district=suseong (날짜+지역)
//   GET /api/APTTrades?list=true (최신 목록)

export async function onRequestGet(context) {
    const { request, env } = context;
    
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
    };

    try {
        const url = new URL(request.url);
        const params = url.searchParams;

        // 최신 목록 조회
        if (params.get('list') === 'true') {
            const latestList = await env.TRADES_KV.get('apt_latest_list', { type: 'json' }) || [];
            return new Response(JSON.stringify({
                success: true,
                data: latestList
            }), { headers });
        }

        const date = params.get('date');
        const district = params.get('district');
        const tradeType = params.get('type'); // 'apt', 'presale', or null for all

        // 날짜 필수
        if (!date) {
            // 날짜 없으면 가장 최근 데이터
            const latestList = await env.TRADES_KV.get('apt_latest_list', { type: 'json' }) || [];
            if (latestList.length === 0) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'No data available'
                }), { status: 404, headers });
            }
            // 가장 최근 날짜 데이터 반환
            const latestDate = latestList[0].selected_date;
            return await getTradeData(env, latestDate, district, tradeType, headers);
        }

        return await getTradeData(env, date, district, tradeType, headers);

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { status: 500, headers });
    }
}

async function getTradeData(env, date, district, tradeType, headers) {
    let key, data;
    
    if (district) {
        // 지역별 데이터
        key = `apt_${district}_${date}`;
        data = await env.TRADES_KV.get(key, { type: 'json' });
    } else {
        // 전체 데이터
        key = `apt_${date}`;
        data = await env.TRADES_KV.get(key, { type: 'json' });
    }
    
    if (!data) {
        return new Response(JSON.stringify({
            success: false,
            error: 'Data not found for this date'
        }), { status: 404, headers });
    }

    // trade_type 필터링
    if (tradeType && data.trades) {
        const typeFilter = tradeType === 'apt' ? '아파트' : '분양권';
        data.trades = data.trades.filter(t => t.trade_type === typeFilter);
        data.filteredCount = data.trades.length;
    }

    return new Response(JSON.stringify({
        success: true,
        data
    }), { headers });
}

// OPTIONS 요청 (CORS)
export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}
