import json
import os
import time
import subprocess
import sys

def fetch_lotto_data():
    base_dir = os.path.join("Json", "Lotto")
    os.makedirs(base_dir, exist_ok=True)
    
    file_path = os.path.join(base_dir, "lotto_history.json")
    
    existing_data = []
    start_draw = 1
    
    # Load existing data
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
    
    print(f"Starting fetch from draw {current_draw} using system curl...")

    while True:
        url = f"https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={current_draw}"
        
        # Construct curl command
        # Use -k to ignore SSL errors if any
        # Use -s to be silent
        cmd = [
            "curl", "-s", "-k",
            "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            url
        ]
        
        try:
            # Run curl command
            # encoding='utf-8' is crucial for Korean text
            result = subprocess.check_output(cmd, encoding='utf-8', errors='replace')
            
            try:
                data = json.loads(result)
            except json.JSONDecodeError:
                print(f"Non-JSON response for draw {current_draw}. Retrying...")
                time.sleep(2)
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
            
            # Incremental save
            if len(new_data) >= 50:
                save_data(file_path, existing_data + new_data)
                existing_data.extend(new_data)
                new_data = []
                print(f"Saved progress up to draw {current_draw-1}")
            
            # Small delay to keep server happy
            time.sleep(0.3)
            
        except subprocess.CalledProcessError as e:
            print(f"Curl failed for draw {current_draw}: {e}")
            break
        except Exception as e:
            print(f"Error executing curl for draw {current_draw}: {e}")
            break

    # Final save
    if new_data:
        save_data(file_path, existing_data + new_data)
        print("Final save complete.")

def save_data(path, data):
    data.sort(key=lambda x: x["drwNo"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    fetch_lotto_data()
