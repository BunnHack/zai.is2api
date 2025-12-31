(async function perfectPlant() {
    // 您的 Python 同款钥匙
    const MY_MASTER_KEY = {
        "crv": "P-256",
        "d": "xxx",
        "ext": true,
        "key_ops": ["sign"],
        "kty": "EC",
        "x": "xxx",
        "y": "xxx"
    };

    console.log("☢️ 执行完美伪装植入...");

    try {
        // 1. 还原密钥对象
        const privateKey = await crypto.subtle.importKey(
            "jwk", MY_MASTER_KEY, 
            { name: "ECDSA", namedCurve: "P-256" }, 
            true, ["sign"]
        );
        const pubJwk = { ...MY_MASTER_KEY };
        delete pubJwk.d; delete pubJwk.key_ops;
        const publicKey = await crypto.subtle.importKey(
            "jwk", pubJwk, 
            { name: "ECDSA", namedCurve: "P-256" }, 
            true, ["verify"]
        );

        // 2. 打开数据库
        const req = indexedDB.open("darkknight");
        
        req.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction(["keys"], "readwrite");
            const store = tx.objectStore("keys");

            // 3. 🔥 构造完美结构 (关键修正点) 🔥
            const valueToStore = {
                id: "current_keypair",
                // 必须包在 keyPair 里
                keyPair: {
                    privateKey: privateKey,
                    publicKey: publicKey
                },
                // 必须附带 JWK 格式的公钥
                publicKeyJwk: pubJwk
            };
            
            const putReq = store.put(valueToStore);
            
            putReq.onsuccess = () => {
                console.log("%c✅ 植入成功！结构已修正！", "color:green;font-size:20px;font-weight:bold");
                alert("✅ 钥匙已植入！\n\n点击确定后，请手动刷新页面，然后登录。\n这次它绝对不会变了！");
            };
            
            putReq.onerror = (err) => {
                console.error("写入失败:", err);
                alert("写入失败，请检查 Application 面板是否关闭？");
            };
        };

    } catch (e) {
        console.error("代码报错:", e);
        alert("执行出错: " + e.message);
    }
})();