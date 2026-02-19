import json
import os

json_file = r"Json/Lotto/lotto_data.json"
js_file = r"js/lotto_data.js" # This will contain global variable

# Read JSON
with open(json_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Write as JS global variable
with open(js_file, 'w', encoding='utf-8') as f:
    f.write(f"const lottoData = {json.dumps(data, indent=4, ensure_ascii=False)};\n")

print(f"Created {js_file} from {json_file}")
