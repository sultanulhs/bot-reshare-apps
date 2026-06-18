# SPEC LENGKAP — Marketplace Akun Premium (Telegram + Mobile App)

> Dokumen tunggal untuk dieksekusi oleh Claude Code. Berisi seluruh konteks proyek:
> ringkasan & aturan kritis, PRD, spec teknis, pendaftaran penjual, multi-storefront &
> order lifecycle, dan kontrak REST API. Kerjakan per FASE (lihat bagian "SPEC TEKNIS"
> section 11). Bila ada konflik dengan ketentuan DANA sebenarnya, BERHENTI dan minta
> klarifikasi.

---

## DAFTAR ISI
1. Konteks & Aturan Kritis (ringkasan untuk dibaca lebih dulu)
2. PRD — Konteks Produk
3. Spec Teknis (stack, model data, fase implementasi)
4. Pendaftaran & Verifikasi Penjual
5. Multi-Storefront, Order Lifecycle & Laporan
6. Kontrak REST API Mobile

---


# ============================================================
# BAGIAN 1 — KONTEKS & ATURAN KRITIS
# ============================================================


Proyek: Marketplace akun premium digital (tanpa pengiriman fisik). Operator sebagai
perantara; pembayaran QRIS dinamis via DANA Enterprise.

## Antarmuka
- Bot Telegram (grammY) = storefront PEMBELI. Pembeli teridentifikasi via tgUserId otomatis.
- Mobile app (React Native/Expo) = pusat kontrol PENJUAL & ADMIN (REST API ber-JWT).
- Backend NestJS tunggal melayani keduanya.

## Peta dokumen (semua dalam file ini)
- BAGIAN 2 — PRD: konteks produk (non-teknis).
- BAGIAN 3 — Spec teknis: stack, aturan kritis, model data, fase implementasi (sumber utama).
- BAGIAN 4 — Pendaftaran & verifikasi penjual.
- BAGIAN 5 — Multi-storefront, order lifecycle, laporan.
- BAGIAN 6 — Kontrak REST API mobile.

## Aturan kritis (RINGKAS — detail di BAGIAN 3 section 3)
1. Webhook /v1.0/debit/notify: verifikasi signature pada RAW BODY. Path persis (byte-for-byte).
2. Verifikasi DANA dulu, baru bertindak (serah kredensial/ledger hanya setelah signature valid).
3. Idempotency: pemenuhan order unik per originalPartnerReferenceNo.
4. Stok lock saat order (Redis + status DB); lepas bila expired/gagal.
5. DANA SDK default PRODUCTION -> set env 'sandbox' saat testing.
6. Disbursement otomatis GATED: ledger hanya MENCATAT; jangan eksekusi pencairan (tunggu PKS DANA).
7. Kredensial & rekening: enkripsi AES-256-GCM, tak pernah plaintext/di-log, tak pernah
   dikembalikan ke mobile. Kunci enkripsi TERPISAH dari DB (abstraksi KeyProvider -> KMS).
8. Mobile: semua endpoint wajib JWT + RolesGuard (SELLER/ADMIN).
9. Seller.id internal PERMANEN (semua relasi ke sini). storeCode hanya alias di link,
   TERKUNCI di MVP.
10. Penjual menerima HARGA PENUH. Keuntungan operator = markup DI ATAS harga (mode FIXED
    nominal tetap, atau RANDOM dalam rentang; diatur admin), bukan potongan.
    partnerReferenceNo (bukan nominal) yang mencocokkan pembayaran.
11. Penjual wajib punya langganan ACTIVE untuk berjualan; langganan EXPIRED memblokir aksi
    jualan tanpa menghapus data. Bayar langganan via QRIS DANA (reuse webhook).

## Prinsip kerja
- Kerjakan per FASE sesuai BAGIAN 3 section 11. Jangan lompat fase.
- Backend dulu sampai stabil, mobile app (Expo) di fase akhir setelah kontrak API mantap.
- Jalankan UAT script resmi DANA (dana-id/uat-script) di sandbox sebelum finalisasi mapping
  field webhook — struktur payload pasti dari sana, bukan asumsi.
- Bila ada konflik dengan ketentuan DANA sebenarnya, BERHENTI dan minta klarifikasi.

## Yang JANGAN dilakukan
- Jangan bangun eksekusi disbursement otomatis.
- Jangan simpan KTP/identitas (dihilangkan dari scope; cukup no HP + rekening).
- Jangan kembalikan kredensial/rekening ke mobile dalam bentuk apa pun.
- Jangan ubah path webhook lewat global prefix.

# ============================================================
# BAGIAN 2 — PRD (KONTEKS PRODUK)
# ============================================================


**Versi:** 0.2 (Telegram storefront + React Native admin/seller app)
**Tanggal:** Juni 2026
**Pemilik produk:** Sultan

---

## 1. Ringkasan

Platform jual-beli akun premium digital (tanpa pengiriman fisik) dengan dua antarmuka:

- **Bot Telegram** — storefront untuk PEMBELI: lihat katalog, beli, bayar via QRIS DANA,
  terima kredensial otomatis.
- **Mobile app (React Native/Expo)** — pusat kontrol untuk PENJUAL & ADMIN: kelola stok
  & kredensial, setting bot, markup & langganan, approve penjual, monitoring.

Backend NestJS tunggal melayani kedua klien: bot Telegram dan REST API untuk mobile.
Operator (Anda) bertindak sebagai perantara; pembayaran difasilitasi DANA Enterprise.

## 2. Arsitektur tingkat tinggi

Pembeli berinteraksi lewat Bot Telegram (grammY). Penjual & Admin lewat Mobile App
(React Native/Expo). Keduanya memanggil Backend NestJS yang sama, yang menyimpan data di
PostgreSQL + Redis dan berkomunikasi dengan DANA untuk QRIS & webhook.

## 3. Aktor & antarmuka

