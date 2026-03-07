import requests
import time
import json
import random
import string
import re

class MailTM:
    BASE_URL = "https://api.mail.tm"

    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.account_id = None
        self.email = None
        self.password = None

    def get_domains(self):
        response = self.session.get(f"{self.BASE_URL}/domains")
        return response.json()['hydra:member']

    def create_account(self, username=None, password=None):
        domains = self.get_domains()
        if not domains:
            raise Exception("No domains available on Mail.tm")
        domain = domains[0]['domain']
        self.email = f"{username or ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))}@{domain}"
        self.password = password or (''.join(random.choices(string.ascii_letters, k=8)) + ''.join(random.choices(string.digits, k=4)))
        
        payload = {
            "address": self.email,
            "password": self.password
        }
        response = self.session.post(f"{self.BASE_URL}/accounts", json=payload)
        if response.status_code != 201:
            raise Exception(f"Failed to create Mail.tm account: {response.text}")
        
        self.account_id = response.json()['id']
        return self.email, self.password

    def login(self):
        payload = {
            "address": self.email,
            "password": self.password
        }
        response = self.session.post(f"{self.BASE_URL}/token", json=payload)
        if response.status_code != 200:
            raise Exception(f"Failed to login to Mail.tm: {response.text}")
        
        self.token = response.json()['token']
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})

    def get_messages(self):
        response = self.session.get(f"{self.BASE_URL}/messages")
        return response.json()['hydra:member']

    def get_message_content(self, message_id):
        response = self.session.get(f"{self.BASE_URL}/messages/{message_id}")
        return response.json()

    def wait_for_verification_code(self, timeout=120):
        print(f"Waiting for verification code for {self.email}...")
        start_time = time.time()
        while time.time() - start_time < timeout:
            messages = self.get_messages()
            if messages:
                print(f"Polling... Found {len(messages)} messages.")
            for msg in messages:
                subject = msg.get('subject', '').lower()
                intro = msg.get('intro', '').lower()
                from_obj = msg.get('from', {})
                from_email = from_obj.get('address', '').lower() if isinstance(from_obj, dict) else str(from_obj).lower()
                
                if "leonardo" in intro or "verification" in subject or "leonardo" in subject or "contact@leonardo.ai" in from_email:
                    content = self.get_message_content(msg['id'])
                    # Extract 6-digit code from multiple potential fields
                    body = content.get('text', '') or content.get('html', [''])[0] or msg.get('intro', '')
                    print(f"Analyzing message body for code...")
                    match = re.search(r'\b\d{6}\b', body)
                    if match:
                        return match.group(0)
            time.sleep(10)
        raise Exception("Verification code timeout")

