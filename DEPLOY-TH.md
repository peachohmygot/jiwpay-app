# อัปเดตรุ่นบัตรแนวนอนและเวลาเกม

ต้องอัปเดตทั้งเว็บและ Apps Script รอบนี้

1. แตก JiwPay-ready-to-upload.zip เปิดโฟลเดอร์ด้านใน จะเห็น index.html และ assets
2. Cloudflare → bank-jiwpay → New deployment → Upload static files เลือกโฟลเดอร์ด้านในนี้ แล้ว Deploy ไม่เลือก source ที่มี package.json หรือ wrangler.jsonc
3. อัปเดต backend/Code.gs ใส่ ADMIN_KEY เดิม เรียก installGameClock หนึ่งครั้ง แล้ว Deploy Apps Script เวอร์ชันใหม่ตาม backend/GAME_CLOCK_SETUP_TH.md
4. เปิดแอดมิน → เวลาเกม เลือกความเร็วและเริ่มนาฬิกา จบกิจกรรมกดหยุดเกม

การอัปโหลด static ไม่แก้ source ใน GitHub หากกลับไป build ผ่าน GitHub ให้ใช้ source ชุดใหม่ด้วย

# แก้ Cloudflare Workers bank-jiwpay

จากภาพวันที่ 24 กันยายน: Cloudflare ใช้ pnpm 10.11.1 และหยุดด้วย ERROR packages field missing or empty

แตก JiwPay-Cloudflare-fix.zip แล้วอัปโหลด 2 ไฟล์ด้านในที่หน้าแรก repository (ระดับเดียวกับ package.json):
- pnpm-workspace.yaml: แก้ packages และอนุญาต esbuild สำหรับ pnpm 10
- wrangler.jsonc: กำหนด Worker bank-jiwpay ให้เผยแพร่ไฟล์จาก dist

ใช้ Build command: npm run build, Deploy command: npx wrangler deploy, Root directory: / ตามภาพเดิม
หลัง Commit ให้ Cloudflare สร้าง deployment จาก commit ล่าสุด ไม่ใช่ retry commit เก่าก่อนแก้
ยังไม่ได้เผยแพร่ระบบจริงจากเครื่องนี้

อ้างอิง https://developers.cloudflare.com/workers/static-assets/get-started/

---

# อัปเดต JiwPay ผ่านหน้าเว็บ GitHub

ชุด JiwPay-GitHub-upload.zip มีเฉพาะ frontend พร้อมอัปโหลด แตก ZIP ก่อน ไม่อัปโหลด ZIP ทั้งก้อน

## ถ้า GitHub เดิมมี package.json, src และ public

1. เปิด repository เดิมบน GitHub แล้วเลือก branch ที่โฮสต์ใช้เผยแพร่ (มักชื่อ main)
2. เลือก Add file → Upload files
3. จากโฟลเดอร์ที่แตก JiwPay-GitHub-upload.zip ลาก src, public และไฟล์อื่นทั้งหมดด้านในเข้าหน้าอัปโหลด อย่าลากโฟลเดอร์ชั้นนอกมาครอบอีกชั้น package.json ต้องอยู่ระดับเดียวกับ src
4. ตรวจรายชื่อให้เป็น src/App.js, src/Admin.js ฯลฯ เพื่อแทนที่ไฟล์ที่ตำแหน่งเดิม
5. ใส่ข้อความ Update JiwPay scan and POS แล้ว Commit changes ถ้า branch ถูกป้องกัน ให้สร้าง branch และ pull request จากนั้น merge ตามขั้นตอนของ repository
6. ถ้าเชื่อมโฮสต์กับ branch นี้แล้ว ให้รอ deployment ใหม่สำเร็จ ไม่ใช่แค่ GitHub อัปโหลดสำเร็จ

โค้ดชุดนี้ใช้ Vite ถ้าโฮสต์เดิมใช้ Create React App ให้เปลี่ยน Framework เป็น Vite, Build command เป็น npm run build และ Output directory เป็น dist ด้วย

อย่าอัปโหลด node_modules, .env.local หรือ backend ที่ใส่ Admin Key จริงแล้ว ชุด upload ที่จัดให้ไม่มีไฟล์เหล่านี้
ถ้ามี package-lock.json/yarn.lock เก่าค้างอยู่จากโปรเจกต์เดิม ให้ใช้ lockfile ของชุดนี้ (pnpm-lock.yaml) เพียงระบบเดียวเพื่อไม่ให้โฮสต์ใช้ dependency เก่า

## ถ้ายังไม่มีโฮสต์: ตัวอย่าง Vercel

1. นำชุด frontend ขึ้น GitHub ตามขั้นตอนข้างบน
2. เข้า Vercel → Add New → Project → เชื่อม GitHub แล้ว Import repository
3. Framework Preset: Vite, Root Directory: โฟลเดอร์ที่มี package.json, Build Command: npm run build, Output Directory: dist, Node.js: 22.x ขึ้นไป
4. Deploy แล้วรอสถานะ Ready เปิด URL ที่ได้
5. ผู้ใช้เข้า URL ปกติ ผู้ดูแลเข้า URL เดียวกันต่อท้าย /#admin

URL Apps Script ที่ส่งมาใส่ไว้ใน frontend แล้ว ไม่ต้องใส่ Admin Key ใน Vercel ให้กรอกเฉพาะหน้าเข้าสู่ระบบแอดมิน
หากใช้ GitHub Pages หรือโฮสต์อื่น ขั้นตอนเผยแพร่ต่างกัน อย่าเปลี่ยนโฮสต์ของเว็บเดิมโดยไม่ตรวจว่าตอนนี้ใช้อะไรอยู่

## Apps Script เป็นอีกส่วนหนึ่ง

อัปเดต GitHub ไม่ได้อัปเดต Apps Script
ถ้ายังไม่ได้อัปเดต Code.gs ที่รวมการตรวจรุ่น QR ให้เปิด backend/Code.gs ในชุดเต็ม ใส่ ADMIN_KEY เดิม แล้ววางแทนโค้ดเดิม บันทึกและ Deploy → Manage deployments → Edit → New version → Deploy ใช้ URL เดิม
รุ่นเวลาเกมนี้ต้อง deploy GAS ใหม่ แม้เคยอัปเดต QR แล้ว และเรียก installGameClock ตามคู่มือ

## ตรวจหลังอัปเดต

- เมนูสแกน → สแกนรับเงิน เปิดกล้องก่อน หลังระบุบัตรจึงใส่ยอด เลือกผ่อนจะแสดงจำนวนงวด 3 หรือ 5
- POS เป็นเครื่องคิดเลข กดสร้าง QR แล้วลูกค้าสแกนจ่าย ยอดเงินไม่ได้เข้าทันทีแค่สร้าง QR
- ลองรีเฟรชเว็บและตรวจว่าบัญชียังล็อกอินอยู่ ใช้มือถือจริงทดสอบสิทธิ์กล้อง
- ใช้บัญชีทดสอบตรวจการชำระก่อนใช้งาน และตรวจประวัติเมื่อเครือข่ายขาดก่อนส่งซ้ำ

อ้างอิง:
- https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
- https://vercel.com/docs/git/vercel-for-github
- https://github.com/vitejs/vite/blob/main/docs/guide/static-deploy.md