| Aktor | Antarmuka | Fungsi utama |
|-------|-----------|--------------|
| Pembeli | Bot Telegram | Lihat katalog, beli, bayar, terima kredensial |
| Penjual | Mobile app | Kelola produk & stok (input kredensial), lihat saldo |
| Admin/Operator | Mobile app | Setting bot, markup & langganan, approve penjual, monitoring |

## 4. Pembagian fungsi per antarmuka

### 4.1 Bot Telegram (pembeli)
- /start, /catalog, beli, /myorders, terima & ambil ulang kredensial.
- TIDAK ada fungsi penjual/admin di bot. Bot murni storefront.

### 4.2 Mobile app — peran Penjual
- Login (autentikasi mobile, JWT).
- Registrasi sebagai penjual (status menunggu approve admin).
- Kelola produk: tambah/edit/nonaktifkan.
- Input stok akun beserta KREDENSIAL (dikirim aman ke server, disimpan terenkripsi).
- Lihat daftar stok (status tersedia/terkunci/terjual), saldo, riwayat penjualan.

### 4.3 Mobile app — peran Admin
- Approve/suspend penjual.
- Setting bot: teks sambutan, kategori, on/off fitur (konfigurasi tersimpan di server).
- Atur markup (mode tetap/acak + nilainya) & paket langganan penjual.
- Monitoring transaksi, ringkasan harian, saldo penjual & markup operator.
- Resend kredensial manual bila ada keluhan.

## 5. Alur transaksi inti (tidak berubah dari v0.1)

Pembeli pilih produk (bot) -> hitung total = harga dasar + markup acak -> kunci stok ->
DANA createOrder (QRIS dinamis) -> pembeli bayar -> webhook terverifikasi ->
order lunas, kredensial diserahkan ke pembeli via bot, saldo penjual (penuh) & markup operator dicatat.

## 6. Keamanan kredensial (DIPERKETAT karena server menyimpan)

Karena penjual menginput via mobile dan SERVER menyimpan kredensial terenkripsi, server
menjadi target bernilai tinggi. Persyaratan:
- Transport: HTTPS/TLS wajib untuk semua endpoint mobile.
- Autentikasi mobile: JWT (access + refresh), role-based (penjual vs admin).
- Enkripsi at-rest: AES-256-GCM; KUNCI ENKRIPSI TERPISAH DARI DATABASE (idealnya KMS).
- Kredensial tidak pernah di-log, tidak pernah dikembalikan ke mobile setelah disimpan
  (write-only dari sisi penjual; hanya server yang mendekripsi saat penyerahan ke pembeli).
- Audit akses ke kunci & ke endpoint kredensial.

## 7. Catatan kepatuhan (tetap berlaku)

Disbursement otomatis multi-penjual DITAHAN sampai konfirmasi PKS DANA. Ledger mencatat
saldo; eksekusi pencairan gated. Lihat spec section 3.

## 8. Scope MVP & fase

- MVP-1: Bot storefront + mobile (penjual input stok, admin approve, markup & langganan) + pembayaran
  sandbox + webhook + penyerahan kredensial.
- MVP-2: setting bot lanjutan, monitoring kaya, hardening.
- Ditunda: disbursement otomatis, panel web, multi-bahasa.

## 9. Kriteria sukses

- Pembeli menyelesaikan pembelian end-to-end (sandbox) tanpa intervensi.
- Penjual mengelola stok & kredensial penuh lewat mobile.
- Admin mengelola penjual, markup, langganan, setting bot lewat mobile.
- Kredensial aman: terenkripsi at-rest, kunci terpisah, tak ter-log.
- Lulus UAT script DANA sandbox.

# ============================================================
# BAGIAN 3 — SPEC TEKNIS
# ============================================================


> Untuk dieksekusi oleh Claude Code. Ikuti urutan fase di section 11. Jangan langgar
> aturan kritis di section 3. Backend NestJS melayani DUA klien: Bot Telegram (pembeli)
> dan REST API (mobile app untuk penjual & admin). Berhenti & minta klarifikasi bila ada
> konflik dengan ketentuan DANA sebenarnya (struktur field SDK bisa beda antar versi).

## 1. Tujuan

- Bot Telegram = storefront PEMBELI (katalog, beli, bayar QRIS, terima kredensial).
- Mobile app (React Native/Expo) = pusat kontrol PENJUAL & ADMIN.
- Backend NestJS tunggal: bot + REST API mobile, pembayaran via DANA Enterprise.

Bagian terkait dalam dokumen ini:
- BAGIAN 4 : alur pendaftaran & verifikasi penjual, profil pencairan terenkripsi.
- BAGIAN 5 : multi-storefront (deep link/storeCode), afiliasi pembeli, order lifecycle
  (termasuk on-demand WAITING_SELLER), laporan pasca-jual.
- BAGIAN 6 : kontrak REST mobile (penjual & admin).

## 2. Tech stack (TERKUNCI)

Backend:
- Node.js 18+, TypeScript strict, NestJS
- Bot: grammY
- REST API mobile: NestJS controllers + JWT auth (@nestjs/jwt, passport-jwt)
- DB: PostgreSQL + Prisma
- Cache/Lock/Queue: Redis + BullMQ
- Pembayaran: SDK resmi dana-node
- Enkripsi: AES-256-GCM (node:crypto), kunci dari env/KMS (abstraksi KeyProvider)
- Validasi: class-validator + class-transformer untuk DTO REST; zod/joi untuk env

Mobile:
- React Native via Expo (TypeScript)
- State/server-cache: TanStack Query
- HTTP: axios/fetch dengan interceptor JWT
- Secure storage token: expo-secure-store
- Navigasi: expo-router atau react-navigation

## 3. Aturan kritis (TIDAK BOLEH DILANGGAR)

1. Webhook raw body: /v1.0/debit/notify verifikasi signature terhadap RAW BODY string.
2. Path webhook persis /v1.0/debit/notify (byte-for-byte). Jangan ubah via global prefix.
   Catatan: REST API mobile boleh pakai prefix /api, TAPI route webhook harus dikecualikan
   dari prefix tersebut.
