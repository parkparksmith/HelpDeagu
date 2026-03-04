document.addEventListener('DOMContentLoaded', () => {
    const listContainer = document.getElementById('hotdeal-list');
    const dateText = document.getElementById('deal-date-text');
    const prevBtn = document.getElementById('prev-date-btn');
    const nextBtn = document.getElementById('next-date-btn');

    let currentDate = new Date();
    const today = new Date();

    // YYYYMMDD string format
    function formatDateToString(date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}${mm}${dd}`;
    }

    function formatDisplayDate(date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}년 ${mm}월 ${dd}일 핫딜`;
    }

    const ogImageCache = {};

    async function loadOgImage(url, imgElement, placeholderElement) {
        if (!url || url === '#') {
            placeholderElement.innerHTML = `<span class="material-icons-round">shopping_bag</span><span>이미지 없음</span>`;
            return;
        }

        if (ogImageCache[url]) {
            if (ogImageCache[url] !== 'none') {
                imgElement.src = ogImageCache[url];
                imgElement.onload = () => imgElement.classList.add('loaded');
                placeholderElement.style.display = 'none';
            } else {
                setFallbackFavicon(url, imgElement, placeholderElement);
            }
            return;
        }

        // 빠른 타임아웃 설정을 위한 AbortController (2.5초)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        try {
            // 안정적이고 빠른 CORS 프록시 사용 (codetabs api)
            const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl, { signal: controller.signal });
            const htmlText = await response.text();
            clearTimeout(timeoutId);

            let ogImage = null;

            // 정규식으로 og:image 메타 태그의 URL을 초고속 추출
            const match1 = htmlText.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
            const match2 = htmlText.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

            if (match1 && match1[1]) {
                ogImage = match1[1];
            } else if (match2 && match2[1]) {
                ogImage = match2[1];
            }

            if (ogImage) {
                let imageUrl = ogImage;
                if (imageUrl.startsWith('/')) {
                    try {
                        const urlObj = new URL(url);
                        imageUrl = `${urlObj.origin}${imageUrl}`;
                    } catch (e) { }
                }

                ogImageCache[url] = imageUrl;
                imgElement.src = imageUrl;
                imgElement.onload = () => imgElement.classList.add('loaded');
                placeholderElement.style.display = 'none';
                return;
            }

            // og:image를 못 찾은 경우
            ogImageCache[url] = 'none';
            setFallbackFavicon(url, imgElement, placeholderElement);
        } catch (e) {
            clearTimeout(timeoutId);
            ogImageCache[url] = 'none';
            setFallbackFavicon(url, imgElement, placeholderElement);
        }
    }

    // 대체 이미지로 쇼핑몰 로고(Favicon) 사용 함수
    function setFallbackFavicon(url, imgElement, placeholderElement) {
        try {
            const domain = new URL(url).hostname;
            // 구글 Favicon API를 사용해 고해상도 로고 이미지 확보 (네트워크 지연 없음)
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
            imgElement.src = faviconUrl;
            imgElement.style.objectFit = 'contain';
            imgElement.style.padding = '20px'; // 아이콘이 너무 차지 않게 패딩 추가
            imgElement.onload = () => imgElement.classList.add('loaded');
            placeholderElement.style.display = 'none';
        } catch (e) {
            placeholderElement.innerHTML = `<span class="material-icons-round">shopping_bag</span><span>이미지 없음</span>`;
        }
    }

    // Attempt to load the most recent file starting from givenDate
    async function findLatestAvailableData(startDate) {
        let checkDate = new Date(startDate);
        let maxAttempts = 10;

        listContainer.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>핫딜 정보를 불러오는 중입니다...</p>
            </div>
        `;

        for (let i = 0; i < maxAttempts; i++) {
            const dateStr = formatDateToString(checkDate);

            // 1. GitHub Raw URL (로컬 환경 CORS 문제 해결 및 최신 데이터 즉시 반영)
            const rawUrl = `https://raw.githubusercontent.com/parkparksmith/HelpDeagu/main/Json/HotDeal/HotDeal_${dateStr}.json?t=${new Date().getTime()}`;
            // 2. 상대 경로 (GitHub Pages용 예비)
            const relativeUrl = `../Json/HotDeal/HotDeal_${dateStr}.json?t=${new Date().getTime()}`;

            // 먼저 Raw URL 시도 (항상 최신본)
            try {
                let response = await fetch(rawUrl);
                if (!response.ok) {
                    // Raw에 없으면 상대 경로로 시도
                    response = await fetch(relativeUrl);
                }

                if (response.ok) {
                    const data = await response.json();
                    return { date: checkDate, data: data };
                }
            } catch (error) {
                // CORS 등으로 Raw URL이 실패하면 상대 경로로 재시도
                try {
                    const fallbackResponse = await fetch(relativeUrl);
                    if (fallbackResponse.ok) {
                        const data = await fallbackResponse.json();
                        return { date: checkDate, data: data };
                    }
                } catch (e) {
                    console.error(`Error fetching data for ${dateStr}:`, e);
                }
            }

            // Go back 1 day
            checkDate.setDate(checkDate.getDate() - 1);
        }

        return null; // Not found in recent 10 days
    }

    function extractBestUrl(item) {
        if (item.ShortenUrl && item.ShortenUrl.trim() !== '') return item.ShortenUrl;
        if (item.ProfitLink && item.ProfitLink.trim() !== '') return item.ProfitLink;

        if (item.GetUrl && item.GetUrl.trim() !== '') {
            const urls = item.GetUrl.split(/[\r\n]+/);
            if (urls.length > 0) return urls[0].trim();
        }
        return '#'; // Fallback
    }

    function formatTime(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        } catch (e) {
            return dateStr;
        }
    }

    function renderHotDeals(data) {
        if (!data || !data.list || data.list.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">sentiment_dissatisfied</span>
                    <p>해당 날짜에 등록된 핫딜 정보가 없습니다.</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';

        let renderCount = 0;

        data.list.forEach((item, index) => {
            const bestUrl = extractBestUrl(item);

            // ShortenUrl > ProfitLink > GetUrl 셋 다 없으면 건너뜀
            if (bestUrl === '#') return;

            renderCount++;

            const card = document.createElement('a');

            card.href = bestUrl;
            card.target = '_blank';
            card.className = 'hotdeal-card';
            card.rel = 'noopener noreferrer';

            // Extract store name from title if it exists (e.g., "지마켓)", "토스)")
            let displayTitle = item.Title;
            let storeTagHtml = '';
            const match = item.Title.match(/^([가-힣a-zA-Z0-9]+)\)/);
            if (match) {
                storeTagHtml = `<span class="hotdeal-store">${match[1]}</span>`;
                displayTitle = item.Title.substring(match[0].length).trim();
            }

            const timeStr = formatTime(item.WroteDate);

            const imageId = `hotdeal-img-${index}`;
            const placeholderId = `hotdeal-ph-${index}`;

            card.innerHTML = `
                <div class="hotdeal-image-container">
                    <div id="${placeholderId}" class="hotdeal-image-placeholder">
                        <span class="material-icons-round">image</span>
                        <span>이미지 불러오는 중...</span>
                    </div>
                    <img id="${imageId}" class="hotdeal-image" src="" alt="미리보기" />
                </div>
                <div class="hotdeal-card-content">
                    <div class="hotdeal-category">
                        ${storeTagHtml}
                    </div>
                    <h3 class="hotdeal-title">${displayTitle}</h3>
                    
                    <div class="hotdeal-stats">
                        <div class="stat-item" title="조회수">
                            <span class="material-icons-round">visibility</span>
                            ${item.ViewCount?.toLocaleString() || 0}
                        </div>
                        <div class="stat-item" title="추천수">
                            <span class="material-icons-round">thumb_up</span>
                            ${item.LikeCount?.toLocaleString() || 0}
                        </div>
                    </div>
                    
                    <div class="hotdeal-footer">
                        <span class="hotdeal-time">
                            <span class="material-icons-round" style="font-size: 14px; vertical-align: middle;">schedule</span>
                            ${timeStr}
                        </span>
                        <span class="hotdeal-btn">
                            바로가기
                            <span class="material-icons-round" style="font-size: 16px;">arrow_forward</span>
                        </span>
                    </div>
                </div>
            `;

            listContainer.appendChild(card);

            // 이미지 섬네일 비동기 로드 시도 (시간차를 줄여서 빠르게 뜨게 함)
            setTimeout(() => {
                const imgEl = document.getElementById(imageId);
                const phEl = document.getElementById(placeholderId);
                if (imgEl && phEl) {
                    loadOgImage(bestUrl, imgEl, phEl);
                }
            }, 50 + (index * 15));
        });

        if (renderCount === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">sentiment_dissatisfied</span>
                    <p>유효한 구매 링크가 있는 핫딜 정보가 없습니다.</p>
                </div>
            `;
        }
    }

    function updateDateButtons() {
        // Disable next button if current date is today or later
        const isToday = formatDateToString(currentDate) === formatDateToString(today);
        nextBtn.disabled = isToday;
    }

    async function loadDataForDate(targetDate) {
        const result = await findLatestAvailableData(targetDate);

        const lastUpdatedElem = document.getElementById('last-updated-time');

        if (result) {
            currentDate = result.date;
            dateText.textContent = formatDisplayDate(currentDate);

            if (lastUpdatedElem) {
                if (result.data.created_date) {
                    lastUpdatedElem.textContent = `업데이트: ${result.data.created_date}`;
                } else {
                    lastUpdatedElem.textContent = '';
                }
            }

            renderHotDeals(result.data);
        } else {
            // Not found at all
            currentDate = targetDate;
            dateText.textContent = formatDisplayDate(currentDate);

            if (lastUpdatedElem) {
                lastUpdatedElem.textContent = '';
            }

            listContainer.innerHTML = `
                <div class="error-state">
                    <span class="material-icons-round">error_outline</span>
                    <p>해당 날짜 및 최근 며칠 동안의 핫딜 정보를 찾을 수 없습니다.</p>
                </div>
            `;
        }
        updateDateButtons();
    }

    prevBtn.addEventListener('click', () => {
        let prevDate = new Date(currentDate);
        prevDate.setDate(prevDate.getDate() - 1);
        loadDataForDate(prevDate);
    });

    nextBtn.addEventListener('click', () => {
        let nxtDate = new Date(currentDate);
        nxtDate.setDate(nxtDate.getDate() + 1);
        if (nxtDate <= today) {
            loadDataForDate(nxtDate);
        }
    });

    // Initialize with today's date
    loadDataForDate(today);
});
