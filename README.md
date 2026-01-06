# TrueFeed Backend

Node.js / Express API server for TrueFeed. The backend follows a Layered Architecture (controllers, services, models) to keep business logic testable and decoupled from HTTP concerns.

Quick start

1. Install dependencies:

   npm install

2. Start the server (example):

   npm start

Project structure (recommended)

```
src/
├── controllers/   # HTTP handlers (call services)
├── services/      # Business logic
├── models/        # Database schema/ORM models
├── routes/        # Route definitions
├── middleware/    # Auth, logging, CORS, etc.
├── config/        # DB connection and config
└── server.js      # App entry point
```

Notes

- Keep controllers thin and test services independently.
- Add tests under `src/tests/` and use a test runner like Jest for unit/integration tests.

Routing notes

- The primary routing entrypoint is now `src/routes/api.js` which initializes
  and mounts versioned routes under `/api/v1/*`.
- Legacy route files have been archived under `src/routes/archived/legacy-2025-10-12/`.
  The original top-level route files were removed and the active routing entrypoint is `src/routes/api.js`.

## API Endpoints

For the full, always up-to-date API reference (including auth, profile, posts, and logs), see:

- [ENDPOINTS.md](./ENDPOINTS.md)