3. Verifikasi dulu baru bertindak: penyerahan kredensial & ledger hanya setelah parseWebhook sukses.
4. Idempotency: pemenuhan order unik terhadap originalPartnerReferenceNo (constraint DB + transaksi).
5. Stok lock: kunci unit stok saat order dibuat (Redis + status DB); lepas bila expired/gagal.
6. DANA env: SDK default PRODUCTION. Set env 'sandbox' eksplisit saat testing.
7. Disbursement GATED: jangan implementasi eksekusi pencairan otomatis. Ledger hanya mencatat.
8. Kredensial: tidak pernah plaintext di DB, tidak pernah di-log, tidak pernah dikembalikan
   ke mobile setelah disimpan (write-only dari penjual). Dekripsi hanya di memori server saat
   penyerahan ke pembeli.
9. KUNCI ENKRIPSI TERPISAH DARI DB. Abstraksi KeyProvider agar mudah pindah ke KMS. Jangan
   menaruh kunci di tabel database yang sama dengan ciphertext.
10. Auth mobile: semua endpoint mobile (kecuali login/register) wajib JWT. Role-based guard:
    SELLER vs ADMIN. Endpoint admin hanya untuk role ADMIN.

## 4. Struktur folder (backend)

src/
  main.ts                  # bootstrap; rawBody; /api prefix dgn webhook dikecualikan
  app.module.ts
  config/                  # env schema & validation
  prisma/                  # PrismaService + schema.prisma
  crypto/                  # CryptoService (AES-256-GCM) + KeyProvider
  auth/                    # JWT, guards (JwtAuthGuard, RolesGuard), strategi passport
  dana/                    # DanaService (SDK + WebhookParser)
  telegram/                # bot grammY (composer pembeli saja)
    composers/buyer.composer.ts
  catalog/                 # produk & kategori (dipakai bot & mobile)
  stock/                   # unit stok terenkripsi + locking
  order/                   # lifecycle order, expiry, fulfilment
  payment/                 # createOrder DANA, mapping status
  webhook/                 # controller /v1.0/debit/notify
  ledger/                  # saldo penjual & markup operator & fee langganan (disbursement GATED)
  subscription/            # paket & langganan berkala penjual (bayar via QRIS DANA)
  seller/                  # registrasi & approval
  botconfig/               # konfigurasi bot yang diatur admin (tersimpan di server)
  report/                  # laporan pasca-jual (relai pembeli<->penjual, eskalasi admin)
  mobile/                  # REST controllers utk mobile (seller.* & admin.*)
    seller.controller.ts
    admin.controller.ts

## 5. Model data (Prisma)

Tambahan dari v0.1: model User (auth mobile) & BotConfig. Seller ditautkan ke User.

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  passwordHash String
  role      Role     @default(SELLER)   // SELLER | ADMIN
  seller    Seller?
  createdAt DateTime @default(now())
}

model Seller {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  name      String
  status    SellerStatus @default(PENDING)
  products  Product[]
  ledger    LedgerEntry[]
  createdAt DateTime @default(now())
}

model Product {
  id        String  @id @default(cuid())
  sellerId  String
  seller    Seller  @relation(fields: [sellerId], references: [id])
  category  String
  title     String
  basePrice Int
  active    Boolean @default(true)
  stockUnits StockUnit[]
}

model StockUnit {
  id             String  @id @default(cuid())
  productId      String
  product        Product @relation(fields: [productId], references: [id])
  encCredentials String  // ciphertext AES-256-GCM
  iv             String
  authTag        String
  status         StockStatus @default(AVAILABLE)
  order          Order?
}

model Order {
  id                 String   @id @default(cuid())
  buyerTgUserId      BigInt
  stockUnitId        String   @unique
  stockUnit          StockUnit @relation(fields: [stockUnitId], references: [id])
  basePrice          Int
  markup             Int      // angka acak operator; penjual tetap dapat basePrice penuh
  totalAmount        Int
  partnerReferenceNo String   @unique
  danaReferenceNo    String?
  status             OrderStatus @default(PENDING)
  qrContent          String?
  expiresAt          DateTime
  createdAt          DateTime @default(now())
  fulfilledAt        DateTime?
}

model LedgerEntry {
  id        String   @id @default(cuid())
  sellerId  String?
  seller    Seller?  @relation(fields: [sellerId], references: [id])
  orderId   String
  type      LedgerType
  amount    Int
  createdAt DateTime @default(now())
}

model BotConfig {
  id          String  @id @default("singleton")
  welcomeText String  @default("")
  categories  String  // JSON array kategori aktif
  featuresOn  String  // JSON object feature flags
  updatedAt   DateTime @updatedAt
}

enum Role { SELLER ADMIN }
enum SellerStatus { PENDING APPROVED PROFILE_SUBMITTED ACTIVE SUSPENDED }
// Lifecycle & profil terenkripsi (KTP+rekening): lihat BAGIAN 4
enum StockStatus { AVAILABLE LOCKED SOLD }
enum OrderStatus { PENDING PAID WAITING_SELLER EXPIRED FAILED FULFILLED }
enum LedgerType { SELLER_CREDIT OPERATOR_MARKUP SUBSCRIPTION_FEE }
// Multi-storefront (storeCode, afiliasi pembeli), stockType (PRE_STOCKED/ON_DEMAND),
// dan entitas Report: lihat BAGIAN 5

## 6. REST API untuk mobile (kontrak ringkas)

Base prefix: /api. Semua kecuali auth wajib Bearer JWT. Lihat BAGIAN 6 untuk detail.

Auth:
  POST /api/auth/register        { email, password, name, phone } -> User(SELLER)+Seller(PENDING)
  POST /api/auth/login           { email, password } -> { accessToken, refreshToken, role }
  POST /api/auth/refresh         { refreshToken } -> { accessToken }
  (alur pendaftaran & verifikasi penjual lengkap: lihat BAGIAN 4)

