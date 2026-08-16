# -*- coding: utf-8 -*-
"""
대구 고시공고 수집 스크립트
대구시청(및 추후 각 구청) 고시공고 게시판에서 부서명 필터로 1페이지를 가져와
Json/Gosi/gosi_<기관ID>.json 으로 저장한다.

사용법:
    python fetch_gosi.py

저장 후 git commit/push 하면 GitHub Pages 사이트(pages/gosi-info.html)에 반영된다.
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "Json" / "Gosi"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# 기관별 설정 (구청 추가 시 여기에 항목을 늘린다)
SOURCES = {
    "daegu": {
        "name": "대구시청",
        "boardUrl": "https://www.daegu.go.kr/index.do?menu_id=00940170",
        "listUrl": "https://www.daegu.go.kr/index.do?menu_id=00940170"
                   "&menu_link=/front/daeguSidoGosi/daeguSidoGosiList.do",
        "viewUrl": "https://www.daegu.go.kr/index.do?menu_id=00940170"
                   "&menu_link=/front/daeguSidoGosi/daeguSidoGosiView.do",
        "dept": "도시주택국",
        "parser": "daegu",
    },
    "daegu_build": {
        "name": "대구시청 도시/주택/건설 소식",
        "boardUrl": "https://www.daegu.go.kr/build/index.do?menu_id=00001338",
        "listUrl": "https://www.daegu.go.kr/build/index.do?menu_id=00001338"
                   "&menu_link=/icms/bbs/selectBoardList.do&bbsId=BBS_00153",
        "viewUrl": "https://www.daegu.go.kr/build/index.do?menu_id=00001338"
                   "&menu_link=/icms/bbs/selectBoardArticle.do&bbsId=BBS_00153",
        "dept": "",  # 부서 필터 없이 전체 목록
        "parser": "icms",
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
    return text.strip()


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

    for row in re.finditer(r"<tr>([\s\S]*?)</tr>", table_match.group(1)):
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

    for row in re.finditer(r"<tr>([\s\S]*?)</tr>", table_match.group(1)):
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


PARSERS = {
    "daegu": parse_daegu_list,
    "icms": parse_icms_list,
}


def fetch_source(source_id, source, page=1):
    # 부서 필터가 있는 기관만 검색 파라미터를 붙인다
    dept_param = f"&searchDept_nm={urllib.parse.quote(source['dept'])}" if source["dept"] else ""
    url = f"{source['listUrl']}{dept_param}&pageIndex={page}"
    print(f"[{source['name']}] 요청: {url}")

    html = fetch_html(url)
    items = PARSERS[source.get("parser", "daegu")](html, source)

    return {
        "success": True,
        "source": source_id,
        "sourceName": source["name"],
        "boardUrl": source["boardUrl"],
        "dept": source["dept"],
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
