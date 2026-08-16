# -*- coding: utf-8 -*-
"""
laor-history 시세 데이터 업데이트 스크립트
data/laor-history/<종목>.js 의 마지막 날짜 이후 시세를 Yahoo Finance 에서 받아 이어붙인다.
(rates.js 기준금리는 수동 관리 대상이라 건드리지 않는다)

사용법:
    python update_laor_history.py

- 기존 데이터와 같은 수정주가(adjusted OHLC) 기준으로 이어붙인다.
- 겹치는 마지막 날짜의 종가를 대조해 심볼 매핑을 검증한다 (허용 오차 3%:
  배당 재조정으로 과거 수정주가가 약간 밀릴 수 있다).
"""
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data" / "laor-history"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# 파일 이름 -> 야후 파이낸스 심볼 후보 (앞에서부터 시도, 종가 대조로 검증)
SYMBOLS = {
    "AAPL": ["AAPL"],
    "AMZN": ["AMZN"],
    "BULZ": ["BULZ"],
    "GOOGL": ["GOOGL"],
    "INTC": ["INTC"],
    "JEPQ": ["JEPQ"],
    "KO": ["KO"],
    "MSFT": ["MSFT"],
    "QLD": ["QLD"],
    "QQQ": ["QQQ"],
    "QQQM": ["QQQM"],
    "SCHD": ["SCHD"],
    "SOXL": ["SOXL"],
    "SOXX": ["SOXX"],
    "SPY": ["SPY"],
    "SPYM": ["SPYM", "SPLG"],  # SPDR Portfolio S&P 500 (구 SPYM)
    "SSO": ["SSO"],
    "TQQQ": ["TQQQ"],
    "TSLA": ["TSLA"],
    "UPRO": ["UPRO"],
    "SAMSUNG": ["005930.KS"],   # 삼성전자
    "HYNIX": ["000660.KS"],     # SK하이닉스
    "HYUNDAI": ["005380.KS"],   # 현대차
    "KODEX200": ["069500.KS"],
    "KODEXLEV": ["122630.KS"],      # KODEX 레버리지
    "KODEXKQ": ["229200.KS"],       # KODEX 코스닥150
    "KODEXKQLEV": ["233740.KS"],    # KODEX 코스닥150레버리지
}


def fetch_chart(symbol, period1, period2):
    """야후 차트 API에서 일봉을 받아 [날짜, 시, 고, 저, 종(수정주가)] 목록으로 반환"""
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        f"?period1={period1}&period2={period2}&interval=1d"
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.loads(res.read().decode("utf-8"))

    result = (data.get("chart", {}).get("result") or [None])[0]
    if not result:
        raise ValueError(f"응답 없음: {symbol}")

    gmtoffset = result["meta"].get("gmtoffset", 0)
    timestamps = result.get("timestamp") or []
    quote = result["indicators"]["quote"][0]
    adjclose = result["indicators"].get("adjclose", [{}])[0].get("adjclose") \
        or quote["close"]

    rows = []
    for i, ts in enumerate(timestamps):
        o, h, l, c = (quote[k][i] for k in ("open", "high", "low", "close"))
        ac = adjclose[i]
        if None in (o, h, l, c, ac) or not c:
            continue  # 휴장 등 빈 값
        factor = ac / c  # 수정주가 배율을 시/고/저에도 적용
        date = time.strftime("%Y-%m-%d", time.gmtime(ts + gmtoffset))
        rows.append([
            date,
            round(o * factor, 2), round(h * factor, 2),
            round(l * factor, 2), round(ac, 2),
        ])
    return rows