Seller (role SELLER, status APPROVED untuk aksi stok):
  GET  /api/seller/me
  GET  /api/seller/products
  POST /api/seller/products      { category, title, basePrice }
  PATCH /api/seller/products/:id { title?, basePrice?, active? }
  POST /api/seller/products/:id/stock   { credentials }  // WRITE-ONLY, dienkripsi server
  GET  /api/seller/stock         // status unit; TIDAK pernah mengembalikan kredensial
  GET  /api/seller/balance       // dari ledger
  GET  /api/seller/sales

Admin (role ADMIN):
  GET   /api/admin/sellers
  POST  /api/admin/sellers/:id/approve
  POST  /api/admin/sellers/:id/suspend
  GET   /api/admin/markup        // mode + nilai markup operator
  PUT   /api/admin/markup        { markupMode, markupValue?, markupMin?, markupMax? }
  GET   /api/admin/subscription-plans
  PUT   /api/admin/subscription-plans   { plans: [...] }   // lihat 9.2
  GET   /api/admin/botconfig
  PUT   /api/admin/botconfig     { welcomeText?, categories?, featuresOn? }
  GET   /api/admin/stats
  GET   /api/admin/orders
  POST  /api/admin/orders/:id/resend   // resend kredensial manual

## 7. Kontrak modul backend (ringkas)

CryptoService: encrypt/decrypt AES-256-GCM; kunci via KeyProvider (env sekarang, KMS nanti).
AuthService: register, login (bcrypt/argon2), issue/verify JWT, refresh.
RolesGuard: baca role dari JWT, batasi endpoint admin/seller.
DanaService: createQrisOrder, verifyWebhook (sama seperti v0.1).
OrderService: createOrder (lock+createOrder DANA), fulfillIfUnpaid (idempoten), expireStaleOrders.
MarkupService: computeMarkup() -> integer sesuai markupMode (FIXED: markupValue; RANDOM: acak
  dalam [markupMin, markupMax]). Konfigurasi diatur admin.
SubscriptionService: kelola langganan penjual (lihat 9.2).
StockService: addStock(productId, credentials) -> enkripsi & simpan; listStock (tanpa kredensial).
BotConfigService: get/update konfigurasi bot; bot membaca ini saat melayani pembeli.
TelegramService: composer pembeli (/start pakai welcomeText dari BotConfig, /catalog, beli, /myorders).
WebhookController: /v1.0/debit/notify (raw body, verifikasi, fulfilment, SNAP code).

## 8. Env

DANA_ENV=sandbox
X_PARTNER_ID=
PRIVATE_KEY= (atau PRIVATE_KEY_PATH)
ORIGIN=
DANA_PUBLIC_KEY= (atau DANA_PUBLIC_KEY_PATH)
TELEGRAM_BOT_TOKEN=
DATABASE_URL=
REDIS_URL=
CREDENTIAL_ENC_KEY=      # base64 32-byte (sementara; pindahkan ke KMS)
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=2592000
ORDER_TTL_MINUTES=15

## 9. Pembayaran — detail DANA

Sama seperti v0.1: createOrder scenario API + payOptionDetails QRIS; webhook finishNotify di
/v1.0/debit/notify; WAJIB jalankan UAT script resmi DANA (dana-id/uat-script) di sandbox
sebelum finalisasi mapping field; render qrContent -> PNG via library qrcode untuk dikirim ke chat.

### 9.1 Keuntungan operator (markup acak) vs identitas transaksi — PENTING

PENJUAL MENERIMA HARGA PENUH yang ia tetapkan. Operator TIDAK memotong harga penjual.
Keuntungan operator murni dari ANGKA ACAK KECIL yang ditambahkan DI ATAS harga penjual.

Tidak ada "kode unik angka transfer" untuk mencocokkan pembayaran (trik QRIS statis). Di sini
QRIS DINAMIS DANA membawa partnerReferenceNo, jadi:

- Identitas transaksi = partnerReferenceNo (createOrder -> webhook). Pencocokan pembayaran ke
  order memakai ini — andal, unik, tanpa risiko bentrok.
- Keuntungan operator = markup acak. Alur: total = basePrice (penuh ke penjual) + markup acak.
  Pembeli bayar total. Saat sukses: basePrice -> ledger SELLER_CREDIT (penjual utuh),
  markup -> ledger OPERATOR_MARKUP.
- markup ditentukan oleh KONFIGURASI ADMIN dengan dua MODE pilihan:
  - mode FIXED: markup = markupValue (nominal tetap tiap transaksi, mis. Rp200).
  - mode RANDOM: markup = angka acak dalam [markupMin, markupMax] (mis. Rp100..Rp500).
  Karena partnerReferenceNo yang memegang identitas, nilai markup yang kebetulan sama antar
  transaksi TIDAK masalah — murni nilai keuntungan, bukan identifier.

Ringkas: penjual = harga penuh; operator = markup (fixed/random) di atasnya;
partnerReferenceNo = identitas transaksi. JANGAN potong harga penjual. JANGAN pakai nominal
untuk pencocokan.

Konfigurasi (admin): markupMode ('FIXED'|'RANDOM'), markupValue (untuk FIXED),
markupMin & markupMax (untuk RANDOM). Service: MarkupService.computeMarkup() mengembalikan
integer sesuai mode aktif. Validasi: pada RANDOM, markupMin <= markupMax; semua >= 0.

### 9.2 Langganan penjual (berkala) — sumber pendapatan kedua

Penjual membayar LANGGANAN BERKALA (bulanan/tahunan) agar bisa berjualan. Tarif & paket
ditentukan ADMIN. Pembayaran lewat QRIS DANA (alur sama seperti pembeli: createOrder ->
QR -> webhook -> verifikasi). Fee langganan dicatat ke ledger SUBSCRIPTION_FEE.

