import json
import base64

# 🔴 必填：把你从浏览器复制的真实 x-zai-darkknight 填在这里
REAL_HEADER = "xxx" 

try:
    # 1. 解码 Payload
    payload_b64 = REAL_HEADER.split('.')[0]
    # 补全 padding
    payload_b64 += '=' * (-len(payload_b64) % 4)
    
    payload_json = base64.urlsafe_b64decode(payload_b64).decode('utf-8')
    payload_data = json.loads(payload_json)

    print("🔍 浏览器真实的 Payload 结构：")
    print("-" * 40)
    print(json.dumps(payload_data, indent=4, sort_keys=True))
    print("-" * 40)
    
    print("\n👉 请特别注意 'pk' 字段！看看它有没有 'ext' 和 'key_ops'？")
    print(f"pk: {json.dumps(payload_data.get('pk'), indent=4)}")

except Exception as e:
    print(f"❌ 解析失败: {e}")