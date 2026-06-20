# Tutorial Setup & Testing — reShare Marketplace

Tutorial lengkap untuk menyalakan semua environment dan melakukan testing end-to-end.

---

## Prasyarat

Install di komputer kamu:

| Software | Versi | Download |
|----------|-------|----------|
| Node.js | 18+ (disarankan 20) | https://nodejs.org |
| PostgreSQL | 14+ | https://www.postgresql.org/download/ |
| Redis | 7+ | Lihat opsi di bawah |
| Git | terbaru | https://git-scm.com |

### Opsi Install Redis di Windows

Redis tidak native di Windows. Pilih salah satu:

**Opsi A — Docker (Paling Mudah):**
```bash
docker run -d --name reshare-redis -p 6379:6379 redis:7
```

**Opsi B — Memurai (Redis for Windows):**
Download dari https://www.memurai.com/get-memurai — install, otomatis jalan di port 6379.

**Opsi C — WSL (Windows Subsystem for Linux):**
```bash
wsl
sudo apt update && sudo apt install redis-server
sudo service redis-server start
```

---

## BAGIAN 1 — Setup Database (PostgreSQL)

### 1.1 Buat Database

Buka terminal/pgAdmin, jalankan:

```sql
CREATE DATABASE reshare;
```

Atau via command line:
```bash
psql -U postgres -c "CREATE DATABASE reshare;"
```

Password default PostgreSQL biasanya `postgres`. Jika berbeda, update `DATABASE_URL` di `backend/.env`.

### 1.2 Verifikasi Koneksi

```bash
psql -U postgres -d reshare -c "SELECT 1;"
```

Harus menampilkan `1`.

---

## BAGIAN 2 — Setup Backend

### 2.1 Install Dependencies

```bash
cd backend
npm install
```

### 2.2 Konfigurasi .env

File `backend/.env` sudah ada. Pastikan nilainya sesuai:

```env
# Sesuaikan jika password PostgreSQL kamu berbeda
DATABASE_URL=postgresql://postgres:PASSWORD_KAMU@localhost:5432/reshare?schema=public

# Redis (default)
REDIS_URL=redis://localhost:6379

# Telegram bot token (isi dengan token dari @BotFather)
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
TELEGRAM_BOT_USERNAME=YOUR_BOT_USERNAME
```

### 2.3 Jalankan Migrasi Database

```bash
cd backend
npx prisma migrate dev --name init
```

Ini akan membuat semua tabel di PostgreSQL. Output yang diharapkan:
```
Your database is now in sync with your schema.
✔ Generated Prisma Client
```

### 2.4 (Opsional) Lihat Database dengan Prisma Studio

```bash
npx prisma studio
```

Buka browser di http://localhost:5555 — kamu bisa lihat semua tabel dan datanya.

### 2.5 Buat User Admin

Jalankan perintah ini untuk membuat akun admin pertama:

```bash
cd backend
npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash('admin123', 10);
  const user = await prisma.user.create({
    data: { email: 'admin@reshare.com', passwordHash: hash, role: 'ADMIN' }
  });
  console.log('Admin dibuat:', user.email, '/ password: admin123');
  await prisma.\$disconnect();
}
main();
"
```

### 2.6 Jalankan Backend

```bash
cd backend
npm run start:dev
```

Output yang diharapkan:
```
[Nest] LOG [NestApplication] Nest application successfully started
[Nest] LOG [TelegramService] Telegram bot started
```

Backend jalan di **http://localhost:3000**

### 2.7 Test Health Check

Buka terminal baru:
```bash
curl http://localhost:3000/api/health
```

Response: `{"status":"ok","timestamp":"2026-..."}`

---

## BAGIAN 3 — Unit Test

```bash
cd backend
npx jest --verbose
```

Hasil yang diharapkan: **59 tests passed, 13 suites**

---

## BAGIAN 4 — Test API Manual (dengan curl)

Buka terminal baru (backend harus tetap jalan).

