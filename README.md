
# Kisan Choice Backend API

A secure, scalable, and modular Node.js + Express backend for the Kisan Choice web platform — an initiative to digitally empower Indian farmers by enabling direct-to-consumer sales, eliminating middlemen, and offering a fair, negotiation-based marketplace.

## Live Frontend

https://heroic-dragon-0b1a27.netlify.app

## Backend API URL

https://apiaws.bhaweshpanwar.xyz

## Table of Contents

- [Overview](#overview)
- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [API Modules](#api-modules)
- [Security](#security)
- [Environment Variables](#environment-variables)
- [How to Run](#how-to-run)
- [Database Schema](#database-schema)
- [Deployment](#deployment)
- [Future Scope](#future-scope)
- [Author](#author)

## Overview

The Kisan Choice backend powers a full-stack web application aimed at improving agricultural commerce in India by:

- Eliminating middlemen and reducing exploitation.
- Empowering farmers to manage listings, offers, and orders.
- Creating a transparent, direct farmer-to-consumer marketplace.

## Core Features

- Role-based Authentication: Farmer, Consumer, Admin
- Product Listings & Management: Farmers manage stock
- Offer & Negotiation System: Buyers can make single-use offers; farmers can accept, reject, or block
- Secure Payments: Stripe payment integration
- Order Management: Add to cart, checkout, track status
- Email OTP & Password Reset: Via Nodemailer
- Spam Protection: Farmers can block abusive users
- Dashboard Access: User-specific navigation
- Redis Integration: For OTP and caching
- JWT Authentication: Session security

## Tech Stack

| Layer         | Technology                           |
|--------------|---------------------------------------|
| Backend       | Node.js, Express.js                  |
| Database      | PostgreSQL, Redis                    |
| Auth & Security | JWT, Bcrypt, OTP via Redis          |
| Payments      | Stripe                               |
| Email         | Nodemailer                           |
| DevOps        | Docker, Docker Compose, Nginx        |
| Monitoring    | Winston Logger                       |
| Middleware    | dotenv, express-rate-limit, CORS     |

## Project Structure

```

backend/
├── config/              # Passport setups
├── controllers/         # API logic for each feature
├── db/                  # Database and Redis setup
├── dev-data/            # Templates, dummy data
├── models/              # DB models and validators
├── routes/              # Express routers
├── public/              # Static assets (user images etc.)
├── utils/               # Reusable utilities (OTP, token, mail)
├── views/               # Email templates
├── app.js               # Express app entry
├── server.js            # Server runner
└── package.json

```

## API Modules

| Module        | Routes                                      |
|---------------|---------------------------------------------|
| Users         | `/api/v1/users/`                            |
| Auth          | `/auth/`                                    |
| Products      | `/api/v1/products/`                         |
| Reviews       | `/api/v1/reviews/`                          |
| Cart          | `/api/v1/cart/`                             |
| Orders        | `/api/v1/orders/`                           |
| Negotiations  | `/api/v1/negotiations/`                     |
| Block Users   | `/api/v1/block/`                            |
| Webhooks      | `/api/v1/cart/webhook`                      |

## Security

- Rate Limiting: `express-rate-limit`
- Cookie Management: `cookie-parser`
- CORS: Strict origin and credentials control
- Logger: Winston for structured logging

## Environment Variables

Create a `.env` file in the root directory:

```

PORT=3000
DATABASE\_URL=postgresql://<user>:<pass>@<host>:<port>/<db>
JWT\_SECRET=your\_jwt\_secret
JWT\_EXPIRES\_IN=90d
REDIS\_URL=redis\://localhost:6379
EMAIL\_USERNAME=[your\_email@example.com](mailto:your_email@example.com)
EMAIL\_PASSWORD=your\_email\_password
STRIPE\_SECRET\_KEY=your\_stripe\_secret\_key

```

## How to Run

```

# 1. Clone the repo

git clone [https://github.com/bhaweshpanwar/kisan-choice.git](https://github.com/bhaweshpanwar/kisan-choice.git)
cd kisan-choice/backend

# 2. Setup environment

cp .env.example .env

# 3. Install dependencies

npm install

# 4. Start development server

npm run dev

```

## Database Schema

This app uses a relational PostgreSQL database. Key tables include:

- users, farmers, products
- orders, order_items, cart, cart_items
- offers, accepted_offers, reviews, blocked_accounts

All tables are designed with foreign key constraints and UUID-based IDs.

## Deployment

- Dockerized backend with `Dockerfile` and `docker-compose.yml`
- NGINX reverse proxy for SSL
- Certbot for HTTPS with Let's Encrypt
- Hosted on AWS Lightsail with Cloudflare DNS proxying

## Future Scope

- Admin dashboard for moderation and analytics
- Agro certification API integration
- AI-based image validation system
- Real delivery partner integration
- Multilingual farmer interface
- PWA or native mobile app for offline access

## Author

**Bhawesh Panwar**  
Bachelor of Computer Applications  
Devi Ahilya Vishwavidyalaya, Indore  
GitHub: [@bhaweshpanwar](https://github.com/bhaweshpanwar)
```
