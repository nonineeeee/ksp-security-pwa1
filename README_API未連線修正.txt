第6步 API未連線修正版

已修正：
- API健康檢查不再使用跨網域 fetch(doGet)
- 改用與登入相同的 POST + iframe + postMessage
- Service Worker cache 已升級

請確認 config.js：
API_URL 必須等於你目前「直接開啟可看到 step5-v1 JSON」的正式 /exec。

目前檔案內設定為：
https://script.google.com/macros/s/AKfycbyQ-d9MLAsQkPs7LUS6RE-6_2Jio8NcENCTbyvxqm55uRlvYBmlbIuZPWMEH0GHzfve/exec

GitHub Pages：
將本壓縮檔內所有檔案直接覆蓋 repository 根目錄並 Commit。

如果你目前成功的 /exec 網址不是上面這一條：
請只修改 config.js 的 API_URL，再 Commit。

手機端若仍顯示舊版：
關閉 PWA → 重新開啟。
必要時移除已安裝 PWA / 清除此網站資料後重新安裝。
