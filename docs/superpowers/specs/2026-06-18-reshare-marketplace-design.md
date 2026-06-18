# reShare — Marketplace Akun Premium Digital

**Date:** 2026-06-18
**Owner:** Sultan
**Status:** Approved

## Overview

Platform jual-beli akun premium digital dengan dua antarmuka:
- **Telegram Bot** (grammY) — storefront pembeli: katalog, beli, bayar QRIS, terima kredensial
- **Mobile App** (React Native/Expo) — pusat kontrol penjual & admin

Backend NestJS tunggal melayani keduanya. Pembayaran via DANA Enterprise QRIS dinamis.

## Architecture

```
Telegram Bot (Pembeli) ──▶ NestJS Backend ◀── Expo Mobile (Seller/Admin)
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
                PostgreSQL   Redis    DANA Enterprise
                (Prisma)    (BullMQ)  (QRIS Payment)
```

## Repository Structure

```
bot-reshare-apps/
├── backend/                 # NestJS (bot + REST API)
│   ├── src/
│   │   ├── main.ts          # bootstrap; rawBody; /api prefix (webhook excluded)
│   │   ├── app.module.ts
│   │   ├── config/          # env schema & validation
│   │   ├── prisma/          # PrismaService + schema.prisma
│   │   ├── crypto/          # CryptoService (AES-256-GCM) + KeyProvider
│   │   ├── auth/            # JWT, guards, passport strategy
│   │   ├── dana/            # DanaService (SDK + WebhookParser)
│   │   ├── telegram/        # grammY bot (buyer composers)
│   │   ├── catalog/         # products & categories
│   │   ├── stock/           # encrypted stock units + locking
│   │   ├── order/           # order lifecycle, expiry, fulfilment
│   │   ├── payment/         # DANA createOrder, status mapping
│   │   ├── webhook/         # /v1.0/debit/notify controller
│   │   ├── ledger/          # seller balance & operator markup
│   │   ├── subscription/    # seller subscription plans & payments
│   │   ├── seller/          # registration & approval
│   │   ├── botconfig/       # admin-managed bot configuration
│   │   ├── report/          # post-sale reports (buyer<->seller relay)
│   │   └── mobile/          # REST controllers (seller.* & admin.*)
│   └── prisma/
│       └── schema.prisma
├── mobile/                  # Expo React Native app
│   └── src/
└── docs/
```

## Tech Stack (Locked)

**Backend:** Node.js 18+, TypeScript strict, NestJS, grammY, PostgreSQL + Prisma, Redis + BullMQ, dana-node SDK, AES-256-GCM encryption, @nestjs/jwt + passport-jwt, class-validator

**Mobile:** React Native via Expo (TypeScript), TanStack Query, axios, expo-secure-store, expo-router

## Key Decisions

1. **Monorepo** — backend/ and mobile/ as independent packages in one repo
2. **Placeholder credentials** — DANA & Telegram use dummy .env values initially
3. **Sequential phases** — Fase 0-8, backend first until stable
4. **Markup model** — Operator profit added ON TOP of seller price (FIXED or RANDOM mode), never deducted
5. **Credential security** — AES-256-GCM, KeyProvider abstraction (env now, KMS later), write-only from seller, never returned to mobile, never logged
6. **Webhook routing** — Single /v1.0/debit/notify handles both buyer orders and seller subscriptions, differentiated by partnerReferenceNo prefix
7. **Disbursement** — GATED, ledger records only, no auto-payout

## Data Models

As defined in spec BAGIAN 3.5: User, Seller, SellerProfile, Product, StockUnit, Order, LedgerEntry, BotConfig, SubscriptionPlan, Subscription, BuyerAffiliation, Report.

## Implementation Phases

| Phase | Focus | Key Deliverables |
|-------|-------|-----------------|
| 0 | Scaffold | NestJS + Prisma schema + Redis + CryptoService + KeyProvider |
| 1 | Auth | Register/Login/Refresh, JWT, RolesGuard (SELLER/ADMIN) |
| 2 | Seller domain | Products CRUD, encrypted stock, seller lifecycle (PENDING→ACTIVE) |
| 3 | Admin domain | Approve/suspend, markup config, subscription plans, botconfig |
| 4 | Telegram bot | grammY, deep link storefront, catalog, buy flow, /report |
| 5 | Order & QRIS | MarkupService, OrderService, DanaService, QR rendering, expiry |
| 6 | Webhook | Signature verification, idempotent fulfilment, credential delivery |
| 6b | Subscriptions | Seller subscription checkout via QRIS, active gating, expiry jobs |
| 7 | Mobile app | Expo auth flow, seller screens, admin screens |
| 8 | Hardening | Tests, error handling, DANA UAT |

## Reference

Full spec: [Spec Bot reShare.md](../../../Spec%20Bot%20reShare.md)
