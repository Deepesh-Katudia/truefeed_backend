# TrueFeed Backend — Architecture & Internals

This document explains the backend’s structure, key files, runtime flow, and how the main features (auth, profile, posts, files, logs) work. It also lists required environment variables and how to run locally or in Docker.

- Runtime: Node.js (CommonJS)
- Web framework: Express 5
- Database: MongoDB (official driver v4)
- AuthN/AuthZ: Cookie-based sessions (express-session + connect-mongo)
- File storage: MongoDB GridFS (for profile pictures and post media)
- Logging: winston with daily rotate + morgan HTTP access logs
- CORS: Frontend origin configured via env; credentials enabled

## Folder Layout

```
backend/
  Dockerfile
  docker-compose.yaml
  ENDPOINTS.md
  README.md
  README.docker.md
  docs/
    index.html                 # Static docs renderer (served at `/` and `/docs`)
  log/                         # Daily-rotated logs (created at runtime)
  src/
    server.js                  # Process entry; starts app, sessions, routes, indexes

    config/
      dbConnection.js          # Mongo client helpers (by permission: read/write/super)
      ensureIndexes.js         # Builds required DB indexes on startup
      envPath.js               # Reads and exports all env vars used by backend

    controllers/
      authController.js        # Register/Login/Logout/Me (session-based)
      profileController.js     # Update current user's profile fields
      postController.js        # Create and list posts for current user
      logsController.js        # Download/stream server logs (admin only)

    middleware/
      validate.js              # Minimal body validation/sanitization utilities
      requireAdmin.js          # Guard routes to admin-only access

    models/
      userModel.js             # Users collection accessors
      postModel.js             # Posts collection accessors

    routes/
      api.js                   # Express app factory; sessions init; mounts v1 routes
      v1/
        authRoutes.js          # /api/v1/auth  (register, login, logout)
        profileRoutes.js       # /api/v1/profile (me, update, upload-picture, update-with-picture)
        postRoutes.js          # /api/v1/posts (create, mine, media upload, create-with-media)
        filesRoutes.js         # /api/v1/files (stream GridFS file by id)
        logsRoutes.js          # /api/v1/logs (admin: list, download, follow stream)

    services/
      authService.js           # Hash+store passwords; verify credentials
      logService.js            # Resolve/list runtime log files
      geminiService.js         # Example Google GenAI integration (not mounted by default)

    utils/
      logger.js                # Winston logger with daily rotation and morgan stream

    tests/                     # Placeholder for backend tests (currently none)

  uploads/                     # Leftover legacy folders (not used when using GridFS)
```

## Environment Variables

The backend reads variables exclusively via `src/config/envPath.js`. Below are the important ones and what they do.

- `PORT` (required): Port for Express server.
- `FRONTEND_ORIGIN` (required in CORS): Allowed origin for browser requests. Example: `http://localhost:3000`.
- `NODE_ENV`: `production` enables secure/sameSite cookie settings and `trust proxy`.
- Session store (Mongo): one of these must be provided so sessions can be persisted.
  - `EDITOR_URI` (preferred) or `ADMIN_URI` (fallback): MongoDB URI for the session store.
- Database access URIs:
  - `DATABASE_URL`: General purpose URI (used by data models when not using role-specific URIs).
  - `ADMIN_URI`, `EDITOR_URI`, `READER_URI`: Optional role-specific URIs; when present the code prefers these based on permission needed (super/write/read) for least-privilege access.
- Database naming and collections (optional; sensible defaults used if absent):
  - `DB_NAME` (default: `truefeed`)
  - `USER_COLLECTION`, `POST_COLLECTION`, `COMMENT_COLLECTION` (currently not overridden in code, present for future customization)
- `SESSION_SECRET` (recommended): Secret used to sign the session cookie; falls back to `JWT_SECRET` or a development default.
- Gemini (optional): `GEMINI_API_KEY`, `GEMINI_PROJECT_NUMBER`, `GEMINI_PROJECT_NAME` for `services/geminiService.js` example.

Example minimal `.env` for local dev (Mongo must be running and reachable):

```
PORT=5000
FRONTEND_ORIGIN=http://localhost:3000
NODE_ENV=development
# One of these required for sessions
EDITOR_URI=mongodb://localhost:27017/truefeed
# or ADMIN_URI=mongodb://localhost:27017/truefeed
# Generic DB URL used by models if role-specific not present
DATABASE_URL=mongodb://localhost:27017/truefeed
```

