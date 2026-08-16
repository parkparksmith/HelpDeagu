# -*- coding: utf-8 -*-
"""
대구 고시공고 수집 스크립트
대구시청과 각 구청 고시공고 게시판에서 담당부서 검색어로 목록을 가져와
Json/Gosi/gosi_<기관ID>.json 으로 저장한다.

사용법:
    python fetch_gosi.py

저장 후 git commit/push 하면 사이트(pages/gosi-info.html)에 반영된다.

게시판 시스템 종류:
- daegu   : 대구시청 고시공고 (자체 시스템, fn_goLinkView 링크)
- icms    : 대구시청 분야별 소식 게시판 (fn_icms_navi_common 링크)
- eminwon : 새올 전자민원 (중구/수성구/달서구/달성군, searchDetail 링크)
- saeol   : 새올 포털형 (동구/서구, data-action 링크)
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "Json" / "Gosi"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def eminwon_urls(host, sub_check="Y", yyyy=None, page_size=10):
    """새올 전자민원(eminwon) 고시공고 목록/상세 URL 생성 (구청 공통)
    initValue=Y 가 없으면 검색 필터가 무시된다. subCheck/yyyy 값은 기관마다 다르다.
    """
    common = (
        f"https://{host}/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do"
        "?jndinm=OfrNotAncmtEJB&context=NTIS"
    )
    yyyy_param = f"&yyyy={yyyy}" if yyyy else ""
    list_url = (
        common
        + "&method=selectListOfrNotAncmt&methodnm=selectListOfrNotAncmtHomepage"
        + f"&homepage_pbs_yn=Y&subCheck={sub_check}&ofr_pageSize={page_size}"
        + "&not_ancmt_se_code=01%2C04&initValue=Y&countYn=Y" + yyyy_param
    )
    view_url = (
        common
        + "&method=selectOfrNotAncmt&methodnm=selectOfrNotAncmtRegst"
        + f"&homepage_pbs_yn=Y&subCheck={sub_check}"
        + "&title=%EA%B3%A0%EC%8B%9C%EA%B3%B5%EA%B3%A0"
    )
    return list_url, view_url


_JUNG_LIST, _JUNG_VIEW = eminwon_urls("eminwon.jung.daegu.kr", "Y", yyyy=2018)
_SUSEONG_LIST, _SUSEONG_VIEW = eminwon_urls("eminwon.suseong.kr", "N")
_DALSEO_LIST, _DALSEO_VIEW = eminwon_urls("eminwon.dalseo.daegu.kr", "Y", yyyy=2013)
# 달성군은 서버측 담당부서 검색이 동작하지 않아 50건을 받아 자체 필터링한다
_DALSEONG_LIST, _DALSEONG_VIEW = eminwon_urls("eminwon.dalseong.daegu.kr", "Y", page_size=50)

# 기관별 설정 (구청 추가 시 여기에 항목을 늘린다)
SOURCES = {
    "daegu": {
        "name": "대구시청 고시공고",
        "boardUrl": "https://www.daegu.go.kr/index.do?menu_id=00940170",
        "listUrl": "https://www.daegu.go.kr/index.do?menu_id=00940170"
                   "&menu_link=/front/daeguSidoGosi/daeguSidoGosiList.do",
        "viewUrl": "https://www.daegu.go.kr/index.do?menu_id=00940170"
                   "&menu_link=/front/daeguSidoGosi/daeguSidoGosiView.do",
        "depts": ["도시", "주택", "건설", "건축", "토지"],  # 부서명 부분검색 키워드 (검색별 결과를 병합)
        "titles": ["재건축", "재개발"],  # 제목 검색 키워드 (부서 검색과 별개로 병합)
        "deptQuery": "searchDept_nm={kw}",
        "titleQuery": "searchField=TITLE&searchTitle={kw}",
        "parser": "daegu",
    },
    "daegu_build": {
        "name": "대구시청 도시/주택/건설 소식",
        "boardUrl": "https://www.daegu.go.kr/build/index.do?menu_id=00001338",
        "listUrl": "https://www.daegu.go.kr/build/index.do?menu_id=00001338"
                   "&menu_link=/icms/bbs/selectBoardList.do&bbsId=BBS_00153",
        "viewUrl": "https://www.daegu.go.kr/build/index.do?menu_id=00001338"
                   "&menu_link=/icms/bbs/selectBoardArticle.do&bbsId=BBS_00153",
        "depts": [],  # 부서 필터 없이 전체 목록
        "titles": [],  # 이 게시판은 제목 검색 제외
        "parser": "icms",
    },
    "jung": {
        "name": "중구청 고시공고",
        "boardUrl": "https://www.jung.daegu.kr/new/pages/administration/page.html?mc=0159",
        "listUrl": _JUNG_LIST,
        "viewUrl": _JUNG_VIEW,
        "depts": ["도시디자인", "주택", "건설"],
        "titles": ["재건축", "재개발"],
        "deptQuery": "dept_nm={kw}",
        "titleQuery": "not_ancmt_sj={kw}",
        "parser": "eminwon",
    },
    "suseong": {
        "name": "수성구청 고시공고",
        "boardUrl": "https://www.suseong.kr/index.do?menu_id=00000064",
        "listUrl": _SUSEONG_LIST,
        "viewUrl": _SUSEONG_VIEW,
        "depts": ["도시디자인", "건축", "건설"],
        "titles": ["재건축", "재개발"],
        "deptQuery": "dept_nm={kw}",
        "titleQuery": "not_ancmt_sj={kw}",
        "parser": "eminwon",
    },
    "dalseo": {
        "name": "달서구청 고시공고",
        "boardUrl": "https://www.dalseo.daegu.kr/index.do?menu_id=10000104",
        "listUrl": _DALSEO_LIST,
        "viewUrl": _DALSEO_VIEW,
        "depts": ["도시디자인", "건설", "건축", "토지정보"],
        "titles": ["재건축", "재개발"],
        "deptQuery": "dept_nm={kw}",
        "titleQuery": "not_ancmt_sj={kw}",
        "parser": "eminwon",
    },
    "dong": {
        "name": "동구청 고시공고",
        "boardUrl": "https://dong.daegu.kr/portal/saeol/gosi/list.do?seCode=01&mid=0201020000",
        "origin": "https://dong.daegu.kr",
        "listUrl": "https://dong.daegu.kr/portal/saeol/gosi/list.do"
                   "?seCode=01&mid=0201020000",
        "depts": ["도시", "주택", "건설", "토지"],
        "titles": ["재건축", "재개발"],
        "deptQuery": "searchType=dnm&searchTxt={kw}",
        "titleQuery": "searchType=tit&searchTxt={kw}",
        "pageField": "page",
        "parser": "saeol",
    },
    "seogu": {
        "name": "서구청 고시공고",
        "boardUrl": "https://www.dgs.go.kr/portal/saeol/gosi/list.do?seCode=01&endYn=N&mid=0601020100",
        "origin": "https://www.dgs.go.kr",
        "listUrl": "https://www.dgs.go.kr/portal/saeol/gosi/list.do"
                   "?seCode=01&endYn=N&mid=0601020100",
        "depts": ["도시", "건축", "건설"],
        "titles": ["재건축", "재개발"],
        "deptQuery": "searchType=dnm&searchTxt={kw}",
        "titleQuery": "searchType=tit&searchTxt={kw}",
        "pageField": "page",
        "parser": "saeol",
    },
    "dalseong": {
        "name": "달성군청 고시공고",
        "boardUrl": "https://www.dalseong.daegu.kr/index.do?menu_id=00000194",
        "listUrl": _DALSEONG_LIST,
        "viewUrl": _DALSEONG_VIEW,
        "depts": ["건설", "도시", "건축", "토지"],
        "titles": ["재건축", "재개발"],
        # 서버측 담당부서 검색이 무시되어 목록 50건을 받아 자체 필터링 (제목 검색은 서버측 동작)
        "deptFilter": "client",
        "titleQuery": "not_ancmt_sj={kw}",
        "parser": "eminwon",
    },
}


def clean_text(text):
    """HTML 태그 제거 및 엔티티 디코딩"""
    text = re.sub(r"<[^>]*>", "", text)
    replacements = {
        "&amp;": "&", "&apos;": "'", "&#39;": "'", "&quot;": '"',
        "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&#160;": " ",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return re.sub(r"\s+", " ", text).strip()


def fetch_html(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept-Language": "ko-KR,ko;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", errors="replace")


def parse_daegu_list(html, source):
    """대구시청 고시공고 목록 파싱
    행 구조: 번호 / 제목(fn_goLinkView('sno','gbn')) / 부서명 / 게재일자 / 조회
    """
    items = []
    table_match = re.search(r'<table id="bbsList"[\s\S]*?<tbody>([\s\S]*?)</tbody>', html)
    if not table_match:
        return items

    for row in re.finditer(r"<tr[^>]*>([\s\S]*?)</tr>", table_match.group(1)):
        tr = row.group(1)
        link_match = re.search(r"fn_goLinkView\('(\d+)',\s*'([A-Z])'\)\">([\s\S]*?)</a>", tr)
        if not link_match:
            continue  # 데이터 행이 아닌 경우 ("등록된 자료가 없습니다" 등)

        cells = {}
        hide_vals = []
        for td in re.finditer(r'<td[^>]*data-table-type="([^"]+)"[^>]*>([\s\S]*?)</td>', tr):
            text = clean_text(td.group(2))
            if td.group(1) == "hide_t":
                hide_vals.append(text)
            else:
                cells[td.group(1)] = text

        items.append({
            "no": cells.get("number", ""),
            "title": clean_text(link_match.group(3)),
            "dept": hide_vals[0] if hide_vals else "",
            "date": cells.get("date", ""),
            "views": hide_vals[1] if len(hide_vals) > 1 else "",
            "url": f"{source['viewUrl']}&sno={link_match.group(1)}&gosi_gbn={link_match.group(2)}",
        })
    return items


def parse_icms_list(html, source):
    """icms 공통 게시판(도시/주택/건설 소식 등) 목록 파싱
    행 구조: 번호 / 제목(fn_icms_navi_common('view','nttId')) / 작성자 / 등록일 / 조회
    """
    items = []
    table_match = re.search(r'<table id="bbsList"[\s\S]*?<tbody>([\s\S]*?)</tbody>', html)
    if not table_match:
        return items

    for row in re.finditer(r"<tr[^>]*>([\s\S]*?)</tr>", table_match.group(1)):
        tr = row.group(1)
        link_match = re.search(r"fn_icms_navi_common\('view',\s*'(\d+)'\)[^>]*>([\s\S]*?)</a>", tr)
        if not link_match:
            continue

        cells = {}
        hide_vals = []
        for td in re.finditer(r'<td[^>]*data-table-type="([^"]+)"[^>]*>([\s\S]*?)</td>', tr):
            text = clean_text(td.group(2))
            if td.group(1) == "hide_t":
                hide_vals.append(text)
            else:
                cells[td.group(1)] = text

        items.append({
            "no": cells.get("number", ""),
            "title": clean_text(link_match.group(2)),
            "dept": hide_vals[0] if hide_vals else "",  # 이 게시판은 부서 대신 작성자
            "date": cells.get("date", ""),
            "views": hide_vals[1] if len(hide_vals) > 1 else "",
            "url": f"{source['viewUrl']}&nttId={link_match.group(1)}",
        })
    return items


def parse_eminwon_list(html, source):
    """새올 전자민원(eminwon) 고시공고 목록 파싱 (구청 공통)
    기관마다 마크업이 조금씩 다르다:
    - 중구: class="boardList", td 에 data-table-type 없음 (순서 고정)
    - 수성/달서/달성: id="bbsList", td 에 data-table-type(dpt/date/subject 등) 있음
    """
    items = []
    table_match = re.search(
        r'<table[^>]*(?:id="bbsList"|class="boardList)[\s\S]*?<tbody>([\s\S]*?)</tbody>', html
    )
    if not table_match:
        return items

    for row in re.finditer(r"<tr[^>]*>([\s\S]*?)</tr>", table_match.group(1)):
        tr = row.group(1)
        id_match = re.search(r"searchDetail\('(\d+)'\)", tr)
        if not id_match:
            continue

        tds = [(m.group(1), clean_text(m.group(2)))
               for m in re.finditer(r"<td([^>]*)>([\s\S]*?)</td>", tr)]
        texts = [t for _, t in tds]

        def td_by_type(t):
            for attrs, text in tds:
                if f'data-table-type="{t}"' in attrs:
                    return text
            return None

        # 제목: subject 셀의 링크 텍스트, 없으면(중구) 행의 마지막 searchDetail 링크 텍스트
        subject_td = re.search(r'<td[^>]*data-table-type="subject"[^>]*>([\s\S]*?)</td>', tr)
        if subject_td:
            a = re.search(r"<a[^>]*>([\s\S]*?)</a>", subject_td.group(1))
            title = clean_text(a.group(1)) if a else clean_text(subject_td.group(1))
        else:
            links = re.findall(r"searchDetail\('\d+'\)[^>]*>([\s\S]*?)</a>", tr)
            title = clean_text(links[-1]) if links else ""

        # 공고번호("대구광역시 ○○구 공고 제2026-748호")에서 짧은 번호만 추출
        no = ""
        for text in texts:
            no_match = re.search(r"제?\s*(\d{4}-\d+)\s*호", text)
            if no_match:
                no = no_match.group(1)
                break

        dept = td_by_type("dpt")
        if dept is None:
            dept = texts[3] if len(texts) > 3 else ""

        # 등록일: date 타입 셀 우선, 그 외에는 날짜 형식 셀 탐색
        date = td_by_type("date")
        if not date or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            date = next((t for t in texts if re.fullmatch(r"\d{4}-\d{2}-\d{2}", t)), "")

        views = texts[-1] if texts and texts[-1].isdigit() else ""

        items.append({
            "no": no,
            "title": title,
            "dept": dept,
            "date": date,
            "views": views,
            "url": f"{source['viewUrl']}&not_ancmt_mgt_no={id_match.group(1)}",
        })
    return items


def parse_saeol_list(html, source):
    """새올 포털형(saeol) 고시공고 목록 파싱 (동구/서구)
    행 구조: 번호 / 공고번호 / 제목(a[data-action=view.do]) / 담당부서 / 등록일
    """
    items = []
    table_match = re.search(r"<tbody>([\s\S]*?)</tbody>", html)
    if not table_match:
        return items

    for row in re.finditer(r"<tr[^>]*>([\s\S]*?)</tr>", table_match.group(1)):
        tr = row.group(1)
        link_match = re.search(
            r'data-action="([^"]*notAncmtMgtNo=[^"]*)"[^>]*>([\s\S]*?)</a>', tr
        )
        if not link_match:
            continue

        tds = [(m.group(1), clean_text(m.group(2)))
               for m in re.finditer(r"<td([^>]*)>([\s\S]*?)</td>", tr)]

        def td_by_class(cls):
            for attrs, text in tds:
                if cls in attrs:
                    return text
            return ""

        no = ""
        for _, text in tds:
            no_match = re.search(r"제?\s*(\d{4}-\d+)\s*호", text)
            if no_match:
                no = no_match.group(1)
                break

        path = link_match.group(1).replace("&amp;", "&")
        items.append({
            "no": no,
            "title": clean_text(link_match.group(2)),
            "dept": td_by_class("list_dept"),
            "date": td_by_class("list_date"),
            "views": "",
            "url": f"{source['origin']}{path}",
        })
    return items


PARSERS = {
    "daegu": parse_daegu_list,
    "icms": parse_icms_list,
    "eminwon": parse_eminwon_list,
    "saeol": parse_saeol_list,
}


def fetch_source(source_id, source, page=1):
    parse = PARSERS[source.get("parser", "daegu")]
    page_field = source.get("pageField", "pageIndex")

    seen_urls = set()
    items = []

    def collect(url):
        print(f"[{source['name']}] 요청: {url}")
        html = fetch_html(url)
        for item in parse(html, source):
            if item["url"] in seen_urls:  # 검색어 간 중복 제거
                continue
            seen_urls.add(item["url"])
            items.append(item)

    def query_of(template, kw):
        return "&" + template.replace("{kw}", urllib.parse.quote(kw))

    # 1) 부서 검색
    if source.get("deptFilter") == "client":
        # 서버측 부서 검색이 동작하지 않는 기관: 전체 목록을 받아 자체 필터링
        collect(f"{source['listUrl']}&{page_field}={page}")
        items[:] = [it for it in items
                    if any(kw in it["dept"] for kw in source["depts"])]
        # 필터로 제외된 URL 이 이후 제목 검색에서 다시 들어올 수 있게 초기화
        seen_urls.clear()
        seen_urls.update(it["url"] for it in items)
    else:
        for dept in (source["depts"] or [""]):
            dept_param = query_of(source["deptQuery"], dept) if dept and source.get("deptQuery") else ""
            collect(f"{source['listUrl']}{dept_param}&{page_field}={page}")

    # 2) 제목 검색 (부서 검색과 별개로 병합)
    if source.get("titleQuery"):
        for kw in source.get("titles", []):
            collect(f"{source['listUrl']}{query_of(source['titleQuery'], kw)}&{page_field}={page}")

    # 등록일 1년 이상 지난 항목 제외 (날짜 없는 항목은 유지)
    cutoff = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
    items[:] = [it for it in items if not it.get("date") or it["date"] >= cutoff]

    # 등록일 내림차순 정렬
    items.sort(key=lambda x: x.get("date", ""), reverse=True)

    return {
        "success": True,
        "source": source_id,
        "sourceName": source["name"],
        "boardUrl": source["boardUrl"],
        "depts": source["depts"],
        "titles": source.get("titles", []),
        "page": page,
        "count": len(items),
        "updatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "items": items,
    }


def main():
    # Windows 콘솔(cp949)에서 한글 출력 깨짐 방지
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for source_id, source in SOURCES.items():
        try:
            data = fetch_source(source_id, source)
            out_path = OUTPUT_DIR / f"gosi_{source_id}.json"
            out_path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(f"[{source['name']}] {data['count']}건 저장 -> {out_path}")
        except Exception as e:
            print(f"[{source['name']}] 수집 실패: {e}")


if __name__ == "__main__":
    main()