Paket langganan (admin kelola):
model SubscriptionPlan {
  id          String  @id @default(cuid())
  name        String              // mis. "Bulanan", "Tahunan"
  price       Int                 // rupiah
  periodDays  Int                 // 30, 365, dst.
  active      Boolean @default(true)
}

Langganan penjual:
model Subscription {
  id                 String   @id @default(cuid())
  sellerId           String
  planId             String
  status             SubStatus @default(PENDING) // PENDING|ACTIVE|EXPIRED|CANCELLED
  partnerReferenceNo String   @unique            // untuk pembayaran QRIS DANA
  startedAt          DateTime?
  expiresAt          DateTime?
  createdAt          DateTime @default(now())
}
enum SubStatus { PENDING ACTIVE EXPIRED CANCELLED }

Kaitan dengan status penjual (lihat BAGIAN 4):
- Penjual hanya boleh berjualan (status ACTIVE) bila punya Subscription ACTIVE yang belum
  expired. Saat langganan EXPIRED, blokir aksi jualan (produk/stok/fulfillment) sampai
  diperpanjang — TANPA menghapus data penjual/produk.
- Job terjadwal (BullMQ) menandai Subscription yang lewat expiresAt menjadi EXPIRED dan
  kirim push reminder sebelum jatuh tempo.

Alur bayar langganan:
1. Penjual pilih paket di mobile -> POST /api/seller/subscription/checkout { planId }.
2. Backend createOrder DANA (QRIS) dgn partnerReferenceNo -> kembalikan qrContent.
3. Penjual bayar; webhook /v1.0/debit/notify memverifikasi (idempoten, sama seperti order
   pembeli) -> Subscription ACTIVE, set startedAt/expiresAt, ledger SUBSCRIPTION_FEE.

Endpoint:
  Seller: GET /api/seller/subscription (status & masa berlaku),
          POST /api/seller/subscription/checkout { planId } -> { qrContent, partnerReferenceNo }
  Admin:  GET/PUT /api/admin/subscription-plans (kelola paket & tarif)

CATATAN: webhook DANA kini melayani DUA jenis pembayaran — order pembeli DAN langganan
penjual. Bedakan via partnerReferenceNo (mis. prefix/penanda jenis) saat fulfilment, agar
rute ke handler yang benar.

## 10. Pengujian

Unit: MarkupService (mode FIXED kembalikan markupValue; RANDOM dalam rentang), CryptoService round-trip, AuthService (hash & JWT), OrderService idempotency.
Integrasi: createOrder->webhook->fulfilment (sandbox); auth+role guard; addStock write-only
(pastikan GET stock tidak pernah membocorkan kredensial).
Idempotency: webhook sama 2x -> satu penyerahan & satu ledger.
Expiry: order tak dibayar -> stok kembali AVAILABLE.

## 11. Urutan implementasi (FASE)

Fase 0 - Scaffold backend: NestJS+TS strict, Prisma+schema, config+validasi env,
  PrismaService, Redis/BullMQ, CryptoService+KeyProvider+test.
Fase 1 - Auth & user: register/login/refresh, JWT, RolesGuard (SELLER/ADMIN).
Fase 2 - Seller domain (mobile API): products CRUD, addStock (enkripsi, write-only),
  listStock (tanpa kredensial), seller register->PENDING. Lifecycle pendaftaran lengkap
  (PENDING->APPROVED->PROFILE_SUBMITTED->ACTIVE, profil KTP+rekening terenkripsi):
  ikuti BAGIAN 4. Aksi produk/stok hanya untuk status ACTIVE.
Fase 3 - Admin domain (mobile API): approve/suspend, markup, kelola SubscriptionPlan (tarif),
  botconfig, stats, orders.
Fase 4 - Bot pembeli: grammY, /start (baca parameter deep link start=<storeCode> untuk
  menentukan storefront penjual; welcomeText dari BotConfig), /catalog (terfilter per toko),
  beli, /myorders, /report. Multi-storefront & afiliasi pembeli: ikuti BAGIAN 5.
Fase 5 - Order & QRIS: MarkupService (markup acak), OrderService.createOrder, DanaService.createQrisOrder
  (sandbox), render QR, timer expiry (BullMQ).
Fase 6 - Webhook & fulfilment: main.ts rawBody, WebhookController, verifikasi signature,
  fulfillIfUnpaid idempoten, penyerahan kredensial via bot, pencatatan ledger. Tangani dua
  cabang stok (PRE_STOCKED instan vs ON_DEMAND -> WAITING_SELLER + notif penjual) dan jalur
  laporan pasca-jual: ikuti BAGIAN 5.
Fase 6b - Langganan penjual: SubscriptionService, checkout via QRIS DANA (reuse webhook,
  bedakan via partnerReferenceNo), gating status ACTIVE pada langganan aktif, job EXPIRED +
  reminder. Lihat 9.2.

Fase 7 - Mobile app (Expo): auth flow + secure-store, navigasi role-based, layar penjual
  (produk, addStock, saldo), layar admin (approve, markup, langganan, botconfig, stats). Konsumsi REST API.
Fase 8 - Hardening: idempotency & expiry tests, error handling webhook (SNAP code), logging
  tanpa membocorkan kredensial, jalankan UAT script DANA.

## 12. Definition of Done (MVP)

- Pembeli: beli end-to-end di sandbox tanpa intervensi.
- Penjual: kelola produk & stok (kredensial write-only) via mobile.
- Admin: approve penjual, atur markup & langganan, setting bot via mobile.
- Webhook idempoten & terverifikasi; tak ada penyerahan/ledger ganda.
- Kredensial terenkripsi at-rest, kunci terpisah dari DB, tak ter-log, tak pernah dikembalikan ke mobile.
- Disbursement otomatis TIDAK aktif; saldo tercatat & bisa dilihat.
- Lulus UAT script DANA sandbox.

