# ปฏิทินทีมสื่อสารองค์กร

ระบบ HTML/CSS/JavaScript สำหรับกองอาคารสถานที่ มหาวิทยาลัยพะเยา ดัดแปลงจากไฟล์ต้นฉบับ ใช้ `fetch()` เรียก Supabase Auth, REST RPC และ Edge Function พร้อมเผยแพร่หน้าเว็บผ่าน GitHub Pages ไม่มี Node.js server ในการใช้งานจริง

## สิ่งที่ทำได้

- ปฏิทินทีมรายวันและไทม์ไลน์ 1 / 2 / 4 สัปดาห์
- สมาชิกทีม สถานที่ปฏิบัติงาน งานเช้า/บ่าย/ทั้งวัน และเตือนคนอยู่สำนักงานไม่พอ
- แผนประจำปีงบประมาณไทย 1 ตุลาคม–30 กันยายน พร้อม Gantt และความคืบหน้า
- วิเคราะห์ภาระงานรายบุคคล รายเดือน และปีงบประมาณตามความยาก
- AI สรุปภาพรวม รายงานผู้บริหาร ข้อความ LINE และความคืบหน้าแผน ผ่าน Edge Function
- เข้าสู่ระบบด้วยอีเมล/รหัสผ่านของ Supabase Auth; viewer ดูข้อมูล, editor/admin แก้ไขข้อมูลทีม
- ซิงก์เมื่อบันทึก และตรวจข้อมูลล่าสุดทุก 30 วินาทีขณะเปิดแท็บ (polling ไม่ใช่ Realtime)
- ตรวจ revision ก่อนเขียนทับ; บันทึกสมาชิกหลายคนใน transaction เดียว
- สำรอง JSON และโหมดสาธิตที่ไม่บันทึกข้อมูลจริง
- รองรับมือถือและ dark mode ตามอุปกรณ์

## เริ่มใช้งาน 4 ขั้นตอน

### 1. สร้างฐานข้อมูล

1. สร้างโปรเจกต์ที่ https://supabase.com/dashboard
2. เปิด **SQL Editor → New query** วางเนื้อหา `supabase/schema.sql` แล้ว Run **ครั้งเดียวในโปรเจกต์ใหม่**
3. ในชุดดาวน์โหลดมี `private/seed-original.sql` สำหรับนำสมาชิก 3 คนและงาน 1 รายการจากต้นฉบับเข้า หลังรัน schema แล้ว จึงรันไฟล์นี้; ถ้าไม่ต้องการข้อมูลเดิม ให้ข้าม
4. `private/` ถูกละไว้จาก Git และไม่ถูกนำไปเผยแพร่บน Pages เก็บไฟล์นี้เป็นส่วนตัว

### 2. สร้างบัญชีและกำหนดสิทธิ์

1. เปิด **Authentication → Users → Add user / Create new user** เพิ่มอีเมลและรหัสผ่านให้ผู้ใช้งาน และยืนยันอีเมลตามขั้นตอน Dashboard
2. คัดลอก User UID ของแต่ละคน
3. รัน SQL ใน SQL Editor โดยแทน UUID จริง:

```sql
insert into public.cc_access(user_id,role)
values ('ใส่-USER-UUID-จริง', 'admin')
on conflict(user_id) do update set role=excluded.role;
```

เพิ่มผู้บริหารเป็น `viewer` และผู้ลงแผนเป็น `editor` ด้วยคำสั่งเดียวกัน แต่เปลี่ยน role และ UUID

ทั้ง editor และ admin แก้ไขแผนงานของทีมได้ทั้งหมด ความแตกต่างระดับ admin สงวนไว้สำหรับการขยายระบบ; การเพิ่ม/ถอนสิทธิ์ผู้ใช้ในรุ่นนี้ทำที่ SQL Editor เท่านั้น หน้าเว็บไม่เปิดให้ตั้งสิทธิ์เอง การมีบัญชี Auth อย่างเดียวไม่ได้รับสิทธิ์ดูข้อมูล

ชื่อในเมนูสมาชิกทีมเป็นชื่อผู้รับผิดชอบงาน ไม่ได้สร้างบัญชีเข้าสู่ระบบให้อัตโนมัติ หากลืมรหัสผ่าน ผู้ดูแลต้องใช้ Supabase Auth ส่งลิงก์ recovery หรือตั้งรหัสผ่านใหม่; รุ่นนี้ยังไม่มีหน้า recovery

### 3. ตั้งค่า URL และ public key

คัดลอก **Project URL** และ **Publishable key** จากหน้าการเชื่อมต่อ/API ของโปรเจกต์ แก้ `config.js`:

```js
window.APP_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_...',
  AI_FUNCTION: 'summarize'
});
```

ใช้ legacy `anon` key ได้เช่นกัน **ห้ามใส่ `service_role`, `sb_secret_...`, รหัสฐานข้อมูล หรือ AI key ในไฟล์หน้าเว็บ/GitHub** Public key ถูกออกแบบให้ใช้ใน browser โดยสิทธิ์ข้อมูลถูกบังคับที่ RLS ทุกตาราง

