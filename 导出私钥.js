(async function forceHarvest() {
    // 1. 破解 console.log 屏蔽 (借尸还魂术)
    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    var cleanConsole = iframe.contentWindow.console; // 借用干净的 console
    
    cleanConsole.log("🔊 控制台功能已恢复，开始提取...");

    // 2. 数据库防卡死检测
    const dbOpenRequest = indexedDB.open("darkknight");
    
    setTimeout(() => {
        if(dbOpenRequest.readyState === "pending") {
            alert("⚠️ 数据库卡住了！\n请务必关闭开发者工具顶部的 'Application/应用' 标签页！\n然后重新运行此代码。");
        }
    }, 3000);

    dbOpenRequest.onsuccess = function(e) {
        const db = e.target.result;
        try {
            const tx = db.transaction(["keys"], "readonly");
            const store = tx.objectStore("keys");
            const getReq = store.get("current_keypair");
            
            getReq.onsuccess = async function(evt) {
                const result = evt.target.result;
                
                if (!result) {
                    alert("❌ 数据库是空的！请确认页面已完全加载并登录。");
                    return;
                }

                // 3. 智能定位私钥
                // 结构通常是: { keyPair: { privateKey: ... } } 或直接 { privateKey: ... }
                let targetKey = result.privateKey || (result.keyPair && result.keyPair.privateKey) || result.key;
                
                if (!targetKey) {
                    cleanConsole.error("❌ 未识别的密钥结构:", result);
                    alert("未找到 Key 对象，请查看控制台详情。");
                    return;
                }

                cleanConsole.log("🔎 找到密钥对象:", targetKey);
                cleanConsole.log("🔒 可导出状态 (extractable):", targetKey.extractable);

                // 4. 导出决战
                if (targetKey.extractable) {
                    try {
                        const jwk = await crypto.subtle.exportKey("jwk", targetKey);
                        
                        // 挂载到全局，防止日志被刷掉
                        window.FINAL_KEY = jwk;
                        
                        // 弹窗报喜
                        alert("🎉🎉🎉 成功了！\n私钥已保存到全局变量 window.FINAL_KEY \n\n请在控制台输入 'FINAL_KEY' (回车) 查看完整 JSON！");
                        
                        cleanConsole.log("%c [最终战利品] 👇", "color: #0f0; font-size: 20px; background: #000; padding: 10px;");
                        cleanConsole.log(JSON.stringify(jwk, null, 2));
                        
                    } catch (err) {
                        alert("导出报错：" + err.message);
                    }
                } else {
                    alert("💀 失败：密钥依然显示不可导出 (extractable: false)。\n这意味着 V6 脚本注入慢了一步。");
                }
            };
        } catch (err) {
            alert("读取 keys 表失败：" + err.message);
        }
    };
})();