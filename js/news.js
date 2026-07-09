// 뉴스 데이터 로딩 공통 모듈
(function () {
    const GITHUB_OWNER = 'parkparksmith';
    const GITHUB_REPO = 'HelpDeagu';
    const GITHUB_BRANCH = 'main';
    const MAX_ITEMS = 10;
    const KAKAO_LINK = 'https://open.kakao.com/o/gqiXwwL';

    // ── 날짜/시간 파싱 ──────────────────────────────────────────

    function parseNewsDate(dateStr) {
        if (!dateStr) return '';
        const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/);
        if (m) return `${m[1]}년 ${parseInt(m[2])}월 ${parseInt(m[3])}일 ${m[4]}:${m[5]}`;
        return dateStr;
    }

    function parseCreateTime(str) {
        if (!str) return '';
        if (str.includes('T')) {
            const d = new Date(str);
            if (!isNaN(d)) {
                const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
                const mo = String(kst.getUTCMonth() + 1).padStart(2, '0');
                const dd = String(kst.getUTCDate()).padStart(2, '0');
                const hh = String(kst.getUTCHours()).padStart(2, '0');
                const mi = String(kst.getUTCMinutes()).padStart(2, '0');
                return `${mo}/${dd} ${hh}:${mi}`;
            }
        }
        const m = str.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2}:\d{2})$/);
        if (m) return `${m[2]}/${m[3]} ${m[4]}`;
        return str;
    }

    // 파일명에서 날짜(YYYY-MM-DD)와 표시 레이블 추출
    // 예: DailyNews_202606071123.json → { date: '2026-06-07', label: '2026-06-07 11:23' }
    function parseFilenameDate(name) {
        const m = name.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\.json$/);
        if (!m) return null;
        return {
            date: `${m[1]}-${m[2]}-${m[3]}`,
            label: `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`
        };
    }

    // ── GitHub API ───────────────────────────────────────────────

    async function getFileList(folder) {
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/Json/${folder}?ref=${GITHUB_BRANCH}`;
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`디렉터리 목록 조회 실패: ${resp.status}`);
        const data = await resp.json();
        if (!Array.isArray(data)) throw new Error('파일 목록을 불러올 수 없습니다.');
        return data;
    }

    async function fetchJsonFile(folder, filename) {
        const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/Json/${folder}/${filename}?t=${Date.now()}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`파일 로드 실패: ${filename}`);
        return await resp.json();
    }

    // ── 뉴스 아이템 로딩 ────────────────────────────────────────

    // jsonFiles: 이미 정렬된 파일 목록 (내림차순)
    // mode: 'latest' | 'all'
    async function loadNewsItemsFromFiles(folder, mode, jsonFiles) {
        let allItems = [];
        let usedDates = [];
        let latestDate = null;

        for (const file of jsonFiles) {
            if (allItems.length >= MAX_ITEMS) break;
            try {
                const data = await fetchJsonFile(folder, file.name);
                if (!data.news_items || data.news_items.length === 0) continue;

                if (mode === 'latest') {
                    if (latestDate === null) {
                        latestDate = data.date;
                    } else if (data.date !== latestDate) {
                        break;
                    }
                }

                const needed = MAX_ITEMS - allItems.length;
                const sorted = [...data.news_items].sort((a, b) => (a.rank || 999) - (b.rank || 999));
                const items = sorted.slice(0, needed).map(item => ({
                    ...item,
                    _fileDate: data.date,
                    _fileTitle: data.title || ''
                }));
                allItems = allItems.concat(items);
                if (!usedDates.includes(data.date)) usedDates.push(data.date);
            } catch (e) {
                console.warn(`[news.js] ${file.name} 로드 실패:`, e.message);
            }
        }
        return { items: allItems, dates: usedDates };
    }

    // 단일 파일 로딩
    async function loadSingleFileData(folder, filename) {
        const data = await fetchJsonFile(folder, filename);
        if (!data.news_items || data.news_items.length === 0) return { items: [], dates: [] };
        const sorted = [...data.news_items].sort((a, b) => (a.rank || 999) - (b.rank || 999));
        const items = sorted.map(item => ({
            ...item,
            _fileDate: data.date,
            _fileTitle: data.title || ''
        }));
        return { items, dates: [data.date] };
    }

    // ── 렌더링 ───────────────────────────────────────────────────

    function buildDateInfoText(dates) {
        if (!dates || dates.length === 0) return '';
        if (dates.length === 1) return `기준: ${parseNewsDate(dates[0])}`;
        return `기준: ${parseNewsDate(dates[0])} ~ ${parseNewsDate(dates[dates.length - 1])}`;
    }

    function renderNewsCards(items, container) {
        container.innerHTML = '';
        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="news-empty">
                    <span class="material-icons-round">feed</span>
                    <p>뉴스 데이터가 없습니다.</p>
                </div>`;
            return;
        }

        let lastDate = null;
        items.forEach((item, idx) => {
            const rank = item.rank || (idx + 1);
            const dateStr = parseNewsDate(item._fileDate);
            const createTimeStr = parseCreateTime(item.createTime);
            const isTop3 = rank <= 3;

            if (item._fileDate !== lastDate && idx > 0) {
                const divider = document.createElement('div');
                divider.className = 'news-date-divider';
                divider.textContent = dateStr;
                container.appendChild(divider);
            }
            lastDate = item._fileDate;

            const card = document.createElement('div');
            card.className = 'news-card';

            const summaryItems = (item.summary || [])
                .map(s => `<li>${escapeHtml(s)}</li>`)
                .join('');

            card.innerHTML = `
                <div class="news-card-header">
                    <span class="news-rank ${isTop3 ? 'top3' : ''}">${rank}</span>
                    <div class="news-header-meta">
                        <span class="news-date-badge">${dateStr}</span>
                        ${createTimeStr ? `<span class="news-create-time"><span class="material-icons-round">edit_calendar</span>${createTimeStr}</span>` : ''}
                    </div>
                </div>
                <div class="news-card-body">
                    <h3 class="news-headline">${escapeHtml(item.headline || item.original_title || '')}</h3>
                    ${item.core_data ? `<p class="news-core-data">${escapeHtml(item.core_data)}</p>` : ''}
                    ${summaryItems ? `<div class="news-summary-inline"><ul>${summaryItems}</ul></div>` : ''}
                    <div class="news-card-actions">
                        ${item.news_url ? `
                        <a href="${item.news_url}" target="_blank" rel="noopener noreferrer" class="news-link-btn">
                            <span class="material-icons-round">open_in_new</span>
                            기사 보기
                        </a>` : ''}
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    // ── 복사 기능 ────────────────────────────────────────────────

    function buildInfographicText(items, dates) {
        const title = (items[0] && items[0]._fileTitle) ? items[0]._fileTitle : '뉴스 모음';
        const dateStr = dates.length ? `기준: ${parseNewsDate(dates[0])}` : '';
        const lines = [`📰 ${title}`, dateStr, ''];

        items.forEach(item => {
            const rank = item.rank || '';
            lines.push(`${rank}. ${item.headline || item.original_title || ''}`);
            if (item.core_data) lines.push(`▶ ${item.core_data}`);
            if (item.createTime) lines.push(`🕐 작성: ${parseCreateTime(item.createTime)}`);
            (item.summary || []).forEach(s => lines.push(`• ${s}`));
            lines.push('');
        });

        lines.push(`👉 대구살료(대구부동산톡) ${KAKAO_LINK}`);
        return lines.join('\n');
    }

    function buildKakaoText(items, dates) {
        const title = (items[0] && items[0]._fileTitle) ? items[0]._fileTitle : '뉴스 모음';
        const dateStr = dates.length ? `기준: ${parseNewsDate(dates[0])}` : '';
        const lines = [`📰 ${title}`, dateStr, ''];

        items.forEach(item => {
            const rank = item.rank || '';
            lines.push(`${rank}. ${item.headline || item.original_title || ''}`);
            (item.summary || []).forEach(s => lines.push(`• ${s}`));
            if (item.news_url) lines.push(`🔗 기사: ${item.news_url}`);
            lines.push('');
        });

        lines.push(`👉 대구살료(대구부동산톡) ${KAKAO_LINK}`);
        return lines.join('\n');
    }

    function renderCopyButtons(actionsEl, items, dates) {
        if (!actionsEl || !items || items.length === 0) return;
        actionsEl.style.display = '';
        actionsEl.innerHTML = `
            <button class="copy-btn copy-btn-infographic" id="btn-copy-infographic">
                <span class="material-icons-round">image</span>
                인포그래픽용 복사
            </button>
            <button class="copy-btn copy-btn-kakao" id="btn-copy-kakao">
                <span class="material-icons-round">chat</span>
                카톡 배포용 복사
            </button>
        `;
        actionsEl.querySelector('#btn-copy-infographic').addEventListener('click', async function () {
            try {
                await navigator.clipboard.writeText(buildInfographicText(items, dates));
                showCopyFeedback(this, '복사 완료!');
            } catch { showCopyFeedback(this, '복사 실패'); }
        });
        actionsEl.querySelector('#btn-copy-kakao').addEventListener('click', async function () {
            try {
                await navigator.clipboard.writeText(buildKakaoText(items, dates));
                showCopyFeedback(this, '복사 완료!');
            } catch { showCopyFeedback(this, '복사 실패'); }
        });
    }

    function showCopyFeedback(btn, msg) {
        const original = btn.innerHTML;
        btn.innerHTML = `<span class="material-icons-round">check_circle</span> ${msg}`;
        btn.classList.add('copy-btn-done');
        setTimeout(() => { btn.innerHTML = original; btn.classList.remove('copy-btn-done'); }, 2000);
    }

    // ── 날짜 필터 UI ─────────────────────────────────────────────

    function renderDateFilter(filterEl, folder, mode, jsonFiles) {
        if (!filterEl) return;

        // 파일명에서 날짜 목록 추출 (중복 제거, 내림차순)
        const dateSet = new Set();
        jsonFiles.forEach(f => {
            const parsed = parseFilenameDate(f.name);
            if (parsed) dateSet.add(parsed.date);
        });
        const availableDates = [...dateSet].sort((a, b) => b.localeCompare(a));

        filterEl.innerHTML = `
            <div class="date-filter-row">
                <button class="latest-news-btn active" id="btn-latest-news">
                    <span class="material-icons-round">update</span>
                    최근뉴스
                </button>
                <div class="date-filter-inputs">
                    <input type="date" id="news-date-input" class="news-date-input"
                        min="${availableDates[availableDates.length - 1] || ''}"
                        max="${availableDates[0] || ''}">
                    <select id="news-file-select" class="news-file-select" disabled>
                        <option value="">날짜를 먼저 선택하세요</option>
                    </select>
                </div>
            </div>
        `;

        const latestBtn = filterEl.querySelector('#btn-latest-news');
        const dateInput = filterEl.querySelector('#news-date-input');
        const fileSelect = filterEl.querySelector('#news-file-select');

        const container = document.getElementById('news-list');
        const dateInfoEl = document.getElementById('news-date-info');
        const copyActionsEl = document.getElementById('news-copy-actions');

        function showLoading() {
            container.innerHTML = `
                <div class="news-loading">
                    <div class="spinner"></div>
                    <p>뉴스를 불러오는 중입니다...</p>
                </div>`;
            if (copyActionsEl) copyActionsEl.style.display = 'none';
        }

        function showResult(items, dates) {
            if (dateInfoEl) {
                if (dates.length) {
                    dateInfoEl.innerHTML = `<span class="material-icons-round">schedule</span> ${buildDateInfoText(dates)}`;
                    dateInfoEl.style.display = '';
                } else {
                    dateInfoEl.style.display = 'none';
                }
            }
            if (items.length === 0) {
                container.innerHTML = `
                    <div class="news-empty">
                        <span class="material-icons-round">search_off</span>
                        <p>해당 날짜의 뉴스 데이터가 없습니다.</p>
                    </div>`;
                return;
            }
            renderNewsCards(items, container);
            renderCopyButtons(copyActionsEl, items, dates);
        }

        // 최근뉴스 버튼
        latestBtn.addEventListener('click', async () => {
            latestBtn.classList.add('active');
            dateInput.value = '';
            fileSelect.innerHTML = '<option value="">날짜를 먼저 선택하세요</option>';
            fileSelect.disabled = true;
            showLoading();
            try {
                const { items, dates } = await loadNewsItemsFromFiles(folder, mode, jsonFiles);
                showResult(items, dates);
            } catch (err) {
                container.innerHTML = `<div class="news-error"><span class="material-icons-round">error_outline</span><p>${escapeHtml(err.message)}</p></div>`;
            }
        });

        // 날짜 선택 → 콤보박스 채우기
        dateInput.addEventListener('change', () => {
            const selected = dateInput.value; // YYYY-MM-DD
            if (!selected) return;

            latestBtn.classList.remove('active');

            const matchingFiles = jsonFiles.filter(f => {
                const parsed = parseFilenameDate(f.name);
                return parsed && parsed.date === selected;
            });

            if (matchingFiles.length === 0) {
                fileSelect.innerHTML = '<option value="">해당 날짜의 파일이 없습니다</option>';
                fileSelect.disabled = true;
                return;
            }

            // 최신순 정렬 후 콤보박스 채우기
            fileSelect.innerHTML = matchingFiles
                .sort((a, b) => b.name.localeCompare(a.name))
                .map(f => {
                    const parsed = parseFilenameDate(f.name);
                    return `<option value="${f.name}">${parsed ? parsed.label : f.name}</option>`;
                }).join('');
            fileSelect.disabled = false;

            // 첫 번째 파일 자동 로드
            loadFile(fileSelect.value);
        });

        // 콤보박스 파일 선택
        fileSelect.addEventListener('change', () => {
            if (fileSelect.value) loadFile(fileSelect.value);
        });

        async function loadFile(filename) {
            showLoading();
            try {
                const { items, dates } = await loadSingleFileData(folder, filename);
                showResult(items, dates);
            } catch (err) {
                container.innerHTML = `<div class="news-error"><span class="material-icons-round">error_outline</span><p>${escapeHtml(err.message)}</p></div>`;
            }
        }
    }

    // ── 유틸 ─────────────────────────────────────────────────────

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── 초기화 ───────────────────────────────────────────────────

    async function initNewsPage(folder, mode) {
        const container = document.getElementById('news-list');
        const dateInfoEl = document.getElementById('news-date-info');
        const copyActionsEl = document.getElementById('news-copy-actions');
        const filterEl = document.getElementById('news-date-filter');

        if (!container) return;

        container.innerHTML = `
            <div class="news-loading">
                <div class="spinner"></div>
                <p>뉴스를 불러오는 중입니다...</p>
            </div>`;

        try {
            // 파일 목록 한 번만 가져오기
            const files = await getFileList(folder);
            const jsonFiles = files
                .filter(f => f.type === 'file' && f.name.endsWith('.json'))
                .sort((a, b) => b.name.localeCompare(a.name));

            // 날짜 필터 UI 렌더링 (파일 목록 재활용)
            renderDateFilter(filterEl, folder, mode || 'all', jsonFiles);

            // 초기 뉴스 로딩 (최신)
            const { items, dates } = await loadNewsItemsFromFiles(folder, mode || 'all', jsonFiles);

            if (dateInfoEl) {
                if (dates.length) {
                    dateInfoEl.innerHTML = `<span class="material-icons-round">schedule</span> ${buildDateInfoText(dates)}`;
                    dateInfoEl.style.display = '';
                } else {
                    dateInfoEl.style.display = 'none';
                }
            }

            if (items.length === 0) {
                container.innerHTML = `
                    <div class="news-empty">
                        <span class="material-icons-round">search_off</span>
                        <p>현재 뉴스 데이터를 찾을 수 없습니다.</p>
                        <p style="font-size:0.8rem;">잠시 후 다시 시도해주세요.</p>
                    </div>`;
                return;
            }

            renderNewsCards(items, container);
            renderCopyButtons(copyActionsEl, items, dates);
        } catch (err) {
            console.error('[news.js] 로드 오류:', err);
            container.innerHTML = `
                <div class="news-error">
                    <span class="material-icons-round">error_outline</span>
                    <p>뉴스를 불러오는 중 오류가 발생했습니다.</p>
                    <p style="font-size:0.8rem;">${escapeHtml(err.message)}</p>
                </div>`;
        }
    }

    window.initNewsPage = initNewsPage;
})();