# ============================================================
# BAGIAN 4 — PENDAFTARAN & VERIFIKASI PENJUAL
# ============================================================


> (Bagian dari spec tunggal ini.) Mendefinisikan status penjual, field registrasi, profil pencairan
> terenkripsi, dan endpoint pendaftaran/verifikasi. Claude Code: ikuti ini untuk modul
> seller & auth.

## 1. Status penjual (lifecycle)

Urutan: PENDING -> APPROVED -> PROFILE_SUBMITTED -> ACTIVE. SUSPENDED bisa dari status mana pun.

| Status | Arti | Boleh jualan? |
|--------|------|---------------|
| PENDING | Baru daftar (data minimal), menunggu review awal admin | Tidak |
| APPROVED | Admin verifikasi penjual valid; wajib lengkapi profil pencairan | Tidak |
| PROFILE_SUBMITTED | Rekening pencairan terkirim, menunggu verifikasi | Tidak |
| ACTIVE | Profil terverifikasi; fungsi jualan terbuka | Ya |
| SUSPENDED | Diblokir admin (pelanggaran) | Tidak |

Aturan: aksi membuat produk / input stok HANYA untuk status ACTIVE.

## 2. Field pendaftaran (dua tahap)

### Tahap daftar (minimal — endpoint register)
- email (unik)
- password
- name
- phone (no HP/WhatsApp aktif; verifikasi via OTP DISARANKAN tapi opsional di MVP)

Catatan Telegram: penjual TIDAK perlu akun/nomor Telegram untuk berjualan (mereka pakai
mobile app). Notifikasi penjual lewat PUSH NOTIFICATION mobile. Hanya PEMBELI yang
teridentifikasi via Telegram (tgUserId otomatis dari bot, tanpa minta nomor). Jadi jangan
minta nomor Telegram dari penjual.

### Tahap lengkapi profil (setelah APPROVED)
- payoutAccount (bank/e-wallet + nomor rekening untuk pencairan nanti)

TIDAK ADA upload KTP / NIK / foto identitas. Verifikasi penjual cukup berbasis no HP (dari
tahap daftar) + rekening pencairan. Ini menyederhanakan alur dan mengurangi paparan UU PDP.

Rekening pencairan = data sensitif: WAJIB dienkripsi at-rest (AES-256-GCM, sama seperti
kredensial akun). Tidak pernah dikembalikan utuh ke mobile. Admin melihatnya lewat endpoint
khusus yang teraudit.

## 3. Model data tambahan (Prisma)

model SellerProfile {
  id            String  @id @default(cuid())
  sellerId      String  @unique
  seller        Seller  @relation(fields: [sellerId], references: [id])
  // rekening pencairan terenkripsi: ciphertext+iv+authTag
  encPayout     String
  payoutIv      String
  payoutTag     String
  verifiedAt    DateTime?
  createdAt     DateTime @default(now())
}

Perubahan enum SellerStatus:
enum SellerStatus { PENDING APPROVED PROFILE_SUBMITTED ACTIVE SUSPENDED }

## 4. Endpoint (lihat juga BAGIAN 6)

Auth/registrasi (publik):
  POST /api/auth/register   { email, password, name, phone } -> User(SELLER)+Seller(PENDING)

Seller (role SELLER):
  GET  /api/seller/status              // status terkini + langkah berikutnya
  POST /api/seller/profile             { payoutAccount }
       guard: status APPROVED -> set PROFILE_SUBMITTED; rekening dienkripsi server
  (aksi produk/stok di BAGIAN 6 hanya untuk status ACTIVE)

Admin (role ADMIN):
  GET  /api/admin/sellers?status=PENDING|PROFILE_SUBMITTED|...
  GET  /api/admin/sellers/:id          // detail; untuk PROFILE_SUBMITTED tampilkan rekening
       terdekripsi (akses TERAUDIT, log siapa melihat kapan)
  POST /api/admin/sellers/:id/approve  // PENDING -> APPROVED
  POST /api/admin/sellers/:id/verify-profile  // PROFILE_SUBMITTED -> ACTIVE
  POST /api/admin/sellers/:id/reject   { reason }
  POST /api/admin/sellers/:id/suspend  { reason }

## 5. Notifikasi status

Setiap transisi status mengirim PUSH NOTIFICATION ke mobile penjual (mis. via Expo Push):
- APPROVED: "Akun disetujui, silakan lengkapi rekening pencairan."
- ACTIVE: "Profil terverifikasi, Anda sudah bisa berjualan."
- REJECTED/SUSPENDED: sertakan alasan.

## 6. Keamanan data (WAJIB)

- Rekening pencairan = data sensitif. Enkripsi at-rest, jangan di-log.
- Endpoint admin yang menampilkan rekening HARUS mencatat audit (siapa, kapan, seller mana).
- Tidak menyimpan KTP/NIK, sehingga paparan data identitas pemerintah dihindari.

# ============================================================
# BAGIAN 5 — MULTI-STOREFRONT, ORDER LIFECYCLE & LAPORAN
# ============================================================


> (Bagian dari spec tunggal ini.) Mendefinisikan: storefront per penjual (deep link), storeCode,
> afiliasi pembeli, status order termasuk on-demand, dan entitas laporan pasca-jual.
> Claude Code: ikuti ini untuk modul telegram (bot), order, dan report.

## 1. Multi-storefront via deep link

Tiap penjual punya storefront sendiri di dalam SATU bot. Pemisahan terjadi lewat parameter
deep link Telegram, bukan bot terpisah.

- Link toko: https://t.me/<TELEGRAM_BOT_USERNAME>?start=<storeCode>
- Pembeli klik link -> tekan Start -> bot menerima parameter <storeCode> sekali.
- Bot menampilkan HANYA katalog penjual pemilik storeCode tsb.
- Kebijakan pindah toko: pembeli mengikuti link TERAKHIR yang diklik. Tidak dikunci.
  Backend menyimpan afiliasi toko terakhir pada data pembeli (lihat 3).