class LeonardoSignup:
    BASE_URL = "https://app.leonardo.ai"
    GRAPHQL_URL = "https://api.leonardo.ai/v1/graphql"
    AUTH_URL = "https://app.leonardo.ai/api/auth"

    def __init__(self, email, password):
        self.email = email.lower() # Force lowercase
        self.password = password
        self.session = requests.Session()
        self.access_token = None
        self.csrf_token = None
        self.headers = {
            "accept": "*/*",
            "content-type": "application/json",
            "origin": "https://app.leonardo.ai",
            "referer": "https://app.leonardo.ai/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
            "x-leo-schema-version": "latest"
        }

    def prepare(self):
        print("Gathering initial cookies...")
        # Hit the login page to get initial cookies and set up the session context
        self.session.get(f"{self.BASE_URL}/auth/login", headers=self.headers, timeout=30)
        # Also hit the signin page specifically
        self.session.get(f"{self.AUTH_URL}/signin", headers=self.headers, timeout=30)
        print(f"Initial cookies: {self.session.cookies.get_dict()}")

    def get_csrf_token(self):
        print("Fetching CSRF token...")
        response = self.session.get(f"{self.AUTH_URL}/csrf", headers=self.headers, timeout=30)
        if response.status_code == 200:
            self.csrf_token = response.json().get('csrfToken')
            print(f"CSRF Token obtained: {self.csrf_token}")
            return self.csrf_token
        raise Exception(f"Failed to get CSRF token: {response.text}")

    def check_domain_idp(self):
        domain = self.email.split('@')[1]
        query = {
            "operationName": "GetDomainIdP",
            "variables": {"input": {"domain": domain}},
            "query": "query GetDomainIdP($input: GetDomainIdPInput!) {\n  getDomainIdP(getDomainIdPInput: $input) {\n    identityProvider\n    __typename\n  }\n}\n"
        }
        self.session.post(self.GRAPHQL_URL, headers=self.headers, json=query, timeout=30)

    def signup(self):
        payload = {
            "email": self.email,
            "password": self.password
        }
        headers = self.headers.copy()
        if "authorization" in headers: del headers["authorization"]
        
        response = self.session.post(f"{self.AUTH_URL}/signup", headers=headers, json=payload, timeout=30)
        print(f"Signup status: {response.status_code}")
        if response.status_code not in [200, 201]:
            raise Exception(f"Signup failed: {response.text}")
        res_json = response.json()
        print(f"Signup response: {json.dumps(res_json)}")
        return res_json

    def confirm_signup(self, code):
        payload = {
            "email": self.email,
            "password": self.password,
            "confirmation_code": code
        }
        headers = self.headers.copy()
        if "authorization" in headers: del headers["authorization"]
        
        print("Sending confirmation code...")
        response = self.session.post(f"{self.AUTH_URL}/confirm-signup", headers=headers, json=payload, timeout=30)
        print(f"Confirmation status: {response.status_code}")
        print(f"Confirmation headers: {dict(response.headers)}")
        res_json = response.json()
        print(f"Confirmation response: {json.dumps(res_json)}")
        print(f"Cookies after confirmation: {self.session.cookies.get_dict()}")
        return res_json

    def check_user_email(self):
        print(f"Checking user email: {self.email}...")
        query = {
            "operationName": "CheckUserEmail",
            "variables": {"email": self.email},
            "query": "query CheckUserEmail($email: String!) {\n  checkUserEmail(email: $email) {\n    isRegistered\n    __typename\n  }\n}\n"
        }
        response = self.session.post(self.GRAPHQL_URL, headers=self.headers, json=query, timeout=30)
        return response.json()

    def get_user_by_email(self):
        print(f"Getting user info for: {self.email}...")
        query = {
            "operationName": "GetUserByUserEmail",
            "variables": {
                "arg1": {
                    "userEmail": self.email,
                    "verificationToken": "" # Placeholder, often null or empty in initial checks
                }
            },
            "query": "query GetUserByUserEmail($arg1: GetUserByUserEmailInput!) {\n  getUserByUserEmail(arg1: $arg1) {\n    cognitoProvider\n    confirmationStatus\n    userId\n    __typename\n  }\n}\n"
        }
        response = self.session.post(self.GRAPHQL_URL, headers=self.headers, json=query, timeout=30)
        return response.json()

    def login(self, max_retries=10):
        print("Finalizing session establishment (Login)...")
        for i in range(max_retries):
            print(f"Login attempt {i+1}/{max_retries}...")
            # Refresh session context and prime the signin page
            self.session.get(f"{self.BASE_URL}/auth/login", headers=self.headers, timeout=30)
            self.session.get(f"{self.AUTH_URL}/signin/credentials", headers=self.headers, timeout=30)
            
            # Get fresh CSRF for login
            self.get_csrf_token()
            
            callback_url = self.session.cookies.get("__Secure-next-auth.callback-url") or "/"
            payload = {
                "username": self.email,
                "password": self.password,
                "redirect": "false",
                "callbackUrl": callback_url,
                "csrfToken": self.csrf_token,
                "json": "true"
            }
            
            headers = self.headers.copy()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
            headers["referer"] = "https://app.leonardo.ai/auth/login"
            
            response = self.session.post(f"{self.AUTH_URL}/callback/credentials", headers=headers, data=payload, timeout=30)
            
            if response.status_code == 200:
                print("Session established successfully!")
                return True
            else:
                print(f"Login attempt {i+1} failed (Status {response.status_code}). Body: {response.text[:200]}")
                print("Waiting 10s...")
                time.sleep(10)
        return False


def save_account(data):
    accounts_file = "accounts.json"
    accounts = []
    try:
        with open(accounts_file, "r") as f:
            accounts = json.load(f)
    except:
        pass
    
    accounts.append(data)
    with open(accounts_file, "w") as f:
        json.dump(accounts, f, indent=4)
    print(f"Account details appended to {accounts_file}")
    
    # Also save to access_token.txt as per user preference
    with open("access_token.txt", "w") as f:
        f.write(data.get("access_token", ""))

def save_cookies(session):
    cookies_file = "result_cookies.txt"
    allowed_keys = [
        "__Host-next-auth.csrf-token",
        "__Secure-next-auth.session-token"
    ]
    
    parts = []
    for cookie in session.cookies:
        if any(cookie.name.startswith(k) for k in allowed_keys):
            parts.append(f"{cookie.name}={cookie.value}")
    
    if parts:
        cookie_str = "; ".join(parts)
        with open(cookies_file, "a") as f:
            f.write(cookie_str + "\n")
        print(f"Minimal cookies saved to {cookies_file}")

def main():
    try:
        mail = MailTM()
        # Stronger password
        password = ''.join(random.choices(string.ascii_letters, k=8)) + \
                   ''.join(random.choices(string.digits, k=4))
        password_list = list(password)
        random.shuffle(password_list)
        password = ''.join(password_list)

        email, _ = mail.create_account(password=password)
        print(f"Email: {email}, Password: {password}")
        mail.login()

        leo = LeonardoSignup(email, password)
        leo.prepare()
        leo.get_csrf_token()
        leo.check_domain_idp()
        leo.check_user_email()
        
        print("Signing up...")
        leo.signup()
        save_cookies(leo.session)

        # Skip OTP if the user says it's not needed (but usually it is for a session token)
        # If you want to skip, you can just Ctrl+C here or we can try to skip
        try:
            code = mail.wait_for_verification_code(timeout=30)
            print(f"Verification code: {code}")
            print("Confirming...")
            leo.confirm_signup(code)
            save_cookies(leo.session)
        except Exception as e:
            print(f"Skipping/Failed OTP verification: {e}")

        # Intermediate step from curl
        leo.get_user_by_email()

        print("\nWaiting 20s for backend sync before final login...")
        time.sleep(20)

        if leo.login():
            print("\nSignup & Login completed! Saving cookies...")
            save_cookies(leo.session)
            save_account({
                "email": email,
                "password": password,
                "timestamp": time.time()
            })
        else:
            print("Warning: Could not establish session token. result_cookies.txt might be incomplete.")
            save_cookies(leo.session)

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()

