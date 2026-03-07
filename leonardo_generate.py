import requests
import json
import time
import sys
import os
import concurrent.futures
from urllib.parse import unquote
import queue
import uuid

class LeonardoGenerate:
    GRAPHQL_URL = "https://api.leonardo.ai/v1/graphql"
    AUTH_URL = "https://app.leonardo.ai/api/auth"
    
    def __init__(self, name="Account"):
        self.name = name
        self.access_token = None
        self.session = requests.Session()
        # Initial headers from browser-like footprint
        self.base_headers = {
            "accept": "*/*",
            "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
            "content-type": "application/json",
            "origin": "https://app.leonardo.ai",
            "referer": "https://app.leonardo.ai/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
            "x-leo-schema-version": "latest",
            "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site",
            "priority": "u=1, i",
            "pragma": "no-cache",
            "cache-control": "no-cache"
        }
        self.tokens = 0

    def set_cookie_string(self, cookie_str):
        # We only need these for the session retrieval
        allowed_keys = [
            "__Host-next-auth.csrf-token",
            "__Secure-next-auth.session-token.0",
            "__Secure-next-auth.session-token.1",
            "__Secure-next-auth.session-token"
        ]
        parts = cookie_str.split(';')
        for part in parts:
            if '=' in part:
                name, value = part.strip().split('=', 1)
                if any(name.startswith(k) for k in allowed_keys):
                    self.session.cookies.set(name, value, domain=".leonardo.ai", path="/")

    def refresh_session(self, csrf_token=None):
        if csrf_token:
            payload = {"csrfToken": csrf_token}
            try:
                response = self.session.post(f"{self.AUTH_URL}/session", headers=self.base_headers, json=payload, timeout=30)
                if response.status_code == 200:
                    data = response.json()
                    self.access_token = data.get('idToken') or data.get('accessToken')
                    return True
            except: pass

        try:
            response = self.session.get(f"{self.AUTH_URL}/session", headers=self.base_headers, timeout=30)
            if response.status_code == 200:
                data = response.json()
                self.access_token = data.get('idToken') or data.get('accessToken')
                return True
        except: pass
        return False

    def get_token_balance(self):
        if not self.access_token: return 0
        headers = self.base_headers.copy()
        headers["authorization"] = f"Bearer {self.access_token}"
        query = {
            "operationName": "GetTokenBalance",
            "variables": {},
            "query": "query GetTokenBalance {\n  user_details {\n    subscriptionTokens\n    paidTokens\n    rolloverTokens\n    __typename\n  }\n}\n"
        }
        try:
            # Token balance check works WITH cookies usually, but we'll try session first
            response = self.session.post(self.GRAPHQL_URL, headers=headers, json=query, timeout=30)
            data = response.json()
            details_list = data.get('data', {}).get('user_details', [])
            if details_list:
                details = details_list[0]
                self.tokens = (details.get('subscriptionTokens') or 0) + (details.get('paidTokens') or 0) + (details.get('rolloverTokens') or 0)
                return self.tokens
        except: pass
        return 0

    def create_generation(self, prompt):
        # IMPORTANT: Use Bearer auth and telemetry, NO COOKIES as per successful curl
        trace_id = uuid.uuid4().hex
        headers = self.base_headers.copy()
        headers.update({
            "authorization": f"Bearer {self.access_token}",
            "sentry-trace": f"{trace_id}-{uuid.uuid4().hex[:16]}-0",
            "baggage": f"sentry-environment=vercel-production,sentry-release=f3c7bb60dbb4f9beaba874819fbbea49e0662ab3,sentry-public_key=a851bd902378477eae99cf74c62e142a,sentry-trace_id={trace_id},sentry-org_id=4504767521292288,sentry-sampled=false"
        })
        
        query = {
            "operationName": "CreateSDGenerationJob",
            "variables": {
                "arg1": {
                    "prompt": prompt.strip(),
                    "negative_prompt": "",
                    "nsfw": True,
                    "num_images": 1,
                    "width": 1200,
                    "height": 1200,
                    "image_size": 4,
                    "num_inference_steps": 10,
                    "contrast": 3.5,
                    "guidance_scale": 7,
                    "sd_version": "KINO_2_1",
                    "modelId": "7b592283-e8a7-4c5a-9ba6-d18c31f258b9",
                    "presetStyle": "LEONARDO",
                    "scheduler": "LEONARDO",
                    "public": True,
                    "tiling": False,
                    "leonardoMagic": False,
                    "poseToImage": False,
                    "poseToImageType": "POSE",
                    "presetId": 859,
                    "weighting": 0.75,
                    "highContrast": False,
                    "elements": [],
                    "userElements": [],
                    "controlnets": [],
                    "photoReal": False,
                    "transparency": "disabled",
                    "styleUUID": "111dc692-d470-4eec-b791-3475abac4c46",
                    "enhancePrompt": True,
                    "collectionIds": [],
                    "ultra": False,
                    "contextImages": []
                }
            },
            "query": "mutation CreateSDGenerationJob($arg1: SDGenerationInput!) {\n  sdGenerationJob(arg1: $arg1) {\n    generationId\n    __typename\n  }\n}\n"
        }
        
        compact_data = json.dumps(query, separators=(',', ':'))
        # Using requests.post (DIRECT) instead of self.session.post to avoid cookie clash
        response = requests.post(self.GRAPHQL_URL, headers=headers, data=compact_data, timeout=30)
        
        try:
            res_json = response.json()
            job = res_data = res_json.get('data', {}).get('sdGenerationJob')
            if job and job.get('generationId'):
                return job['generationId']
            
            if "errors" in res_json:
                raise Exception(f"Mutation Error: {res_json['errors']}")
            return res_json['data']['sdGenerationJob']['generationId']
        except Exception as e:
            if not response.text.startswith('{'):
                print(f"[{self.name}] NON-JSON RESPONSE: {response.text[:500]}")
            raise e

    def wait_for_completion(self, gen_id):
        headers = self.base_headers.copy()
        headers["authorization"] = f"Bearer {self.access_token}"
        query = {
            "operationName": "GetAIGenerationFeedStatuses",
            "variables": {"where": {"id": {"_eq": gen_id}}},
            "query": "query GetAIGenerationFeedStatuses($where: generations_bool_exp = {}) {\n  generations(where: $where) {\n    status\n  }\n}\n"
        }
        for _ in range(40):
            try:
                response = requests.post(self.GRAPHQL_URL, headers=headers, json=query, timeout=30)
                generations = response.json().get('data', {}).get('generations', [])
                if generations:
                    status = generations[0]['status']
                    if status == "COMPLETE": return True
                    if status == "FAILED": return False
            except: pass
            time.sleep(5)
        return False

    def get_image_url(self, gen_id):
        headers = self.base_headers.copy()
        headers["authorization"] = f"Bearer {self.access_token}"
        query = {
            "operationName": "GetAIGenerationFeed",
            "variables": {"where": {"id": {"_eq": gen_id}}, "limit": 1},
            "query": "query GetAIGenerationFeed($where: generations_bool_exp = {}, $limit: Int) {\n  generations(where: $where, limit: $limit) {\n    generated_images { url }\n  }\n}\n"
        }
        response = requests.post(self.GRAPHQL_URL, headers=headers, json=query, timeout=30)
        return response.json()['data']['generations'][0]['generated_images'][0]['url']