## 2. storeCode — identitas yang tampil di link

PRINSIP PENTING: pisahkan identitas internal dari kode yang tampil di link.

- Seller.id (cuid/uuid) = identitas internal PERMANEN. Semua relasi (produk, order,
  ledger) menunjuk ke Seller.id, TIDAK pernah ke storeCode. Data tak pernah rusak walau
  storeCode berubah.
- Seller.storeCode = alias yang muncul di link.

Aturan format storeCode (batasan Telegram untuk parameter start):
- Hanya A-Z a-z 0-9 garis bawah (_) dan minus (-). Maksimal 64 karakter. Tanpa spasi.
- Unik (constraint DB).

Pembuatan:
- Di-generate otomatis saat penjual di-approve. Contoh: "seller_" + random pendek
  (mis. seller_a1b2c3). Atau izinkan custom SEKALI saat approve (validasi format+keunikan).

Perubahan storeCode (keputusan MVP):
- MVP: storeCode TERKUNCI setelah dibuat (tidak ada fitur edit). Ini menghindari link lama
  yang sudah tersebar menjadi rusak.
- Masa depan (jangan dibangun sekarang): bila perlu ganti, gunakan pola ALIAS — simpan
  storeCode lama sebagai alias yang MASIH berfungsi (redirect ke Seller.id), jangan
  ganti-dan-buang. Bot mencocokkan parameter start ke kode aktif ATAU alias. Ini mencegah
  link lama mati. Tidak diimplementasikan di MVP.

## 3. Afiliasi pembeli (toko terakhir)

Pembeli teridentifikasi via tgUserId (otomatis dari bot). Saat masuk lewat ?start=storeCode,
backend mencatat afiliasi toko terakhir, agar kunjungan berikutnya tetap menampilkan toko itu
sampai pembeli mengklik link toko lain.

model BuyerAffiliation {
  id            String  @id @default(cuid())
  buyerTgUserId BigInt  @unique
  sellerId      String  // toko terakhir yang diklik; relasi ke Seller.id
  updatedAt     DateTime @updatedAt
}

Penambahan field pada Seller (lihat BAGIAN 4 untuk model Seller utama):
  storeCode String @unique

## 4. Order lifecycle (termasuk on-demand)

Stok campuran: produk bisa PRE_STOCKED (kredensial sudah ada) atau ON_DEMAND (disiapkan
penjual setelah dibeli). Tambah field pada Product:
  stockType StockType  // PRE_STOCKED | ON_DEMAND
enum StockType { PRE_STOCKED ON_DEMAND }

Status order diperluas:
enum OrderStatus { PENDING PAID WAITING_SELLER EXPIRED FAILED FULFILLED }

Alur setelah pembayaran terverifikasi (di webhook, lihat BAGIAN 3):
- Jika produk PRE_STOCKED: ambil StockUnit, serahkan kredensial instan -> FULFILLED.
- Jika produk ON_DEMAND: set order WAITING_SELLER, kirim PUSH NOTIFICATION ke penjual
  (mobile) untuk menyiapkan akun. Penjual input kredensial via mobile -> sistem serahkan
  ke pembeli via bot -> FULFILLED.

Kebijakan timeout ON_DEMAND (WAJIB ada, nilai dari env):
- Jika penjual tak menyiapkan dalam ORDER_FULFILL_SLA_MINUTES, order ditandai bermasalah:
  beri tahu admin & pembeli; pertimbangkan refund manual (refund via DANA Refund API,
  tetap GATED/manual di MVP). Jangan auto-refund tanpa kcontrol admin di MVP.

Endpoint mobile tambahan (seller, status ACTIVE):
  GET  /api/seller/pending-fulfillments        // daftar order WAITING_SELLER miliknya
  POST /api/seller/orders/:id/fulfill          { credentials }  // input akun on-demand,
       sistem enkripsi, serahkan ke pembeli, set FULFILLED. Idempoten.

## 5. Laporan pasca-jual (pembeli lapor ke penjual)

Pembeli & penjual tidak pernah kontak langsung; sistem merelai. Laporan masuk via bot,
diteruskan ke penjual di mobile, penjual merespons (mis. kirim akun pengganti), relai balik
ke pembeli via bot.

