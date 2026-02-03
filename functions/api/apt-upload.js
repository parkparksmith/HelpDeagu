// POST /api/APTUpload - 아파트/분양권 실거래가 데이터 업로드 API

export async function onRequestPost(context) {
    const { request, env } = context;
    
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
        'Content-Type': 'application/json'
    };

    try {
        // API 키 인증
        const apiKey = request.headers.get('X-API-Key');
        if (!apiKey || apiKey !== '3731') {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Unauthorized - Invalid API Key' 
            }), { status: 401, headers });
        }

        // 요청 본문 파싱
        const body = await request.json();
        
        // 데이터 검증
        if (!body.key || !body.selected_date || !Array.isArray(body.trades)) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Invalid data format. Required: key, selected_date, trades[]' 
            }), { status: 400, headers });
        }

        const { key, export_date, selected_date, summary, trades } = body;
        
        // 지역별로 데이터 분류
        const tradesByDistrict = {};
        trades.forEach(trade => {
            // district에서 구/군 추출 (예: "대구광역시 수성구 범어동" -> "suseong")
            const districtCode = extractDistrictCode(trade.district);
            if (!tradesByDistrict[districtCode]) {
                tradesByDistrict[districtCode] = [];
            }
            tradesByDistrict[districtCode].push(trade);
        });

        // 메인 데이터 저장 (날짜별 전체 데이터)
        const mainKey = `apt_${selected_date}`;
        const mainData = {
            key,
            export_date,
            selected_date,
            summary,
            trades,
            updatedAt: new Date().toISOString()
        };
        await env.TRADES_KV.put(mainKey, JSON.stringify(mainData));

        // 지역별 데이터도 별도 저장
        for (const [districtCode, districtTrades] of Object.entries(tradesByDistrict)) {
            const districtKey = `apt_${districtCode}_${selected_date}`;
            await env.TRADES_KV.put(districtKey, JSON.stringify({
                district: districtCode,
                selected_date,
                trades: districtTrades,
                count: districtTrades.length,
                updatedAt: new Date().toISOString()
            }));
        }

        // 최신 데이터 목록 업데이트
        let latestList = await env.TRADES_KV.get('apt_latest_list', { type: 'json' }) || [];
        
        const existingIndex = latestList.findIndex(item => item.selected_date === selected_date);
        const listItem = { 
            key: mainKey, 
            selected_date, 
            summary,
            updatedAt: mainData.updatedAt 
        };
        
        if (existingIndex >= 0) {
            latestList[existingIndex] = listItem;
        } else {
            latestList.unshift(listItem);
            if (latestList.length > 30) {
                latestList = latestList.slice(0, 30);
            }
        }
        
        // 날짜 역순 정렬
        latestList.sort((a, b) => new Date(b.selected_date) - new Date(a.selected_date));
        
        await env.TRADES_KV.put('apt_latest_list', JSON.stringify(latestList));

        return new Response(JSON.stringify({ 
            success: true, 
            message: `${trades.length}건 저장 완료`,
            key: mainKey,
            summary,
            districts: Object.keys(tradesByDistrict).map(d => ({
                code: d,
                count: tradesByDistrict[d].length
            }))
        }), { status: 200, headers });

    } catch (error) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: error.message 
        }), { status: 500, headers });
    }
}

// 지역 코드 추출 함수
function extractDistrictCode(district) {
    if (!district) return 'unknown';
    
    const districtMap = {
        '수성구': 'suseong',
        '달서구': 'dalseo',
        '달성군': 'dalseong',
        '동구': 'dong',
        '서구': 'seo',
        '남구': 'nam',
        '북구': 'buk',
        '중구': 'junggu'
    };
    
    for (const [name, code] of Object.entries(districtMap)) {
        if (district.includes(name)) {
            return code;
        }
    }
    return 'unknown';
}

// OPTIONS 요청 (CORS Preflight)
export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
        }
    });
}
