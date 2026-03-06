# TrueFeed – Backend (Express + Supabase)

TrueFeed Backend is a Node.js / Express API server powering the TrueFeed social media platform.

The backend follows a **Layered Architecture** (Controllers → Services → Models) to keep business logic clean, testable, and independent from HTTP concerns.

It handles authentication, posts, stories, friends, AI credibility checks, and database communication with Supabase.

---

## 🎥 Project Demo

Watch the full working demo of TrueFeed here:

👉 **YouTube Demo:**
[https://youtu.be/PMiKg-slGtQ](https://youtu.be/PMiKg-slGtQ)

---

## 🚀 Features

* 🔐 JWT-based authentication (Login / Register)
* 🧾 Secure password hashing with bcrypt
* 📝 Post creation with optional media
* 🤖 AI credibility check endpoint
* ❤️ Like & comment system
* 📸 Story creation with expiration logic
* 👥 Friend search and request system
* 📂 Media streaming endpoint
* 🛡 Centralized error handling
* 📊 Structured logging with Morgan

---

## 🛠 Tech Stack

* Node.js
* Express.js
* Supabase (PostgreSQL)
* JWT (jsonwebtoken)
* bcryptjs
* CORS
* Morgan (HTTP logging)

---

## ⚙️ Quick Start

### 1️⃣ Install dependencies

```bash
npm install
```

### 2️⃣ Configure environment variables

Create a `.env` file in the root directory:

```
PORT=4000
JWT_SECRET=your_secret_key

SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3️⃣ Start the server

```bash
npm start
```

Server runs at:

```
http://localhost:4000
```

---

## 📂 Project Structure

```
src/
├── controllers/   # HTTP handlers (thin layer)
├── services/      # Business logic
├── models/        # Database interaction (Supabase)
├── routes/        # Route definitions
├── middleware/    # Auth, logging, CORS, etc.
├── config/        # Environment + client setup
└── server.js      # Application entry point
```

---

## 🔐 Authentication Flow

1. User registers or logs in.
2. Password is hashed using bcrypt.
3. JWT token is generated and returned.
4. Frontend sends token in `Authorization: Bearer <token>`.
5. Protected routes verify the token before processing.

All protected routes are mounted under:

```
/api/v1/*
```

---

## 📌 Routing Notes

* Primary routing entrypoint:
  `src/routes/api.js`

* All active routes are versioned under:
  `/api/v1/*`

* Legacy route files have been archived under:
  `src/routes/archived/legacy-2025-10-12/`

---

## 📖 API Reference

For the full and up-to-date API documentation, see:

* [ENDPOINTS.md](./ENDPOINTS.md)

---

## 🧪 Testing Recommendation

Keep controllers thin and test services independently.

Add tests under:

```
src/tests/
```

Recommended tools:

* Jest
* Supertest (for API testing)

---

## 🚀 Deployment

Recommended hosting platforms:

* Render
* Railway
* Fly.io
* DigitalOcean

Make sure environment variables are properly configured in production.

---

## 👨‍💻 Author

Deepesh Katudia ||
Software Developer
