import json
import time
import base64
import secrets
import uuid
from curl_cffi import requests
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.backends import default_backend

# ==========================================
# 1. 配置区域
# ==========================================

# ✅ 您的私钥 (保持不变)
CAPTURED_KEY_JSON = {
    "crv": "P-256",
    "d": "xxx", 
    "ext": True,
    "key_ops": ["sign"],
    "kty": "EC",
    "x": "xxx",
    "y": "xxx"
}

# ✅ 您的 Token (保持不变)
USER_TOKEN = "xxx"  # 记得检查是否需要 Bearer 前缀

# ✅ 您的真实指纹 (保持不变)
BROWSER_FINGERPRINT = {
    "c": "xxx",
    "wgl": "xxx"
}

# ==========================================
# 2. 签名工具类
# ==========================================
class DarkKnightSigner:
    def __init__(self, jwk_data):
        self.jwk = jwk_data
        self.private_key = self._load_private_key(jwk_data)
    def _pad_base64(self, b64_str): return b64_str + '=' * (-len(b64_str) % 4)
    def _load_private_key(self, jwk):
        d_int = int.from_bytes(base64.urlsafe_b64decode(self._pad_base64(jwk['d'])), 'big')
        x_int = int.from_bytes(base64.urlsafe_b64decode(self._pad_base64(jwk['x'])), 'big')
        y_int = int.from_bytes(base64.urlsafe_b64decode(self._pad_base64(jwk['y'])), 'big')
        public_numbers = ec.EllipticCurvePublicNumbers(x_int, y_int, ec.SECP256R1())
        return ec.EllipticCurvePrivateNumbers(d_int, public_numbers).private_key(default_backend())
    def generate_signature_header(self, fp_data):
        nonce = secrets.token_hex(32)
        ts = int(time.time() * 1000)
        base_payload = {
            "fp": fp_data, "nonce": nonce,
            "pk": { "crv": self.jwk["crv"], "ext": True, "kty": self.jwk["kty"], "x": self.jwk["x"], "y": self.jwk["y"] },
            "ts": ts, "v": 1
        }
        canonical_json = json.dumps(base_payload, separators=(',', ':'), sort_keys=True)
        der_signature = self.private_key.sign(canonical_json.encode('utf-8'), ec.ECDSA(hashes.SHA256()))
        r, s = utils.decode_dss_signature(der_signature)
        raw_signature = r.to_bytes(32, 'big') + s.to_bytes(32, 'big')
        sig_b64 = base64.urlsafe_b64encode(raw_signature).decode().rstrip('=')
        final_payload = base_payload.copy()
        final_payload["sig"] = sig_b64
        return base64.urlsafe_b64encode(json.dumps(final_payload, separators=(',', ':'), sort_keys=True).encode()).decode().rstrip('=')

