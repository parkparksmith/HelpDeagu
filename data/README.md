# 실거래가 데이터 관리

## 📁 파일 구조

```
data/
├── index.json          # 데이터 목록 (필수)
├── 2026-02-03.json     # 날짜별 데이터
├── 2026-02-02.json
└── ...
```

## 📋 index.json 형식

```json
{
  "latest": [
    {
      "date": "2026-02-03",
      "file": "2026-02-03.json",
      "apt_count": 45,
      "presale_count": 12
    },
    {
      "date": "2026-02-02",
      "file": "2026-02-02.json",
      "apt_count": 38,
      "presale_count": 8
    }
  ],
  "updated_at": "2026-02-03T10:30:00"
}
```

## 📋 데이터 파일 형식 (예: 2026-02-03.json)

```json
{
  "key": "3731",
  "export_date": "2026-02-03T10:30:00",
  "selected_date": "2026-02-03",
  "summary": {
    "total_apt_count": 45,
    "total_presale_count": 12,
    "apt_newhigh_count": 5,
    "presale_newhigh_count": 2
  },
  "trades": [
    {
      "trade_type": "아파트",
      "dong": "범어동",
      "apt_name": "범어센트럴자이",
      "area": 84.92,
      "floor": 15,
      "amount": 1250000000,
      "contract_date": "2026-01-15",
      "transaction_type": "중개",
      "is_newhigh": true,
      "previous_high": 1180000000,
      "construction_year": 2020,
      "district": "대구광역시 수성구 범어동"
    }
  ]
}
```

## 🚀 데이터 업데이트 방법

1. 새 데이터 파일 생성 (예: `2026-02-04.json`)
2. `index.json`의 `latest` 배열 맨 앞에 추가
3. git push로 배포

```bash
git add data/
git commit -m "Add trade data 2026-02-04"
git push
```