### 4.1 Register Seller Baru

```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"seller1@test.com\",\"password\":\"password123\",\"name\":\"Toko Netflix\",\"phone\":\"081234567890\"}" | jq .
```

Response:
```json
{
  "id": "...",
  "email": "seller1@test.com",
  "role": "SELLER",
  "sellerStatus": "PENDING"
}
```

### 4.2 Login Seller

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"seller1@test.com\",\"password\":\"password123\"}" | jq .
```

Catat `accessToken` dari response. Gunakan sebagai `SELLER_TOKEN` di bawah.

### 4.3 Login Admin

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@reshare.com\",\"password\":\"admin123\"}" | jq .
```

Catat `accessToken` sebagai `ADMIN_TOKEN`.

### 4.4 Lihat Daftar Seller (Admin)

```bash
curl -s http://localhost:3000/api/admin/sellers \
  -H "Authorization: Bearer ADMIN_TOKEN" | jq .
```

Catat `id` seller dari response sebagai `SELLER_ID`.

### 4.5 Approve Seller (Admin)

```bash
curl -s -X POST http://localhost:3000/api/admin/sellers/SELLER_ID/approve \
  -H "Authorization: Bearer ADMIN_TOKEN" | jq .
```

Response: `{"id":"...","status":"APPROVED","storeCode":"store_..."}`

Catat `storeCode` — ini akan digunakan untuk link bot Telegram.

### 4.6 Submit Profil Rekening (Seller)

```bash
curl -s -X POST http://localhost:3000/api/seller/profile \
  -H "Authorization: Bearer SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"payoutAccount\":\"BCA 1234567890 a/n Seller\"}" | jq .
```

### 4.7 Verifikasi Profil (Admin)

```bash
curl -s -X POST http://localhost:3000/api/admin/sellers/SELLER_ID/verify-profile \
  -H "Authorization: Bearer ADMIN_TOKEN" | jq .
```

Seller sekarang **ACTIVE** dan bisa berjualan!

### 4.8 Tambah Produk (Seller)

```bash
curl -s -X POST http://localhost:3000/api/seller/products \
  -H "Authorization: Bearer SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"category\":\"streaming\",\"title\":\"Netflix Premium 1 Bulan\",\"basePrice\":50000}" | jq .
```

Catat `id` produk sebagai `PRODUCT_ID`.

### 4.9 Tambah Stok (Seller)

```bash
curl -s -X POST http://localhost:3000/api/seller/products/PRODUCT_ID/stock \
  -H "Authorization: Bearer SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"credentials\":\"netflix_user@email.com:Password123\"}" | jq .
```

Ulangi beberapa kali untuk tambah lebih banyak stok.

### 4.10 Lihat Produk & Stok

```bash
# Produk
curl -s http://localhost:3000/api/seller/products \
  -H "Authorization: Bearer SELLER_TOKEN" | jq .

# Stok (kredensial TIDAK akan muncul)
curl -s http://localhost:3000/api/seller/stock \
  -H "Authorization: Bearer SELLER_TOKEN" | jq .
```

### 4.11 Setup Markup (Admin)

```bash
curl -s -X PUT http://localhost:3000/api/admin/markup \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"markupMode\":\"FIXED\",\"markupValue\":500}" | jq .
```

---

## BAGIAN 5 — Test Bot Telegram

### 5.1 Buka Bot

1. Buka Telegram
2. Cari bot `@reShareApps_bot`
3. Klik **Start** — bot merespons dengan welcome message

### 5.2 Akses Toko via Deep Link

Buka link ini di browser/Telegram (ganti `STORE_CODE` dengan storeCode dari step 4.5):

```
https://t.me/reShareApps_bot?start=STORE_CODE
```

Bot akan menampilkan nama toko dan tombol:
- **Lihat Katalog** — tampilkan produk
- **Pesanan Saya** — riwayat pesanan

### 5.3 Coba Beli

1. Klik "Lihat Katalog"
2. Pilih produk
3. Klik "Konfirmasi Beli"
4. Bot mengirim QR code (mock sandbox)

