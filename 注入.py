import time
from playwright.sync_api import sync_playwright

# === ☠️ 毒药代码：强制覆盖 generateKey ===
# 这段代码会被插入到每一个 JS 文件的头部
# 无论是在主线程还是 Worker 中加载，它都会最先运行
POISON_PILL = """
;(function() {
    try {
        // 确保 crypto 存在
        var target = (typeof window !== 'undefined' ? window.crypto : self.crypto);
        if (!target || !target.subtle) return;

        console.log("☠️ [DarkKnight] 正在感染环境:", (typeof window !== 'undefined' ? "Main Window" : "Worker"));

        var originalGenerate = target.subtle.generateKey;
        
        // 暴力覆写方法
        target.subtle.generateKey = async function(algo, extractable, usages) {
            // ⬇️ 核心攻击：不管原本传什么，这里强制改为 true
            var newExtractable = true; 
            
            // 打印日志方便调试
            // console.log("💉 [拦截] generateKey 被调用，强制 extractable=true");
            
            return originalGenerate.call(this, algo, newExtractable, usages);
        };
    } catch(e) { console.error("感染失败", e); }
})();
"""

def run():
    print("🚀 启动 DarkKnight V9 - 全文件头部感染模式")
    print("😈 正在移除 SRI 并向所有 JS 注入毒药...")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = browser.new_context()
        page = context.new_page()

        def handle_route(route, request):
            try:
                response = route.fetch()
                body = response.text()
                url = request.url
                resource_type = request.resource_type
                
                modified_body = body

                # 🛡️ 1. 针对 HTML: 移除 SRI 校验，允许运行篡改后的 JS
                if resource_type == "document":
                    if 'integrity="' in modified_body:
                        print(f"🔓 [HTML] 移除 SRI 锁: {url}")
                        modified_body = modified_body.replace('integrity="', 'no-integrity="')

                # 🛡️ 2. 针对 JS: 头部注入毒药
                if resource_type == "script" or ".js" in url:
                    # 只针对同源或核心 JS，避免破坏第三方库 (可选，这里为了保险全覆盖)
                    if "zai.is" in url or "static" in url:
                        print(f"💉 [JS] 感染文件: {url.split('/')[-1]}")
                        # 在文件最开头插入毒药代码
                        # 加个换行符防止和第一行混淆
                        modified_body = POISON_PILL + "\n" + modified_body

                route.fulfill(
                    response=response,
                    body=modified_body,
                    headers=response.headers
                )
            except Exception as e:
                # 忽略图片、字体等报错
                route.continue_()

        # 拦截所有请求
        page.route("**/*", handle_route)

        print("🌍 打开 zai.is...")
        page.goto("https://zai.is")

        # 自动清空旧数据，强迫使用新生成的“中毒”密钥
        try:
            print("🧹 清空数据库...")
            page.evaluate("""
                indexedDB.databases().then(dbs => {
                    dbs.forEach(db => indexedDB.deleteDatabase(db.name));
                });
                localStorage.clear();
            """)
        except: pass

        print("\n⚡ 等待页面加载（可能会比平时慢一点点）...")
        print("⚡ 加载完成后，密钥应该已经是可导出的了。")
        print("⚡ 请直接运行提取脚本。")
        
        page.pause()

if __name__ == "__main__":
    run()