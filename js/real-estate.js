// 실거래가 조회 JavaScript (API 방식)

const API_BASE = '/api';
const DISTRICT_NAMES = {
    'suseong': '수성구',
    'dalseo': '달서구',
    'dalseong': '달성군',
    'dong': '동구',
    'seo': '서구',
    'nam': '남구',
    'buk': '북구',
    'junggu': '중구',
    'unknown': '기타'
};

let currentData = null;

document.addEventListener('DOMContentLoaded', () => {
    loadDataList();
});

// 데이터 목록 로드
async function loadDataList() {
    const listEl = document.getElementById('update-list');
    const dateSelect = document.getElementById('date-select');
    
    try {
        const response = await fetch(`${API_BASE}/trades?list=true`);
        const result = await response.json();
        
        if (!result.success || !result.data || result.data.length === 0) {
            listEl.innerHTML = '<p class="loading">등록된 데이터가 없습니다</p>';
            return;
        }
        
        // 날짜 선택 옵션 채우기
        result.data.forEach(item => {
            const option = document.createElement('option');
            option.value = item.date;
            option.textContent = `${item.date} (아파트 ${item.apt_count || 0}건)`;
            dateSelect.appendChild(option);
        });
        
        // 최근 업데이트 목록 표시
        listEl.innerHTML = result.data.slice(0, 10).map(item => `
            <div class="update-item" onclick="selectDate('${item.date}')">
                <span class="date">${item.date}</span>
                <span class="counts">
                    아파트 ${item.apt_count || 0} / 
                    분양권 ${item.presale_count || 0}
                </span>
            </div>
        `).join('');
        
        // 첫 번째 데이터 자동 로드
        if (result.data.length > 0) {
            document.getElementById('date-select').value = result.data[0].date;
            loadTrades();
        }
        
    } catch (error) {
        console.error('List load error:', error);
        listEl.innerHTML = '<p class="loading">데이터 로드 실패</p>';
    }
}

// 날짜 선택
function selectDate(date) {
    document.getElementById('date-select').value = date;
    loadTrades();
}