model Report {
  id            String  @id @default(cuid())
  orderId       String
  buyerTgUserId BigInt
  sellerId      String
  message       String
  status        ReportStatus @default(OPEN) // OPEN | RESPONDED | RESOLVED | ESCALATED
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
enum ReportStatus { OPEN RESPONDED RESOLVED ESCALATED }

Jalur:
- Bot (pembeli): /report <orderId> atau alur tombol -> buat Report OPEN -> push ke penjual.
- Mobile (penjual): lihat & balas laporan; bila kirim akun pengganti, relai ke pembeli via
  bot, set RESPONDED/RESOLVED.
- Eskalasi: bila penjual tak merespons dalam REPORT_SLA_HOURS, Report -> ESCALATED, admin
  diberi tahu. Admin TETAP bisa melihat & intervensi semua laporan (lindungi reputasi
  platform meski penanganan utama di penjual).

Endpoint:
  Mobile seller: GET /api/seller/reports, POST /api/seller/reports/:id/respond { message }
  Mobile admin:  GET /api/admin/reports, POST /api/admin/reports/:id/resolve

## 6. Env tambahan

TELEGRAM_BOT_USERNAME=     # untuk menyusun link t.me/<username>?start=<storeCode>
ORDER_FULFILL_SLA_MINUTES= # batas waktu penjual menyiapkan order on-demand
REPORT_SLA_HOURS=          # batas waktu penjual merespons laporan sebelum eskalasi

# ============================================================
# BAGIAN 6 — KONTRAK REST API MOBILE
# ============================================================


> Kontrak antara backend NestJS dan mobile app (React Native/Expo). Jadi sumber kebenaran
> bersama. Base URL: https://<host>/api. Format: JSON. Auth: Bearer JWT kecuali disebut publik.
> Semua nominal dalam rupiah (integer). Waktu dalam ISO-8601 UTC.

## Konvensi

- Header auth: Authorization: Bearer <accessToken>
- Error body: { "statusCode": number, "message": string|string[], "error": string }
- Role: SELLER | ADMIN. Endpoint /api/admin/* hanya ADMIN.
- Aksi stok penjual butuh Seller.status = APPROVED.

## Auth (publik)

POST /api/auth/register
  body: { email: string, password: string, name: string }
  efek: buat User(role=SELLER) + Seller(status=PENDING)
  201: { id, email, role, sellerStatus }

POST /api/auth/login
  body: { email, password }
  200: { accessToken, refreshToken, role, sellerStatus? }

POST /api/auth/refresh
  body: { refreshToken }
  200: { accessToken }

## Seller (role SELLER)

GET /api/seller/me
  200: { id, name, status, email }

GET /api/seller/products
  200: [ { id, category, title, basePrice, active, stockCount: { available, locked, sold } } ]

POST /api/seller/products
  guard: status APPROVED
  body: { category: string, title: string, basePrice: number }
  201: { id, category, title, basePrice, active }

PATCH /api/seller/products/:id
  body: { title?: string, basePrice?: number, active?: boolean }
  200: produk terupdate

POST /api/seller/products/:id/stock
  guard: status APPROVED
  body: { credentials: string }   // contoh: "user:pass" atau JSON string
  catatan: WRITE-ONLY. Server mengenkripsi (AES-256-GCM) lalu simpan. Response TIDAK
           mengembalikan kredensial. Kredensial tidak pernah bisa dibaca ulang via API.
  201: { stockUnitId, status: "AVAILABLE" }

GET /api/seller/stock
  query: ?productId=&status=
  200: [ { id, productId, status, createdAt } ]   // TANPA field kredensial apa pun

GET /api/seller/balance
  200: { available: number, currency: "IDR", entries: [ { orderId, amount, createdAt } ] }
  catatan: saldo dari ledger SELLER_CREDIT. Disbursement otomatis TIDAK tersedia di MVP.

GET /api/seller/sales
  200: [ { orderId, productTitle, amount, soldAt } ]

GET /api/seller/store-link
  200: { storeCode, url }   // url = https://t.me/<bot>?start=<storeCode>, siap disalin
  catatan: storeCode dibuat saat approve & terkunci di MVP (lihat BAGIAN 5).

## Admin (role ADMIN)

GET /api/admin/sellers
  query: ?status=    (PENDING|APPROVED|PROFILE_SUBMITTED|ACTIVE|SUSPENDED)
  200: [ { id, name, email, phone, status, productCount, createdAt } ]

GET /api/admin/sellers/:id
  200: { id, name, email, phone, status, profile?: { payoutAccount } }
  catatan: field profile hanya untuk status PROFILE_SUBMITTED/ACTIVE; rekening didekripsi
           server saat ditampilkan ke admin. Akses ini TERAUDIT (log siapa melihat, kapan,
           seller mana). Tidak ada KTP/NIK/foto identitas yang disimpan.

POST /api/admin/sellers/:id/approve
  efek: PENDING -> APPROVED (penjual lalu wajib lengkapi profil)
  200: { id, status: "APPROVED" }

POST /api/admin/sellers/:id/verify-profile
  efek: PROFILE_SUBMITTED -> ACTIVE (penjual boleh jualan)
  200: { id, status: "ACTIVE" }

POST /api/admin/sellers/:id/reject
  body: { reason: string }
  efek: tolak pendaftaran/profil; sertakan alasan (kirim ke penjual via push)
  200: { id, status }

POST /api/admin/sellers/:id/suspend
  body: { reason: string }
  200: { id, status: "SUSPENDED" }

(Endpoint sisi penjual untuk daftar & lengkapi profil ada di BAGIAN 4:
 POST /api/auth/register, GET /api/seller/status, POST /api/seller/profile)

GET /api/admin/markup
  200: { markupMode: "FIXED"|"RANDOM", markupValue: number, markupMin: number, markupMax: number }

PUT /api/admin/markup
  body: { markupMode: "FIXED"|"RANDOM", markupValue?: number, markupMin?: number, markupMax?: number }
  200: konfigurasi markup terbaru
  validasi: FIXED butuh markupValue>=0; RANDOM butuh markupMin<=markupMax, keduanya>=0.
  catatan: penjual selalu menerima harga penuh; markup ditambahkan DI ATAS, bukan dipotong.

GET /api/admin/botconfig
  200: { welcomeText, categories: string[], featuresOn: object }

PUT /api/admin/botconfig
  body: { welcomeText?: string, categories?: string[], featuresOn?: object }
  200: konfigurasi bot terbaru
  catatan: bot membaca konfigurasi ini saat melayani pembeli (mis. teks /start).

GET /api/admin/stats
  query: ?from=&to=
  200: { orders: { total, paid, fulfilled, expired },
         revenue: { gross, operatorMarkup, sellerCredit, subscriptionFees },
         topProducts: [ { title, count } ] }

GET /api/admin/orders
  query: ?status=&from=&to=&page=&pageSize=
  200: { items: [ { id, productTitle, totalAmount, status, createdAt } ], total, page, pageSize }

POST /api/admin/orders/:id/resend
  efek: kirim ulang kredensial ke pembeli via bot (untuk order FULFILLED)
  200: { ok: true }
  catatan: dekripsi hanya di memori server; tidak mengembalikan kredensial dalam response.

## Catatan keamanan untuk mobile

- Simpan accessToken & refreshToken di expo-secure-store, bukan AsyncStorage biasa.
- Pasang interceptor: pada 401, coba refresh sekali; bila gagal, logout.
- Jangan pernah cache kredensial akun di sisi mobile (memang tidak akan pernah dikirim ke mobile).
- Semua request lewat HTTPS.