def account_worker(account, prompt_queue):
    while not prompt_queue.empty():
        if account.tokens <= 0:
            print(f"[{account.name}] OUT OF TOKENS. Stopping.")
            break
        try:
            prompt = prompt_queue.get_nowait()
        except queue.Empty: break
            
        print(f"[{account.name}] Active | Tokens: {account.tokens} | Prompt: {prompt[:40]}")
        try:
            gen_id = account.create_generation(prompt)
            print(f"[{account.name}] Job Created: {gen_id}. Waiting...")
            if account.wait_for_completion(gen_id):
                url = account.get_image_url(gen_id)
                account.get_token_balance()
                print(f"[{account.name}] SUCCESS | {url}")
            else:
                print(f"[{account.name}] FAILED generation status.")
        except Exception as e:
            print(f"[{account.name}] ERROR: {str(e)}")
        prompt_queue.task_done()

def main():
    check_mode = "--check" in sys.argv
    all_accounts = []
    
    # 1. accounts.json
    if os.path.exists("accounts.json"):
        try:
            with open("accounts.json", "r") as f:
                data = json.load(f)
                for i, acc_data in enumerate(data):
                    leo = LeonardoGenerate(name=acc_data.get('email', f"signup_{i}"))
                    leo.access_token = acc_data.get('access_token')
                    all_accounts.append(leo)
        except: pass

    # 2. cookies.txt
    if os.path.exists("result_cookies.txt"):
        with open("result_cookies.txt", "r") as f:
            for i, line in enumerate(f):
                cookie_str = line.strip()
                if not cookie_str: continue
                leo = LeonardoGenerate(name=f"Account_{i+1}")
                leo.set_cookie_string(cookie_str)
                csrf = None
                if '__Host-next-auth.csrf-token=' in cookie_str:
                    try:
                        csrf_part = cookie_str.split('__Host-next-auth.csrf-token=')[1].split(';')[0]
                        csrf = unquote(csrf_part).split('|')[0]
                    except: pass
                if leo.refresh_session(csrf):
                    all_accounts.append(leo)

    if not all_accounts:
        print("No accounts found.")
        return

    print("\n--- TOKEN STATUS REPORT ---")
    ready_accounts = []
    for acc in all_accounts:
        balance = acc.get_token_balance()
        status = "READY" if balance > 0 else "EXHAUSTED"
        print(f"[{acc.name:25}] | Tokens: {balance:4} | {status}")
        if balance > 0: ready_accounts.append(acc)
    print("---------------------------\n")

    if check_mode:
        return

    if not ready_accounts:
        print("No accounts with tokens. Use --check to verify balances.")
        return

    if not os.path.exists("prompts.txt"):
        print("Error: prompts.txt not found.")
        return
    with open("prompts.txt", "r") as f:
        prompts = [line.strip() for line in f if line.strip()]
    
    prompt_queue = queue.Queue()
    for p in prompts: prompt_queue.put(p)

    print(f"Starting {len(ready_accounts)} worker threads for {len(prompts)} prompts...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(ready_accounts)) as executor:
        for acc in ready_accounts:
            executor.submit(account_worker, acc, prompt_queue)
            
    print("\nTasks completed.")

if __name__ == "__main__":
    main()
