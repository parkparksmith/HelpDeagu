import requests
import json
import concurrent.futures
import time
import os

def fetch_draw_with_retry(drwNo, max_retries=3):
    url = f"https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={drwNo}"
    for attempt in range(max_retries):
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get("returnValue") == "success":
                    return {
                        "drwNo": data["drwNo"],
                        "date": data["drwNoDate"],
                        "numbers": [
                            data["drwtNo1"], data["drwtNo2"], data["drwtNo3"],
                            data["drwtNo4"], data["drwtNo5"], data["drwtNo6"]
                        ],
                        "bonus": data["bnusNo"]
                    }
                else:
                    return None # End of data likely
            time.sleep(0.5) # small delay
        except Exception as e:
            print(f"Error fetching {drwNo} (attempt {attempt+1}): {e}")
            time.sleep(1)
    return None

def main():
    all_data = []
    max_check = 1160 # Current draw is around 1106 in Feb 2024. 
    # Let's check closer to 1110. No wait, 2026! 
    # 2024-02 -> 1106. +2 years = +104 weeks. -> ~1210.
    # Let's try 1250 just in case.
    
    print("Fetching Lotto data more politely...")
    
    # Sequential fetching to ensure order and avoid rate limits? 
    # Parallel is faster but risky. Let's try 5 threads.
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_draw = {executor.submit(fetch_draw_with_retry, i): i for i in range(1, 1250)}
        
        for future in concurrent.futures.as_completed(future_to_draw):
            drwNo = future_to_draw[future]
            try:
                result = future.result()
                if result:
                    all_data.append(result)
            except Exception as exc:
                print(f'Draw {drwNo} generated an exception: {exc}')

    # Filter None and sort
    all_data = [d for d in all_data if d]
    all_data.sort(key=lambda x: x['drwNo'], reverse=True)
    
    if not all_data:
        print("No data fetched.")
        return

    print(f"Fetched {len(all_data)} draws.")
    
    output_path = os.path.join("js", "lotto_data.js")
    js_content = f"const allLottoData = {json.dumps(all_data, ensure_ascii=False)};"
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(js_content)
        
    print(f"Data saved to {output_path}")

if __name__ == "__main__":
    main()
