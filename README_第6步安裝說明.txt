第6步：PWA 前端登入頁＋第5步 API 串接

一、檔案
index.html
styles.css
app.js
config.js
manifest.json
service-worker.js
icon-192.png
icon-512.png

二、已設定的 Apps Script API
https://script.google.com/macros/s/AKfycbyQ-d9MLAsQkPs7LUS6RE-6_2Jio8NcENCTbyvxqm55uRlvYBmlbIuZPWMEH0GHzfve/exec

三、GitHub Pages 安裝
1. 建立新的 GitHub repository，例如：
   ksp-security-pwa
2. 將本資料夾內 8 個檔案全部放到 repository 根目錄。
3. GitHub → Settings → Pages。
4. Source：Deploy from a branch。
5. Branch：main。
6. Folder：/(root)。
7. Save。
8. 取得正式網址，例如：
   https://你的帳號.github.io/ksp-security-pwa/

四、測試順序
1. 手機或電腦開 GitHub Pages 網址。
2. 頁面上方 API 狀態應顯示「已連線」。
3. 輸入：
   S001
   KSP@0001
4. 點「登入系統」。
5. 正常應進入勤務資訊頁並顯示：
   人員編號、姓名、今日班別、勤務日期、上下班時間、日期類型。

五、若登入逾時
1. 先直接開 Apps Script /exec。
2. 必須看到：
   "ok": true
   "service": "KSP Security PWA API"
   "version": "step5-v1"
3. 若 Apps Script 重新部署後網址有改，請修改 config.js 的 API_URL。

六、本步範圍
本步只測試：
PWA → Apps Script API → 人員資料 → 月排班表 → 登入結果

第7步才加入：
上班簽到、QR掃描、GPS距離驗證、異常回報、今日紀錄。