ถ้ายังไม่ได้ตั้งค่า สามารถกด “ทดลองใช้งานด้วยข้อมูลตัวอย่าง” ได้

### 4. อัปขึ้น GitHub Pages

1. สร้าง repository ใหม่ชื่อ `media-team-calendar` และอัปไฟล์โครงการโดยให้ `index.html`, `config.js`, `assets/`, `package.json`, `scripts/` อยู่ที่ root
2. อย่าอัป `private/`, `.env`, `dist/`, `node_modules/` และ `.openai/` ถ้าใช้ Git จะละไว้ตาม `.gitignore` อยู่แล้ว
3. ต้องมี `.github/workflows/pages.yml` (โฟลเดอร์ขึ้นต้นด้วยจุด) ใน repository ด้วย
4. เปิด **Settings → Pages → Build and deployment → Source: GitHub Actions**
5. Push ที่ branch `main` หรือเปิด **Actions → Test and deploy GitHub Pages → Run workflow**
6. รอ workflow ผ่านและเปิด URL ที่ GitHub แสดงในหน้า Pages

URL รูปแบบ `https://6msee.github.io/media-team-calendar/` เป็นเพียงรูปแบบที่คาดหวังจนกว่า deployment สำเร็จ ยังไม่ใช่การยืนยันว่าเว็บเผยแพร่แล้ว หาก repository เป็น private ให้ตรวจว่าแผน GitHub รองรับ Pages ก่อน; อย่าเปลี่ยน visibility ของ repository อื่นเพื่อแก้ปัญหา

เมื่อแก้แผนงานแล้ว ข้อมูลจะบันทึกที่ Supabase ไม่ต้อง push GitHub ใหม่ ส่วนการแก้หน้าตาหรือโค้ดจึงค่อย push

## เปิดใช้ AI (ไม่บังคับ)

ระบบปฏิทินทำงานได้แม้ยังไม่เปิด AI การเรียก AI ต้องมีบัญชีผู้ให้บริการและ quota ตามเงื่อนไขของผู้ให้บริการ ไม่รับประกันการใช้งานฟรี

1. รัน `supabase/ai-rate-limit.sql` ใน SQL Editor หลังติดตั้ง schema (จำกัด 20 ครั้ง/ชั่วโมง/บัญชี)
2. ติดตั้งและเข้าสู่ระบบ Supabase CLI บนเครื่องผู้ดูแล แล้วรันจากโฟลเดอร์โปรเจกต์:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set --env-file .env
supabase functions deploy summarize --no-verify-jwt
```

สร้าง `.env` จาก `.env.example` และกรอกค่าจริง **เฉพาะในเครื่องผู้ดูแล**:

```dotenv
AI_API_KEY=คีย์ผู้ให้บริการAI
AI_MODEL=ชื่อโมเดลที่มีอยู่ในบัญชีผู้ให้บริการ
AI_API_URL=https://api.groq.com/openai/v1/chat/completions
ALLOWED_ORIGINS=https://6msee.github.io,http://localhost:8000
```

`ALLOWED_ORIGINS` ใส่เฉพาะ origin ไม่มี path `/media-team-calendar/` หากใช้ XAMPP origin มักเป็น `http://localhost` ให้เพิ่มค่านี้ด้วย

Edge Function ตรวจ token ผ่าน `/auth/v1/user` และตรวจ `cc_access` ด้วย JWT ของผู้เรียกเอง แม้ตั้ง `verify_jwt=false` ที่ gateway; ไม่มีการใช้ service role ใน function กุญแจ AI เก็บเฉพาะ secrets ฝั่ง Supabase ผู้ใช้ที่ได้รับสิทธิ์ viewer ก็เรียกสรุปได้

ข้อมูลแผนงาน ชื่อสมาชิก สถานที่ และหมายเหตุในช่วงที่เลือกจะถูกส่งไปยังผู้ให้บริการ AI เมื่อกด “สรุปงาน” ข้อความสรุปไม่ถูกบันทึกลงฐานข้อมูลโดยอัตโนมัติ

## โครงสร้างและ API

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้าจอและฟอร์มเข้าสู่ระบบ |
| `assets/styles.css` | ธีมม่วง–ทองและ responsive |
| `assets/app.js` | ปฏิทิน แผนปีงบประมาณ ภาระงาน และฟอร์ม |
| `assets/api.js` | fetch Auth / REST RPC / AI และ refresh token |
| `assets/dates.js` | การคำนวณวันและปีงบประมาณ |
| `config.js` | URL กับ public key เท่านั้น |
| `supabase/schema.sql` | ตาราง RLS trigger ตรวจข้อมูล และ transaction RPC |
| `supabase/functions/summarize/index.ts` | AI proxy พร้อมตรวจบัญชีและสิทธิ์ |
| `scripts/build.mjs` | คัดเฉพาะไฟล์หน้าเว็บเข้า `dist/` |
| `.github/workflows/pages.yml` | ตรวจโค้ด ทดสอบ และ deploy Pages |
| `private/` | สำเนาข้อมูลจากต้นฉบับ เฉพาะในชุดดาวน์โหลด |

