import requests
import json
import os
import time
import urllib3
import re

# Suppress InsecureRequestWarning
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def fetch_lotto_data():
    base_dir = os.path.join("Json", "Lotto")
    os.makedirs(base_dir, exist_ok=True)
    
    file_path = os.path.join(base_dir, "lotto_history.json")
    
    existing_data = []
    start_draw = 1
    
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
                if existing_data:
                    existing_data.sort(key=lambda x: x["drwNo"])
                    start_draw = existing_data[-1]["drwNo"] + 1
                    print(f"Resuming from draw {start_draw}")
        except:
            existing_data = []

    current_draw = start_draw
    new_data = []
    
    # Session setup
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.dhlottery.co.kr/',
        'Accept': 'text/html,application/json,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    })
    
    print(f"Starting fetch from draw {current_draw}...")

    max_failures = 0
    
    while True:
        url = f"https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={current_draw}"
        
        try:
            # verify=False to bypass potential SSL certificate issues
            response = session.get(url, timeout=10, verify=False)
            
            try:
                data = response.json()
            except json.JSONDecodeError:
                # Extract title for debugging
                title_match = re.search(r'<title>(.*?)</title>', response.text, re.IGNORECASE)
                title = title_match.group(1) if title_match else "No Title"
                print(f"Non-JSON response for draw {current_draw}. Title: {title}")
                
                max_failures += 1
                if max_failures > 3:
                    print("Blocking detected. Stopping.")
                    break
                current_draw += 1
                continue
            
            if data.get("returnValue") != "success":
                print(f"End of data reached at draw {current_draw} (returnValue: {data.get('returnValue')})")
                break
                
            parsed = {
                "drwNo": int(data["drwNo"]),
                "drwNoDate": data["drwNoDate"],
                "numbers": [
                    int(data["drwtNo1"]), int(data["drwtNo2"]), int(data["drwtNo3"]),
                    int(data["drwtNo4"]), int(data["drwtNo5"]), int(data["drwtNo6"])
                ],
                "bnusNo": int(data["bnusNo"]),
                "winPay": int(data["firstWinamnt"]),
                "winnerCount": int(data["firstPrzwnerCo"])
            }
            
            new_data.append(parsed)
            if current_draw % 10 == 0:
                print(f"Fetched draw {current_draw}")
            
            current_draw += 1
            max_failures = 0
            
            if len(new_data) >= 50:
                save_data(file_path, existing_data + new_data)
                existing_data.extend(new_data)
                new_data = []
                print(f"Saved progress up to draw {current_draw-1}")
            
            # Random delay
            time.sleep(0.2)
            
        except Exception as e:
            print(f"Error requesting draw {current_draw}: {e}")
            max_failures += 1
            if max_failures > 3: break
            time.sleep(1)

    if new_data:
        save_data(file_path, existing_data + new_data)
        print("Final save complete.")

def save_data(path, data):
    data.sort(key=lambda x: x["drwNo"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    fetch_lotto_data()
