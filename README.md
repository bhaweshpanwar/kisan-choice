
# Kisan Choice Backend API

A secure, scalable, and modular Node.js + Express backend for the Kisan Choice web platform — an initiative to digitally empower Indian farmers by enabling direct-to-consumer sales, eliminating middlemen, and offering a fair, negotiation-based marketplace.

## Live Frontend

https://heroic-dragon-0b1a27.netlify.app

## Backend API URL

https://kisan-choice.onrender.com

Health check:

```
curl https://kisan-choice.onrender.com/
```

Response:

```json
{
  "status": "success",
  "message": "Kisan Choice Server",
  "frontend": "https://heroic-dragon-0b1a27.netlify.app",
  "github": "https://github.com/bhaweshpanwar/kisan-choice"
}
```

## Table of Contents

- [Overview](#overview)
- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [API Modules](#api-modules)
- [Security](#security)
- [Environment Variables](#environment-variables)
- [How to Run Locally](#how-to-run-locally)
- [Database Schema](#database-schema)
- [Deployment (Render Free Tier)](#deployment-render-free-tier)
- [Cron Jobs on Free Tier](#cron-jobs-on-free-tier)
- [Future Scope](#future-scope)
- [Author](#author)

## Overview

The Kisan Choice backend powers a full-stack web application aimed at improving agricultural commerce in India by:

- Eliminating middlemen and reducing exploitation.
- Empowering farmers to manage listings, offers, and orders.
- Creating a transparent, direct farmer-to-consumer marketplace.

## Core Features

- Role-based Authentication: Farmer, Consumer, Admin
- Google & Facebook OAuth (Passport.js)
- Product Listings & Management: Farmers manage stock
- Offer & Negotiation System: Buyers can make single-use offers; farmers can accept, reject, or block
- Secure Payments: Stripe payment integration with webhook handling
- Order Management: Add to cart, checkout, automatic "delivered" promotion after 2 days
- Email OTP & Password Reset: Via Nodemailer (Mailtrap / SendGrid)
- Spam Protection: Farmers can block abusive users
- Dashboard Access: User-specific navigation
- Scheduled Jobs: Auto-expire accepted offers, auto-mark shipped orders as delivered
- JWT Authentication: Session security via httpOnly cookies
- AI Integration: Google Gemini API for product description support

## Tech Stack

| Layer            | Technology                                    |
|------------------|-----------------------------------------------|
| Backend          | Node.js, Express.js                           |
| Database         | PostgreSQL (Neon — serverless, free tier)     |
| Cache / OTP      | Redis (optional, stubbed by default)          |
| Auth & Security  | JWT, Bcrypt, Passport (Google + Facebook)     |
| Payments         | Stripe                                        |
| Email            | Nodemailer (Mailtrap / SendGrid)              |
| AI               | @google/generative-ai (Gemini)                |
| Scheduling       | node-cron                                     |
| DevOps           | Docker, Render Web Service (free tier)        |
| Monitoring       | Winston Logger                                |
| Middleware       | dotenv, express-rate-limit, helmet, hpp, CORS |

## Project Structure

```
backend/
├── config/              # Passport setups
├── controllers/         # API logic for each feature
├── db/                  # PostgreSQL pool + Redis client
├── dev-data/            # Templates, dummy data
├── models/              # DB models and validators
├── routes/              # Express routers
├── public/              # Static assets (user images etc.)
├── utils/               # Reusable utilities (cron, token, mail, cartCleaner, ...)
├── views/               # Email templates
├── app.js               # Express app entry
├── server.js            # Server runner
├── dockerfile           # Production container
├── ecosystem.config.js  # PM2 config (legacy AWS deploy)
└── package.json
```

## API Modules

| Module        | Routes                                       |
|---------------|----------------------------------------------|
| Users         | `/api/v1/users/`                             |
| Auth          | `/auth/`                                     |
| Products      | `/api/v1/products/`                          |
| Reviews       | `/api/v1/reviews/`                           |
| Cart          | `/api/v1/cart/`                              |
| Orders        | `/api/v1/orders/`                            |
| Negotiations  | `/api/v1/negotiations/`                      |
| Block Users   | `/api/v1/block/`                             |
| Webhooks      | `/api/v1/cart/webhook`                       |
| Admin (cron)  | `/api/v1/admin/orders-tick`, `/cart-tick`    |

## Security

- Rate Limiting: `express-rate-limit` (100 req / hr per IP on `/api`)
- Helmet for HTTP headers
- HPP (HTTP Parameter Pollution) protection
- CORS: Strict origin allowlist with credentials
- Mongo sanitize (defense in depth, even though DB is Postgres)
- Cookie Management: `cookie-parser` with httpOnly JWT cookies
- Logger: Winston for structured logging
- Trust-proxy enabled for accurate `req.ip` behind Render's reverse proxy

## Environment Variables

The app reads from `config.env` locally, and from platform env vars in production. **Never commit `config.env`** — it is in `.gitignore`.

| Key                       | Purpose                                                |
|---------------------------|--------------------------------------------------------|
| `NODE_ENV`                | `development` / `production`                           |
| `APP_PORT`                | Port to bind (Render uses `10000`)                     |
| `DATABASE_URL`            | Postgres connection string (must include `?sslmode=require` for Neon) |
| `JWT_SECRET`              | JWT signing secret                                     |
| `JWT_EXPIRES_IN`          | Token lifetime, e.g. `90d`                             |
| `JWT_COOKIE_EXPIRES_IN`   | Cookie lifetime in days                                |
| `EMAIL_HOST`              | SMTP host (e.g. `smtp.mailtrap.io`)                    |
| `EMAIL_PORT`              | SMTP port                                              |
| `EMAIL_USERNAME`          | SMTP username                                          |
| `EMAIL_PASSWORD`          | SMTP password                                          |
| `EMAIL_FROM`              | From address                                           |
| `SENDGRID_USERNAME`       | `apikey`                                               |
| `SENDGRID_PASSWORD`       | SendGrid API key                                       |
| `STRIPE_SECRET_KEY`       | Stripe secret key                                      |
| `STRIPE_WEBHOOK_SECRET`   | Stripe webhook signing secret                          |
| `GOOGLE_CLIENT_ID`        | Google OAuth client ID                                 |
| `GOOGLE_CLIENT_SECRET`    | Google OAuth client secret                             |
| `FACEBOOK_APP_ID`         | Facebook OAuth app ID                                  |
| `FACEBOOK_APP_SECRET`     | Facebook OAuth app secret                              |
| `GOOGLE_GEMINI_API_KEY`   | Google Gemini API key                                  |
| `FRONTEND_URL`            | Public frontend URL (used for Stripe redirects)        |
| `CRON_SECRET`             | Shared secret for `/api/v1/admin/*` cron endpoints    |
| `ENABLE_INPROCESS_CRON`   | `false` to disable in-process `node-cron`              |
| `REDIS_USERNAME`          | Redis username (only if Redis is re-enabled)           |
| `REDIS_PASSWORD`          | Redis password                                         |
| `REDIS_HOST`              | Redis host                                             |
| `REDIS_PORT`              | Redis port                                             |

## How to Run Locally

```bash
# 1. Clone the repo
git clone https://github.com/bhaweshpanwar/kisan-choice.git
cd kisan-choice

# 2. Setup environment
cp config.env.example config.env   # then fill in your values

# 3. Install dependencies
npm install

# 4. Start development server
npm run dev
```

For production-style local run:

```bash
npm start
```

## Database Schema

This app uses a relational PostgreSQL database. Key tables include:

- `users`, `farmers`, `products`
- `orders`, `order_items`, `cart`, `cart_items`
- `offers`, `accepted_offers`, `reviews`, `blocked_accounts`

All tables are designed with foreign key constraints and UUID-based IDs.

## Deployment (Render Free Tier)

The backend is deployed on **Render** as a Dockerized Web Service on the free tier, with **Neon** for managed Postgres.

### Why Render free tier?

- $0/month — keeps AWS cost out of the picture while traffic is still small.
- Free tier sleeps after 15 minutes of inactivity (cold start ~30s on first request).
- Docker support — the existing `dockerfile` is reused as-is.

### One-time setup

1. **Render Web Service**
   - New → Web Service → connect this repo, branch `master`.
   - Runtime: **Docker**.
   - Instance Type: **Free**.
   - Health Check Path: `/`.
   - Region: Oregon (or closest available).

2. **Environment variables**
   - Copy everything from your local `config.env` into Render's Environment tab.
   - `DATABASE_URL` must be a Neon **pooled** connection URL ending in `?sslmode=require`.
   - Set `NODE_ENV=production`.
   - Set `APP_PORT=10000` (Render's default).

3. **Neon database**
   - Create a project + branch on [neon.tech](https://neon.tech).
   - Use the pooled connection URL (the one with `-pooler` in it).
   - Import any existing data from AWS RDS via `pg_dump` / `pg_restore`.

4. **External services** — update the new URLs in:
   - **Netlify frontend env var** → `VITE_API_URL=https://kisan-choice.onrender.com`
   - **Google OAuth** → add `https://kisan-choice.onrender.com/auth/google/callback`
   - **Facebook OAuth** → add the same callback URL
   - **Stripe webhook** → `https://kisan-choice.onrender.com/api/v1/cart/webhook`

5. **CORS** — `app.js`'s `allowedOrigins` must include the Render URL and the frontend URL.

### Keeping the DB connection alive

Free-tier Postgres (and Neon's pooler in particular) drops idle sockets after ~60s. `db/db.js` includes a `SELECT 1` keepalive ping every 25 seconds, plus `ssl: { rejectUnauthorized: false }` and a 15s `connectionTimeoutMillis` — these together eliminate the connection-timeout errors that appeared on AWS.

## Cron Jobs on Free Tier

Render's free tier spins the service down after 15 minutes of inactivity, so in-process `node-cron` does not fire reliably.

The app exposes two secret-protected admin endpoints so an external free cron pinger (e.g. [cron-job.org](https://cron-job.org)) can trigger the jobs:

| Endpoint                              | Job                                                   |
|---------------------------------------|-------------------------------------------------------|
| `POST /api/v1/admin/orders-tick`      | Promote shipped orders older than 2 days to delivered |
| `POST /api/v1/admin/cart-tick`        | Expire accepted offers past their `expiry_time`       |

Both endpoints require the `CRON_SECRET` shared secret (header `x-cron-secret` or query param `secret`). Configure them on cron-job.org to run daily at **00:00 UTC**. The daily ping also keeps the service warm enough that cold starts don't bite real users.

If you'd rather disable the in-process `node-cron` entirely (and rely solely on the external pinger), set `ENABLE_INPROCESS_CRON=false` in the env.

## Future Scope

- Admin dashboard for moderation and analytics
- Agro certification API integration
- AI-based image validation system
- Real delivery partner integration
- Multilingual farmer interface
- PWA or native mobile app for offline access

## Author

**Bhawesh Panwar**
GitHub: [@bhaweshpanwar](https://github.com/bhaweshpanwar)