| API | การใช้งาน |
|---|---|
| `POST /auth/v1/token?grant_type=password` | เข้าสู่ระบบ |
| `POST /auth/v1/token?grant_type=refresh_token` | ต่ออายุ session |
| `POST /rest/v1/rpc/cc_snapshot` | อ่าน snapshot ของทุกตารางในคำสั่งเดียว |
| `POST /rest/v1/rpc/cc_apply` | เพิ่ม/แก้/ลบเป็นชุด พร้อม expected revision |
| `POST /functions/v1/summarize` | ขอข้อความสรุปจาก AI |

ตาราง `cc_members`, `cc_entries`, `cc_plans`, `cc_config` เก็บแต่ละระเบียนเป็น JSONB แยกแถว พร้อม revision และ foreign key สำหรับผู้รับผิดชอบ/แผน จึงต่อยอดจากรูปแบบข้อมูลเดิมได้ `cc_access` เป็นตารางสิทธิ์แยกจากสมาชิกทีม

Session อยู่ใน `sessionStorage` ของแท็บและต่ออายุผ่าน refresh token ไม่เก็บรหัสผ่านในหน้าเว็บ เมื่อปิดแท็บต้องเข้าสู่ระบบใหม่ตามพฤติกรรมของเบราว์เซอร์ หากขาดการเชื่อมต่อจะแสดงข้อมูลที่โหลดไว้ล่าสุดพร้อมสถานะขัดข้อง ไม่คิวบันทึกแบบออฟไลน์

## สำรองและกู้ข้อมูล

กด **สำรอง JSON** หลังเข้าสู่ระบบเพื่อดาวน์โหลดข้อมูลทีมที่โหลดล่าสุด ไฟล์ประกอบด้วยชื่อสมาชิกและข้อมูลแผนงาน จัดเก็บเฉพาะผู้มีสิทธิ์ รุ่นนี้ยังไม่มีปุ่มนำเข้า JSON กลับ ผู้ดูแลกู้ข้อมูลผ่าน SQL Editor/เครื่องมือของ Supabase; สำรองข้อมูลฐานข้อมูลเพิ่มตามบริการที่เลือก

เมื่อลบสมาชิก ระบบลบงานรายวันของคนนั้นและปลดผู้รับผิดชอบในแผนประจำปี; เมื่อลบแผน จะปลดการเชื่อมโยงจากงานรายวัน หากเปิดฟอร์มค้างไว้และอีกคนแก้ไขรายการเดียวกัน ระบบแจ้ง conflict ให้ปิดฟอร์ม รีเฟรช แล้วเปิดใหม่

## ทดสอบในเครื่อง

หน้าเว็บไม่ต้องติดตั้ง npm packages ใช้ XAMPP วางโฟลเดอร์ใน `htdocs` แล้วเปิด `http://localhost/media-team-calendar/` หรือใช้:

```sh
python -m http.server 8000
```

เปิด `http://localhost:8000/` **ไม่เปิด `index.html` ด้วย file://** เพราะใช้ JavaScript modules

ตรวจและสร้างชุดเผยแพร่ด้วย Node.js 22 ขึ้นไป:

```sh
npm run check
npm test
npm run build
```

การทดสอบอัตโนมัติครอบคลุมการเรียก Auth/API, JWT, token refresh พร้อมกัน, conflict, network error, logout, ปีงบประมาณ และครึ่งวัน/สุดสัปดาห์ เป็นการทดสอบด้วย API จำลอง ยังต้องทดสอบ SQL/RLS และ AI กับโปรเจกต์ Supabase จริงก่อนใช้งาน

ใช้ `supabase/tests/manual-acceptance.sql` ใน SQL Editor ของโปรเจกต์ทดสอบ เพื่อตรวจ RLS, สิทธิ์ผู้ใช้, conflict และ transaction rollback ด้วย PostgreSQL จริง สคริปต์นี้ rollback ข้อมูลทดสอบทั้งหมดหลังจบ

หน้าจอคงรูปแบบจากต้นฉบับไว้ แต่การตรวจด้วยเบราว์เซอร์อัตโนมัติในรอบนี้ไม่สำเร็จเพราะการเชื่อมต่อเครื่องมือตรวจหน้าจอ timeout

ข้อจำกัดการคำนวณ: วันทำงานนับจันทร์–ศุกร์ ยังไม่หักวันหยุดนักขัตฤกษ์ งานหลายรายการที่วันทับกันนับแยกตามงาน คะแนนเป็นตัวชี้ภาระงานตามที่บันทึก ไม่ใช่การประเมินคุณภาพบุคลากร

## เอกสารผู้ให้บริการ

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Edge Function auth: https://supabase.com/docs/guides/functions/auth
- GitHub Pages custom workflow: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