If `EDITOR_URI` and `ADMIN_URI` are both missing, the server will exit at startup because sessions require a MongoDB URL.

## Process Startup Flow

`src/server.js` is the entry point when running `npm start` or `npm run dev`.

1. Loads env via `dotenv`.
2. Creates a session store with `connect-mongo` using `EDITOR_URI` (preferred) or `ADMIN_URI`.
3. Calls `initSessions(store)` from `routes/api.js` to attach session middleware with proper cookie options (secure/sameSite vary by `NODE_ENV`).
4. Calls `registerRoutes()` to attach:
   - Static docs at `/` and `/docs` from `backend/docs/index.html`.
   - Versioned API routes under `/api/v1/*` (auth, profile, posts, files, logs).
5. Attempts to run `ensureIndexes()` to create DB indexes (non-blocking on failure).
6. Starts the HTTP server on `PORT` and logs readiness.

## Express App, Sessions, and CORS

`src/routes/api.js` builds and exports the Express app. Key points:

- `morgan` pipes access logs to winston.
- `cors` allows the configured `FRONTEND_ORIGIN` and enables credentials so the browser sends/receives the session cookie.
- `initSessions(store)`: must be called before `registerRoutes()`; otherwise auth-protected routes won’t see sessions.
- In production, `trust proxy` is enabled (for correct `secure` cookie handling behind a proxy).

Session cookie configuration:

- `httpOnly: true`
- `secure: NODE_ENV === "production"`
- `sameSite: 'none'` in production, otherwise `'lax'`
- `maxAge`: 7 days

## Routing Overview (v1)

Public:

- `GET /` and `GET/STATIC /docs/*`: Serves `backend/docs/index.html` and its assets.
- `POST /api/v1/auth/register`: Create a new account; sets session.
- `POST /api/v1/auth/login`: Authenticate; sets session.
- `POST /api/v1/auth/logout`: Destroy session and clear cookie.
- `GET /api/v1/files/:id`: Stream a GridFS file by ObjectId; sets `Content-Type` and long-lived cache headers.

Authenticated (session required):

- `GET /api/v1/profile/`: Return current user info (from session `email`).
- `POST /api/v1/profile/update`: Update `picture`, `description`, `phone` (validated/sanitized).
- `POST /api/v1/profile/upload-picture`: Multipart upload of a profile image to GridFS; returns a `/api/v1/files/:id` URL.
- `POST /api/v1/profile/update-with-picture`: Multipart one-step update: optional image upload + fields.
- `POST /api/v1/posts/`: Create a post with `content` and optional `mediaUrl` (validated/sanitized).
- `GET /api/v1/posts/mine`: List current user’s posts (sorted newest first).
- `POST /api/v1/posts/upload-media`: Multipart upload of post media to GridFS; returns a file URL.
- `POST /api/v1/posts/create-with-media`: Multipart one-step create with content + media upload.

Admin-only (requires session `role === 'admin'`):

- `GET /api/v1/logs/`: List available rotated server logs by date.
- `GET /api/v1/logs/:date`: Download the log file for the given date (YYYY-MM-DD).
- `GET /api/v1/logs/:date/stream?follow=1`: Stream the log file; `follow=1` tails new lines.

For detailed request/response shapes, see `ENDPOINTS.md`.

## Controllers, Services, and Models

- Controllers (`src/controllers/*`): Handle HTTP-level concerns and sessions. They call services/models and shape responses.

  - `authController`: register, login, logout, me.
  - `profileController`: updateMe (current user).
  - `postController`: create, myPosts.
  - `logsController`: listAvailableLogs, downloadLog, streamLog.

- Services (`src/services/*`): Business logic that is not HTTP-specific.

  - `authService`: password hashing/verification via `bcryptjs` and user creation.
  - `logService`: lists/locates rotated log files.
  - `geminiService`: example integration for Google GenAI (not exposed via routes yet).

- Models (`src/models/*`): All Mongo access. Every method acquires a connection appropriate to the permission required and closes it.

  - `userModel`: findByEmail, createUser, findById, updateUserById.
  - `postModel`: createPost, listUserPosts.

- Config (`src/config/*`):

  - `dbConnection`: Creates `MongoClient` using least-privilege URI preference (super/write/read -> ADMIN_URI/EDITOR_URI/READER_URI) or falls back to `DATABASE_URL`. Exposes `connect(permission)` which returns `{ client, db }` and must be closed by the caller.
  - `ensureIndexes`: Creates essential indexes (unique `users.email`, compound `posts.userId,createdAt`).
  - `envPath`: Centralizes reading of all env vars.