// 거래 데이터 로드
async function loadTrades() {
    const date = document.getElementById('date-select').value;
    const district = document.getElementById('district-select').value;
    const tradeType = document.getElementById('type-select').value;
    
    const tbody = document.getElementById('trades-body');
    
    tbody.innerHTML = `
        <tr class="loading-row">
            <td colspan="7">🔄 데이터 로딩 중...</td>
        </tr>
    `;
    
    try {
        let url = `${API_BASE}/trades`;
        if (date) url += `?date=${date}`;
        
        const response = await fetch(url);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || '데이터 조회 실패');
        }
        
        currentData = result.data;
        
        let trades = currentData.trades || [];
        
        // 지역 필터링
        if (district) {
            trades = trades.filter(t => {
                const code = extractDistrictCode(t.district);
                return code === district;
            });
        }
        
        // 유형 필터링
        if (tradeType) {
            const typeFilter = tradeType === 'apt' ? '아파트' : '분양권';
            trades = trades.filter(t => t.trade_type === typeFilter);
        }
        
        displaySummary(currentData.summary, trades.length);
        displayTrades(trades);
        
    } catch (error) {
        console.error('Load error:', error);
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">
                    <div class="empty-state">
                        <span class="material-icons-round">error_outline</span>
                        <p>${error.message}</p>
                    </div>
                </td>
            </tr>
        `;
        document.getElementById('summary-cards').style.display = 'none';
    }
}

// 지역 코드 추출
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

// 요약 정보 표시
function displaySummary(summary, filteredCount) {
    const summaryCards = document.getElementById('summary-cards');
    
    if (!summary) {
        summaryCards.style.display = 'none';
        return;
    }
    
    summaryCards.style.display = 'flex';
    document.getElementById('summary-apt').textContent = summary.total_apt_count || 0;
    document.getElementById('summary-presale').textContent = summary.total_presale_count || 0;
    document.getElementById('summary-newhigh').textContent = 
        (summary.apt_newhigh_count || 0) + (summary.presale_newhigh_count || 0);
    document.getElementById('summary-filtered').textContent = filteredCount;
}

// 거래 데이터 표시
function displayTrades(trades) {
    const tbody = document.getElementById('trades-body');
    
    if (!trades || trades.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">
                    <div class="empty-state">
                        <span class="material-icons-round">inbox</span>
                        <p>해당 조건의 거래 데이터가 없습니다</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = trades.map(trade => {
        const isApt = trade.trade_type === '아파트';
        const typeClass = isApt ? 'type-apt' : 'type-presale';
        const typeLabel = isApt ? '아파트' : '분양권';
        
        const amountText = formatAmount(trade.amount);
        const prevHighText = trade.previous_high ? formatAmount(trade.previous_high) : null;
        
        const newHighBadge = trade.is_newhigh ? 
            '<span class="newhigh-badge">🔥 신고가</span>' : '';
        
        return `
        <tr class="${trade.is_newhigh ? 'newhigh-row' : ''}">
            <td>
                <span class="type-badge ${typeClass}">${typeLabel}</span>
            </td>
            <td class="complex-cell">
                <span class="dong">${trade.dong || '-'}</span>
                <span class="apt-name">${trade.apt_name || '-'}</span>
                ${trade.construction_year ? `<span class="year">${trade.construction_year}년</span>` : ''}
                ${newHighBadge}
            </td>
            <td>${trade.area ? trade.area.toFixed(2) + '㎡' : '-'}</td>
            <td>${trade.floor || '-'}층</td>
            <td class="price-cell">
                <span class="price">${amountText}</span>
                ${prevHighText ? `<span class="prev-high">전고점: ${prevHighText}</span>` : ''}
            </td>
            <td>${formatDate(trade.contract_date)}</td>
            <td>
                <span class="trade-badge ${trade.transaction_type === '직거래' ? 'direct' : 'broker'}">
                    ${trade.transaction_type === '직거래' ? '직거래' : '중개'}
                </span>
            </td>
        </tr>
        `;
    }).join('');
}

// 금액 포맷 (억 단위)
function formatAmount(amount) {
    if (!amount) return '-';
    
    const eok = Math.floor(amount / 100000000);
    const man = Math.round((amount % 100000000) / 10000);
    
    if (eok > 0 && man > 0) {
        return `${eok}억 ${man.toLocaleString()}만`;
    } else if (eok > 0) {
        return `${eok}억`;
    } else {
        return `${man.toLocaleString()}만`;
    }
}

// 날짜 포맷
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

// ========== API 테스트 함수 ==========

// 목록 조회 테스트
async function testGetList() {
    const resultEl = document.getElementById('test-result');
    resultEl.className = 'test-result';
    resultEl.textContent = '🔄 테스트 중...';
    
    try {
        const startTime = Date.now();
        const response = await fetch(`${API_BASE}/trades?list=true`);
        const elapsed = Date.now() - startTime;
        
        // 먼저 텍스트로 받아서 확인
        const text = await response.text();
        
        let output = `📡 GET /api/trades?list=true
⏱️ 응답시간: ${elapsed}ms
📊 Status: ${response.status} ${response.statusText}
📄 Content-Type: ${response.headers.get('content-type') || 'none'}

📦 Raw Response:
${text || '(빈 응답)'}`;

        // JSON 파싱 시도
        if (text) {
            try {
                const data = JSON.parse(text);
                output += `

✅ JSON 파싱 성공:
${JSON.stringify(data, null, 2)}`;
                resultEl.className = 'test-result success';
            } catch (e) {
                output += `

⚠️ JSON 파싱 실패 - HTML이나 에러 페이지일 수 있음`;
                resultEl.className = 'test-result error';
            }
        } else {
            resultEl.className = 'test-result error';
        }
        
        resultEl.textContent = output;
        
    } catch (error) {
        resultEl.className = 'test-result error';
        resultEl.textContent = `❌ 네트워크 오류!
${error.message}

💡 확인사항:
1. functions 폴더가 업로드 되었는지?
2. 파일명이 trades.js 인지? (소문자)`;
    }
}

// 업로드 테스트 (샘플 데이터)
async function testUpload() {
    const resultEl = document.getElementById('test-result');
    resultEl.className = 'test-result';
    resultEl.textContent = '🔄 업로드 테스트 중...';
    
    // 샘플 데이터
    const testData = {
        selected_date: new Date().toISOString().split('T')[0],
        summary: {
            total_apt_count: 2,
            total_presale_count: 1,
            apt_newhigh_count: 1,
            presale_newhigh_count: 0
        },
        trades: [
            {
                trade_type: "아파트",
                district: "대구광역시 수성구 범어동",
                dong: "범어동",
                apt_name: "테스트아파트",
                area: 84.92,
                contract_date: "2026-01-15",
                amount: 500000000,
                floor: 10,
                construction_year: 2020,
                transaction_type: "중개",
                is_newhigh: true,
                previous_high: 480000000
            },
            {
                trade_type: "분양권",
                district: "대구광역시 달서구 신당동",
                dong: "신당동",
                apt_name: "테스트분양권",
                area: 59.98,
                contract_date: "2026-01-20",
                amount: 350000000,
                floor: 15,
                transaction_type: "직거래",
                is_newhigh: false
            }
        ]
    };
    
    try {
        const startTime = Date.now();
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': '3731'
            },
            body: JSON.stringify(testData)
        });
        const elapsed = Date.now() - startTime;
        
        // 먼저 텍스트로 받기
        const text = await response.text();
        
        let output = `📡 POST /api/upload
⏱️ 응답시간: ${elapsed}ms
📊 Status: ${response.status} ${response.statusText}
📄 Content-Type: ${response.headers.get('content-type') || 'none'}

📦 Raw Response:
${text || '(빈 응답)'}`;

        if (text) {
            try {
                const data = JSON.parse(text);
                output += `

✅ JSON 파싱 성공:
${JSON.stringify(data, null, 2)}`;
                resultEl.className = 'test-result ' + (data.success ? 'success' : 'error');
                
                if (data.success) {
                    setTimeout(() => loadDataList(), 1000);
                }
            } catch (e) {
                output += `

⚠️ JSON 파싱 실패 - API가 제대로 동작하지 않음`;
                resultEl.className = 'test-result error';
            }
        } else {
            resultEl.className = 'test-result error';
        }
        
        resultEl.textContent = output;
        
    } catch (error) {
        resultEl.className = 'test-result error';
        resultEl.textContent = `❌ 네트워크 오류!
${error.message}

💡 확인사항:
1. functions 폴더가 업로드 되었는지?
2. 파일명이 upload.js 인지? (소문자)
3. KV 바인딩(TRADES_KV)이 설정되었는지?`;
    }
}