# ==========================================
# 3. 交互式对话 (强力拆包版)
# ==========================================
def start_interactive_chat():
    signer = DarkKnightSigner(CAPTURED_KEY_JSON)
    target_model = "gemini-3-pro-preview" 
    
    print(f"\n🚀 初始化系统 (Model: {target_model})...")

    # --- Step 1: 握手建房 ---
    chat_id = ""
    local_messages = [] 
    
    init_msg_id = str(uuid.uuid4())
    init_prompt = "Hello"
    
    new_chat_payload = {
        "chat": {
            "id": "", "title": "Ultra Chat", "models": [target_model], "params": {},
            "history": { "messages": { init_msg_id: { "id": init_msg_id, "role": "user", "content": init_prompt, "timestamp": int(time.time()), "models": [target_model] } }, "currentId": init_msg_id },
            "messages": [{ "id": init_msg_id, "role": "user", "content": init_prompt, "timestamp": int(time.time()), "models": [target_model] }],
            "tags": [], "timestamp": int(time.time() * 1000)
        }, "folder_id": None
    }
    
    headers = {
        "Authorization": USER_TOKEN,
        "x-zai-darkknight": signer.generate_signature_header(BROWSER_FINGERPRINT),
        "x-zai-fp": json.dumps(BROWSER_FINGERPRINT),
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Origin": "https://zai.is"
    }
    
    try:
        print("正在连接服务器...", end="")
        res1 = requests.post("https://zai.is/api/v1/chats/new", headers=headers, json=new_chat_payload, impersonate="chrome120")
        if res1.status_code == 200:
            chat_id = res1.json().get("id")
            print(f" ✅ 连接成功! 房间号: {chat_id}")
            local_messages.append({"role": "user", "content": init_prompt})
        else:
            print(f"\n❌ 建房失败: {res1.text}")
            return
    except Exception as e:
        print(f"\n❌ 网络错误: {e}")
        return

    print("\n💬 聊天开始！(输入 'exit' 退出)")
    print("-" * 50)

    # --- Step 2: 循环 ---
    while True:
        try:
            user_input = input("\nYou: ").strip()
            if not user_input: continue
            if user_input.lower() in ["exit", "quit"]: break

            local_messages.append({"role": "user", "content": user_input})

            gen_payload = {
                "chat_id": chat_id,
                "model": target_model,
                "messages": local_messages,
                "stream": True,
                "params": {}
            }
            
            headers["x-zai-darkknight"] = signer.generate_signature_header(BROWSER_FINGERPRINT)
            
            # 发送请求
            response = requests.post(
                "https://zai.is/api/chat/completions",
                headers=headers,
                json=gen_payload,
                impersonate="chrome120",
                stream=True,
                timeout=120
            )

            if response.status_code == 200:
                print("Gemini: ", end="", flush=True)
                full_response_text = ""
                
                # 🛠️ 强力拆包逻辑：按字节读取，手动分割 'data: '
                buffer = ""
                for chunk in response.iter_content(chunk_size=None):
                    if chunk:
                        # 1. 解码并拼接到缓冲区
                        text_chunk = chunk.decode('utf-8', errors='ignore')
                        buffer += text_chunk
                        
                        # 2. 只要缓冲区里有 'data: '，就开始切割
                        while "data: " in buffer:
                            # 找到第一个 data: 的位置
                            start_idx = buffer.find("data: ")
                            
                            # 如果 data: 前面有垃圾数据（比如上一行的残留），丢掉
                            if start_idx > 0:
                                buffer = buffer[start_idx:]
                                start_idx = 0
                                
                            # 找下一个 data: 或者 结尾
                            # 这里的技巧是：我们假设每个 JSON 后面可能会粘着下一个 data:
                            # 所以我们试着找 buffer[6:] 里的下一个 data:
                            next_idx = buffer.find("data: ", 6)
                            
                            if next_idx != -1:
                                # 提取出完整的这一段: "data: {...}"
                                raw_line = buffer[:next_idx]
                                buffer = buffer[next_idx:] # 剩下的留给下一次
                            else:
                                # 如果还没收到下一个 data:，可能是这一段还没传完
                                # 但也有可能这一段就是最后一段了（比如 [DONE]）
                                # 简单的判断：看能不能解析 JSON
                                raw_line = buffer
                                # 这里不能清空 buffer，因为可能 JSON 没传完，只有解析成功才清空
                                # 但为了防止死循环，我们尝试解析，如果成功就截断，不成功就 break 等更多数据
                                
                            # 处理提取出来的 raw_line
                            json_str = raw_line[6:].strip() # 去掉 "data: "
                            
                            if not json_str: 
                                # 可能是空行，跳过，并在 buffer 中清除掉这一段
                                if next_idx != -1: continue 
                                else: break

                            if json_str == "[DONE]":
                                buffer = "" # 清空缓冲区
                                break
                            
                            try:
                                obj = json.loads(json_str)
                                # ✅ 解析成功！说明这一段是完整的
                                if next_idx == -1: buffer = "" # 如果是最后一段且解析成功，清空buffer

                                choices = obj.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {})
                                    
                                    # 打印思考 (用括号包裹，不用颜色代码，防止显示不出来)
                                    '''''
                                    reasoning = delta.get("reasoning_content", "")
                                    if reasoning: 
                                        print(f"({reasoning})", end="", flush=True)
                                    '''''
                                    
                                    # 打印正文
                                    content = delta.get("content", "")
                                    if content:
                                        print(content, end="", flush=True)
                                        full_response_text += content
                                        
                            except json.JSONDecodeError:
                                # 解析失败，说明数据还不完整，等待更多数据
                                if next_idx == -1: break # 退出 while，继续 for chunk
                                else: 
                                    # 既然有 next_idx，说明这一段肯定是坏的或者粘包逻辑有问题，丢弃
                                    pass
                
                print("") # 换行
                local_messages.append({"role": "assistant", "content": full_response_text})
                
            else:
                print(f"\n❌ 错误: {response.status_code} - {response.text}")
        
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"\n❌ 异常: {e}")

if __name__ == "__main__":
    start_interactive_chat()