- Middleware (`src/middleware/*`):
  - `validate.validateBody(schema)`: Sanitizes and checks JSON payload fields according to a simple schema (supports string/number/boolean/any and `format: 'url'`). Attaches `req.validatedBody`.
  - `requireAdmin`: Verifies `req.session.role === 'admin'`.

## File Uploads via GridFS

We avoid writing to local disk in production and store media in MongoDB GridFS instead.

- Profile pictures: `POST /api/v1/profile/upload-picture` (multer memory storage) → writes to bucket `uploads` with metadata `{ userId, kind: 'profile' }` and returns `"/api/v1/files/<id>"`.
- Post media: `POST /api/v1/posts/upload-media` similarly writes to GridFS with metadata `{ userId, kind: 'post' }` and returns a file URL.
- One-step variants combine metadata upload with the create/update operation.
- Downloads: `GET /api/v1/files/:id` streams the file with `Content-Type` and long-lived cache headers.

## Logging

- App logs: `src/utils/logger.js` writes JSON logs to `backend/log/YYYY-MM-DD.log` and also to console.
- HTTP logs: `morgan` writes to the logger via `logger.stream`.
- Admin routes expose rotated logs (list, download, stream/tail) under `/api/v1/logs/*`.

## Error Handling & Security

- Global error handler in `routes/api.js` logs unhandled errors and returns 500.
- Validation: Most mutating routes validate/sanitize user input via `validateBody`.
- Sessions:
  - Cookies are `httpOnly` and become `secure + sameSite=none` when `NODE_ENV=production`.
  - `app.set('trust proxy', 1)` is used in production for correct cookie behavior behind proxies.
- CORS: Frontend origin restricted via `FRONTEND_ORIGIN`; credentials (cookies) allowed.
- File uploads: `multer` memory storage with MIME-type checks and size limits (profile: 5MB; post media: 20MB).

## Data Model (implicit)

- `users` collection:

  - Fields: `_id`, `name`, `email` (unique), `password` (bcrypt hash), `role` (default `user`), `picture`, `description`, `phone`, `createdAt`, `updatedAt`.
  - Indexes: `email` unique.

- `posts` collection:

  - Fields: `_id`, `userId` (ObjectId), `content`, `mediaUrl`, `createdAt`, `updatedAt`.
  - Indexes: `{ userId: 1, createdAt: -1 }` for efficient listing.

- GridFS (bucket `uploads`):
  - Files saved with metadata: `{ userId, kind: 'profile'|'post', postId? }`.

## Running Locally

- Ensure MongoDB is available and set `EDITOR_URI` or `ADMIN_URI`.
- Install deps and start:

```powershell
npm install
npm run dev
# or
npm start
```

The server expects a valid `PORT` and a MongoDB URI for sessions (`EDITOR_URI` or `ADMIN_URI`). If missing, it will exit with an error.

## Docker and Compose

- `Dockerfile`: Multi-stage image for the backend.
- `docker-compose.yaml`: Defines a `backend` service; uses build context, image tags via env, and reads `.env` for runtime config. It does not start MongoDB (assumes an external instance as per project setup). See `README.docker.md` for details.

Typical compose run (assuming `.env` contains required variables):

```powershell
# Build and start
docker compose up -d --build
# Follow logs
docker compose logs -f backend
# Stop
docker compose down
```

## CI/CD

- GitHub Actions workflow at `backend/.github/workflows/nodejs-ci.yml` runs dependency install, brings up the service via Compose for integration testing, and on `main` builds and pushes images to GHCR.
- Ensure repository secrets exist for any env used in `.env` during CI (e.g., `EDITOR_URI` or `ADMIN_URI`, `PORT`, `FRONTEND_ORIGIN`, etc.).

## Troubleshooting

- Startup fails immediately:
  - Check that `EDITOR_URI` or `ADMIN_URI` is set; sessions require a Mongo URL.
  - Verify `PORT` is set and not in use.
- CORS/auth issues in the browser:
  - Confirm `FRONTEND_ORIGIN` matches your frontend URL exactly (including protocol and port).
  - In production, ensure reverse proxy sets `X-Forwarded-Proto` and Express `trust proxy` is correct so secure cookies work.
- File upload returns 400:
  - Verify field names (`picture` for profile, `media` for posts) and MIME types.

## See Also

- `ENDPOINTS.md`: Request/response details for each route.
- `docs/index.html`: Static renderer for Markdown docs at `/` and `/docs`.
