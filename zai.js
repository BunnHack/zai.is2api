// 运行命令: deno run -A zai.js
import { crypto } from "https://deno.land/std@0.210.0/crypto/mod.ts";
import * as path from "https://deno.land/std@0.210.0/path/mod.ts";

const KEY_FILE = "zai_key.json";
const CONFIG_FILE = "zai_config.json";

// ==========================================
// 1. 工具函数：规范化 JSON 与 签名
// ==========================================

// 递归排序对象键值，确保签名一致性
function sortObject(obj) {
    if (typeof obj !== "object" || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(sortObject);
    return Object.keys(obj).sort().reduce((result, key) => {
        result[key] = sortObject(obj[key]);
        return result;
    }, {});
}

// 对应 Python 的 json.dumps(..., separators=(',', ':'))
function canonicalStringify(obj) {
    return JSON.stringify(sortObject(obj));
}

function base64UrlEncode(buffer) {
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateSignature(fp, jwk, privateKey) {
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    
    const ts = Date.now();
    
    // 构造 Payload
    const basePayload = {
        fp: fp,
        nonce: nonce,
        pk: {
            crv: jwk.crv,
            ext: true,
            kty: jwk.kty,
            x: jwk.x,
            y: jwk.y
        },
        ts: ts,
        v: 1
    };

    // 1. 规范化 JSON
    const canonicalJson = canonicalStringify(basePayload);
    const data = new TextEncoder().encode(canonicalJson);

    // 2. 签名 (ECDSA P-256 SHA-256)
    const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        privateKey,
        data
    );

    // 3. 组合最终 Header
    const finalPayload = { ...basePayload, sig: base64UrlEncode(signature) };
    return base64UrlEncode(new TextEncoder().encode(canonicalStringify(finalPayload)));
}

// ==========================================
// 2. 核心逻辑
// ==========================================

async function main() {
    console.log("🦇 DarkKnight Termux/Deno 极简版 v1.0");

    let keyData;
    let privateKeyObj;

    // --- 阶段 A: 检查/生成密钥 ---
    try {
        const raw = await Deno.readTextFile(KEY_FILE);
        keyData = JSON.parse(raw);
        console.log("✅ 检测到现有密钥，正在加载...");
    } catch (e) {
        console.log("⚠️ 未找到密钥，正在生成新的 '完美' 密钥...");
        
        // 生成 P-256 密钥对
        const keyPair = await crypto.subtle.generateKey(
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["sign", "verify"]
        );

        // 导出私钥 (包含 d) 和 公钥
        const privJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
        const pubJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

        keyData = privJwk;
        await Deno.writeTextFile(KEY_FILE, JSON.stringify(keyData, null, 2));
        
        console.log("\n" + "=".repeat(50));
        console.log("🚨 必须执行步骤：注入密钥 🚨");
        console.log("=" + "=".repeat(50));
        console.log("请复制下方代码，在电脑或手机浏览器打开 zai.is");
        console.log("按 F12 (或地址栏输入 javascript:...) 打开控制台并粘贴运行：\n");

        const injectionCode = `
(async()=>{
const k=${JSON.stringify(privJwk)};
const p=${JSON.stringify(pubJwk)};
const db=await new Promise(r=>indexedDB.open("darkknight").onsuccess=e=>r(e.target.result));
const tx=db.transaction(["keys"],"readwrite");
tx.objectStore("keys").put({id:"current_keypair",keyPair:{privateKey:await crypto.subtle.importKey("jwk",k,{name:"ECDSA",namedCurve:"P-256"},true,["sign"]),publicKey:await crypto.subtle.importKey("jwk",p,{name:"ECDSA",namedCurve:"P-256"},true,["verify"])},publicKeyJwk:p});
alert("✅ 密钥已注入！请刷新页面并登录！");
})();
`;
        console.log(injectionCode);
        console.log("\n" + "=".repeat(50));
        console.log("👉 注入成功后，刷新网页，登录账号。");
        console.log("👉 然后重新运行此脚本进行对话！");
        Deno.exit(0);
    }

    // 导入私钥用于签名
    privateKeyObj = await crypto.subtle.importKey(
        "jwk", 
        keyData, 
        { name: "ECDSA", namedCurve: "P-256" }, 
        true, 
        ["sign"]
    );

    // --- 阶段 B: 配置指纹 ---
    let config = { token: "", fp: null };
    try {
        config = JSON.parse(await Deno.readTextFile(CONFIG_FILE));
    } catch {
        console.log("\n📝 初次设置");
        const token = prompt("请输入您的 Token (Authorization Bearer ...):");
        if (!token) Deno.exit(1);
        
        console.log("\n你需要从浏览器网络请求(F12)中找到 'x-zai-fp' 头的值。");
        console.log("或者复制 'x-zai-darkknight' 的值，我会尝试解码。");
        const fpInput = prompt("请输入 Fingerprint (JSON) 或 Header:");
        
        let fpObj;
        try {
            if (fpInput.startsWith("ey")) { // Base64 header
                const payload = JSON.parse(atob(fpInput.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
                fpObj = payload.fp;
                console.log("🔓 已从 Header 解码指纹");
            } else {
                fpObj = JSON.parse(fpInput);
            }
        } catch (e) {
            console.error("❌ 指纹格式错误");
            Deno.exit(1);
        }

        config = { token: token.trim(), fp: fpObj };
        await Deno.writeTextFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    }

    // --- 阶段 C: 聊天循环 ---
    console.log("\n🚀 连接到 Zai.is (Model: gemini-3-pro-preview)...");
    
    // 1. 建房 (简化版，复用逻辑)
    const chatId = await createChat(config, keyData, privateKeyObj);
    if(!chatId) Deno.exit(1);

    console.log(`✅ 房间已建立: ${chatId}`);
    console.log("💡 提示: 输入 'exit' 退出");

    const history = []; // 简单历史记录

    while (true) {
        const input = prompt("\nYou > ");
        if (!input || input.trim() === "") continue;
        if (input === "exit") break;

        history.push({ role: "user", content: input });

        // 生成签名头
        const dkHeader = await generateSignature(config.fp, keyData, privateKeyObj);

        try {
            const res = await fetch("https://zai.is/api/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": config.token,
                    "x-zai-darkknight": dkHeader,
                    "x-zai-fp": JSON.stringify(config.fp),
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Origin": "https://zai.is"
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    model: "gemini-3-pro-preview",
                    messages: history,
                    stream: true,
                    params: {}
                })
            });

            if (!res.ok) {
                console.log(`❌ 请求失败: ${res.status} ${await res.text()}`);
                continue;
            }

            // 处理流式响应
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            let buffer = "";

            console.log("Gemini > ", end=""); // Deno console buffer trick

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop(); // 保留未完成的行

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const jsonStr = line.slice(6).trim();
                        if (jsonStr === "[DONE]") continue;
                        try {
                            const json = JSON.parse(jsonStr);
                            const content = json.choices?.[0]?.delta?.content || "";
                            await Deno.stdout.write(new TextEncoder().encode(content));
                            fullText += content;
                        } catch {}
                    }
                }
            }
            console.log(""); // 换行
            history.push({ role: "assistant", content: fullText });

        } catch (e) {
            console.error("网络错误:", e);
        }
    }
}

async function createChat(config, jwk, privateKey) {
    const dkHeader = await generateSignature(config.fp, jwk, privateKey);
    const id = crypto.randomUUID();
    
    try {
        const res = await fetch("https://zai.is/api/v1/chats/new", {
            method: "POST",
            headers: {
                "Authorization": config.token,
                "x-zai-darkknight": dkHeader,
                "x-zai-fp": JSON.stringify(config.fp),
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            body: JSON.stringify({
                chat: {
                    id: "",
                    title: "Termux Chat",
                    models: ["gemini-3-pro-preview"],
                    params: {},
                    history: { messages: {}, currentId: id },
                    messages: [{ id: id, role: "user", content: "Hello", timestamp: Date.now() / 1000 }],
                    tags: [],
                    timestamp: Date.now()
                },
                folder_id: null
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            return data.id;
        } else {
            console.log("建房失败:", await res.text());
            return null;
        }
    } catch (e) {
        console.log("建房网络错误:", e);
        return null;
    }
}

main();
