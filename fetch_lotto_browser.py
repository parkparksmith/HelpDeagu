from DrissionPage import ChromiumPage
import json
import os
import time

def main():
    print("Initializing browser automation...")
    
    # Setup - ChromiumPage controls the actual Chrome browser
    try:
        page = ChromiumPage()
    except Exception as e:
        print(f"Browser initialization failed: {e}")
        print("Please ensure Google Chrome is installed.")
        return

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
    
    print(f"Starting fetch from draw {current_draw}...")
    
    try:
        while True:
            url = f"https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={current_draw}"
            
            # Navigate to the API URL
            page.get(url)
            
            # The page content is JSON text inside the body or pre tag
            # DrissionPage handles this nicely
            content = page.html
            
            # Extract JSON from body text (sometimes wrapped in tags)
            try:
                # Direct JSON parsing from body text
                text = page.run_js("return document.body.innerText")
                data = json.loads(text)
            except:
                print(f"Failed to parse JSON for draw {current_draw}")
                current_draw += 1
                continue

            if data.get("returnValue") != "success":
                print(f"End of data reached at draw {current_draw}")
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
            print(f"Fetched draw {current_draw}: {data['drwNoDate']}")
            
            current_draw += 1
            
            # Save every 50
            if len(new_data) >= 50:
                save_data(file_path, existing_data + new_data)
                existing_data.extend(new_data)
                new_data = []
                print("Saved intermediate progress.")
                
            # Small delay
            time.sleep(0.1)

    except KeyboardInterrupt:
        print("Stopped by user.")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        if new_data:
            save_data(file_path, existing_data + new_data)
            print("Final save complete.")
        page.quit()

def save_data(path, data):
    data.sort(key=lambda x: x["drwNo"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
