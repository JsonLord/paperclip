import requests
import time
import json
import os

HF_TOKEN = os.environ.get("HF_TOKEN")
SPACE_URL = "https://huggingface.co/api/spaces/Leon4gr45/Paperclip-Founder"
headers = {"Authorization": f"Bearer {HF_TOKEN}"}

for _ in range(60):
    res = requests.get(SPACE_URL, headers=headers)
    if res.status_code == 200:
        data = res.json()
        stage = data.get("runtime", {}).get("stage", "")
        if stage == "RUNNING" or stage == "READY":
            print(f"Space is {stage}!")
            break
        elif stage == "BUILD_ERROR" or stage == "RUNTIME_ERROR" or stage == "CONFIG_ERROR":
            print(f"Space failed: {stage}")
            break
        print(f"Current stage: {stage}")
    else:
        print("API error", res.status_code)
    time.sleep(10)