### 5.4 Simulasi Pembayaran (Webhook Manual)

Setelah mendapat order, cari `partnerReferenceNo` dari log backend atau database.

Kirim webhook manual:
```bash
curl -s -X POST http://localhost:3000/v1.0/debit/notify \
  -H "Content-Type: application/json" \
  -d "{\"originalPartnerReferenceNo\":\"ORD_XXXXX\"}" | jq .
```

Ganti `ORD_XXXXX` dengan partnerReferenceNo yang sebenarnya.

Jika berhasil:
- Bot mengirim kredensial ke pembeli secara otomatis
- Ledger tercatat (saldo penjual bertambah)

### 5.5 Cek Saldo Seller

```bash
curl -s http://localhost:3000/api/seller/balance \
  -H "Authorization: Bearer SELLER_TOKEN" | jq .
```

### 5.6 Test Report

Di Telegram, kirim:
```
/report Akun tidak bisa login
```

---

## BAGIAN 6 — Setup & Test Mobile App

### 6.1 Install Dependencies

```bash
cd mobile
npm install
```

### 6.2 Konfigurasi API URL

Secara default, mobile app mengarah ke `http://localhost:3000/api`.

Untuk testing di HP fisik, kamu perlu ganti ke IP lokal:

Buat file `mobile/.env`:
```
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000/api
```

Ganti `192.168.x.x` dengan IP komputer kamu (cek dengan `ipconfig`).

### 6.3 Jalankan Mobile App

```bash
cd mobile
npx expo start
```

Opsi menjalankan:
- Tekan **`a`** — buka di Android (perlu Android Emulator / Expo Go)
- Tekan **`w`** — buka di web browser
- **Scan QR code** — buka di HP dengan Expo Go app

### 6.4 Test di Mobile

**Sebagai Seller:**
1. Buka app → Register → isi data → Daftar
2. Login → muncul tab Produk, Saldo, Profil
3. Tambah produk → tambah stok
4. Cek saldo di tab Saldo
5. Lihat profil & link toko

**Sebagai Admin:**
1. Login dengan admin@reshare.com / admin123
2. Dashboard — lihat statistik
3. Tab Penjual — approve, verify, suspend
4. Tab Settings — atur markup & bot config

---

## BAGIAN 7 — Troubleshooting

### Backend tidak bisa start

| Error | Solusi |
|-------|--------|
| `Environment validation failed: DATABASE_URL` | Pastikan `backend/.env` ada dan benar |
| `Can't reach database server` | Pastikan PostgreSQL jalan: `pg_isready` |
| `connect ECONNREFUSED 127.0.0.1:6379` | Pastikan Redis jalan |
| `409 Unauthorized` (Telegram) | Token bot salah atau expired |

### Prisma migrate gagal

```bash
# Reset database (HAPUS SEMUA DATA)
cd backend
npx prisma migrate reset

# Atau buat ulang
npx prisma migrate dev --name init
```

### Mobile app tidak bisa konek ke backend

1. Pastikan backend jalan di port 3000
2. Jika test di HP fisik, gunakan IP lokal (bukan localhost)
3. Pastikan firewall tidak memblokir port 3000

### Bot tidak merespons

1. Cek log backend — ada error Telegram?
2. Pastikan `TELEGRAM_BOT_TOKEN` valid
3. Coba restart backend

---

## Ringkasan Perintah Penting

```bash
# === SETUP ===
cd backend && npm install          # Install backend
npx prisma migrate dev --name init # Migrasi database
npm run start:dev                  # Jalankan backend

cd mobile && npm install           # Install mobile
npx expo start                     # Jalankan mobile

# === TESTING ===
cd backend && npx jest --verbose   # Unit tests (59 tests)
npx prisma studio                  # Visual database browser

# === MAINTENANCE ===
npx prisma migrate reset           # Reset database
npx prisma generate                # Regenerate Prisma client
```