def update_file(name):
    path = DATA_DIR / f"{name}.js"
    text = path.read_text(encoding="utf-8")

    m = re.search(r"window\.SAMPLE_DATA\['[^']+'\]=(\[\[[\s\S]*?\]\]);", text)
    if not m:
        print(f"[{name}] 형식 인식 실패, 건너뜀")
        return

    rows = json.loads(m.group(1))
    last_date = rows[-1][0]
    last_close = rows[-1][4]

    # 마지막 날짜 2주 전부터 받아 겹침 구간으로 검증
    period1 = int((datetime.strptime(last_date, "%Y-%m-%d") - timedelta(days=14)).timestamp())
    period2 = int(time.time()) + 86400

    for symbol in SYMBOLS[name]:
        try:
            fetched = fetch_chart(symbol, period1, period2)
        except Exception as e:
            print(f"[{name}] {symbol} 조회 실패: {e}")
            continue

        overlap = next((r for r in fetched if r[0] == last_date), None)
        if overlap is None:
            print(f"[{name}] {symbol}: 겹침 날짜({last_date}) 없음, 다음 후보 시도")
            continue
        drift = abs(overlap[4] - last_close) / last_close
        if drift > 0.03:
            print(f"[{name}] {symbol}: 종가 불일치 (기존 {last_close} vs {overlap[4]}), 다음 후보 시도")
            continue

        new_rows = [r for r in fetched if r[0] > last_date]
        if not new_rows:
            print(f"[{name}] {symbol}: 이미 최신 ({last_date})")
            return

        rows.extend(new_rows)
        body = json.dumps(rows, separators=(",", ":"), ensure_ascii=False)
        path.write_text(
            "window.SAMPLE_DATA=window.SAMPLE_DATA||{};\n"
            f"window.SAMPLE_DATA['{name}']={body};\n",
            encoding="utf-8",
        )
        print(f"[{name}] {symbol}: {len(new_rows)}일 추가 ({last_date} -> {rows[-1][0]})")
        return

    print(f"[{name}] 모든 심볼 후보 실패")


def rebuild_file(name):
    """기존 시작일을 유지한 채 전체 시계열을 야후 데이터로 재생성한다.
    기존 데이터의 수정주가 기준이 야후와 달라 이어붙이기 검증에 실패하는 종목용.
    """
    path = DATA_DIR / f"{name}.js"
    text = path.read_text(encoding="utf-8")
    m = re.search(r"window\.SAMPLE_DATA\['[^']+'\]=(\[\[[\s\S]*?\]\]);", text)
    if not m:
        print(f"[{name}] 형식 인식 실패, 건너뜀")
        return

    rows = json.loads(m.group(1))
    first_date, old_last = rows[0][0], rows[-1][0]
    period1 = int(datetime.strptime(first_date, "%Y-%m-%d").timestamp()) - 86400
    period2 = int(time.time()) + 86400

    symbol = SYMBOLS[name][0]
    fetched = [r for r in fetch_chart(symbol, period1, period2) if r[0] >= first_date]
    if len(fetched) < len(rows) * 0.9:
        print(f"[{name}] {symbol}: 재생성 데이터가 너무 적음 ({len(fetched)} vs 기존 {len(rows)}), 중단")
        return

    body = json.dumps(fetched, separators=(",", ":"), ensure_ascii=False)
    path.write_text(
        "window.SAMPLE_DATA=window.SAMPLE_DATA||{};\n"
        f"window.SAMPLE_DATA['{name}']={body};\n",
        encoding="utf-8",
    )
    print(f"[{name}] {symbol}: 전체 재생성 {len(fetched)}일 ({first_date} ~ {fetched[-1][0]}, 기존 마지막 {old_last})")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    # --rebuild 종목1 종목2 ... : 해당 종목을 전체 재생성
    if len(sys.argv) > 2 and sys.argv[1] == "--rebuild":
        for name in sys.argv[2:]:
            rebuild_file(name)
            time.sleep(0.5)
        return

    for name in SYMBOLS:
        try:
            update_file(name)
        except Exception as e:
            print(f"[{name}] 오류: {e}")
        time.sleep(0.5)  # 야후 API 부하 방지


if __name__ == "__main__":
    main()
