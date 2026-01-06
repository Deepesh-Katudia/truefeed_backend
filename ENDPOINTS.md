# TrueFeed Backend API Endpoints

This document describes the versioned REST API exposed by the TrueFeed backend. All active endpoints are mounted under `/api/v1/*`.

Notes

- Authentication uses server-side sessions with cookies (`connect.sid`). Your client must send cookies: e.g., `fetch(url, { credentials: 'include' })`.
- In production, cookies are `SameSite=None; Secure`, so use HTTPS.
- Admin-only endpoints require the session role to be `admin`.

Docs & Markdown

- The docs site is served at the root `/` and `/docs/*`.
- Public Markdown fetch endpoint: `GET /md/:name` — serves whitelisted Markdown files from the backend folder with `Content-Type: text/markdown`.
  - Allowed values for `:name`: `README.md`, `ENDPOINTS.md`, `ARCHITECTURE.md`.
  - Responses:
    - 200: raw markdown content
    - 404: `{ error: "not found" }` for non-whitelisted names or missing files
    - 500: `{ error: "failed to load markdown" }`

## Auth (public)

### POST /api/v1/auth/register

Register a new user and start a session.

- Body (application/json):
  - `name?`: string
  - `email`: string (required)
  - `password`: string (required)
- Responses:
  - 201: JSON user object (created). Session cookie is set.
  - 400: `{ error: "email and password are required" }`
  - 409: `{ error: "User already exists" }`
  - 500: `{ error: "Internal server error" }`

### POST /api/v1/auth/login

Authenticate and establish a session.

- Body (application/json):
  - `email`: string (required)
  - `password`: string (required)
- Responses:
  - 200: `{ message: "Logged in" }` and session cookie is set.
  - 400: `{ error: "email and password are required" }`
  - 401: `{ error: "Invalid credentials" }`
  - 500: `{ error: "Internal server error" }`

### POST /api/v1/auth/logout

Destroy the current session and clear the session cookie.

- Responses:
  - 200: `{ message: "Logged out" }`
  - 500: `{ error: "Could not log out" }`

## Profile (authenticated)

### GET /api/v1/profile

Return the current authenticated user's profile.

- Auth: requires a valid session
- Responses:
  - 200: `{ user: { /* user object without password */ } }`
  - 401: `{ error: "Not authenticated" }`
  - 404: `{ error: "User not found" }`
  - 500: `{ error: "Internal server error" }`

### POST /api/v1/profile/update

Update the current user's profile fields.

- Auth: requires a valid session
- Body (application/json): any subset of
  - `picture?`: string (URL or other your client uses)
  - `description?`: string
  - `phone?`: string
- Responses:
  - 200: `{ message: "Profile updated" }`
  - 401: `{ error: "Not authenticated" }`
  - 500: `{ error: "Internal server error" }`

### POST /api/v1/profile/upload-picture

Upload a new profile picture and receive a URL you can then store via `/profile/update`.

- Auth: requires a valid session
- Request: `multipart/form-data` with field `picture` (image/png, image/jpeg, image/webp, gif)
- Responses:
  - 201: `{ url: "/api/v1/files/<fileId>" }`
  - 400: `{ error: "No file uploaded" }`
  - 401: `{ error: "Not authenticated" }`
  - 415: `{ error: "Unsupported media type" }` (if filtered by server)
  - 500 on failures

### POST /api/v1/profile/update-with-picture

One-step profile update that accepts an image and text fields in a single request.

- Auth: requires a valid session
- Request: `multipart/form-data`
  - File field: `picture` (optional) — image/png, image/jpeg, image/webp, gif
  - Text fields: `description?` (string, up to 1000), `phone?` (string, up to 30)
- Responses:
  - 200: `{ message: "Profile updated", picture?: "/api/v1/files/<fileId>" }`
  - 400: `{ error: "No file uploaded" }` (only when sending an empty file field)
  - 401: `{ error: "Not authenticated" }`
  - 500 on failures

## Posts (authenticated)

### POST /api/v1/posts

Create a new post for the current user.

- Auth: requires a valid session
- Body (application/json):
  - `content?`: string
  - `mediaUrl?`: string (image/video URL)
- Responses:
  - 201: `{ id: "<insertedId>" }`
  - 401: `{ error: "Not authenticated" }`
  - 500: `{ error: "Internal server error" }`

### POST /api/v1/posts/upload-media

Upload a media file for a post and receive a URL to use as `mediaUrl` when creating a post.

- Auth: requires a valid session
- Request: `multipart/form-data` with field `media` (image/png, image/jpeg, image/webp, gif, or video/mp4/webm/ogg)
- Responses:
  - 201: `{ url: "/api/v1/files/<fileId>" }`
  - 400: `{ error: "No file uploaded" }`
  - 401: `{ error: "Not authenticated" }`
  - 415: `{ error: "Unsupported media type" }` (if filtered by server)
  - 500 on failures

### POST /api/v1/posts/create-with-media

Create a new post and (optionally) upload media in the same request.

- Auth: requires a valid session
- Request: `multipart/form-data`
  - File field: `media` (optional) — image/png, image/jpeg, image/webp, gif, or video/mp4/webm/ogg
  - Text field: `content?` (string, up to 2000)
- Responses:
  - 201: `{ id: "<insertedId>", mediaUrl?: "/api/v1/files/<fileId>" }`
  - 401: `{ error: "Not authenticated" }`
  - 500: `{ error: "upload or create failed" }`

### GET /api/v1/posts/mine

List posts created by the current user (newest first).

- Auth: requires a valid session
- Responses:
  - 200: `{ posts: [ { _id, userId, content, mediaUrl, createdAt, updatedAt } ] }`
  - 401: `{ error: "Not authenticated" }`
  - 500: `{ error: "Internal server error" }`

## Logs (admin-only)

All routes under `/api/v1/logs` are guarded by admin middleware. Non-admins receive 401/403.

### GET /api/v1/logs

List available log files.

- Responses:
  - 200: `{ logs: [ "YYYY-MM-DD.log", ... ] }`

### GET /api/v1/logs/:date

Download a specific log file.

- Params: `date` (string, required) — format: `YYYY-MM-DD`
- Responses:
  - 200: file download attachment named `:date.log`
  - 400: `{ error: "date must be in YYYY-MM-DD format" }`
  - 404: `{ error: "log not found" }`

### GET /api/v1/logs/:date/stream?follow=1

Stream log contents; with `follow=1` keeps the connection open and streams appended lines in realtime.

- Query: `follow` (optional) — values: `1`/`true`
- Responses:
  - 200: `text/plain` stream of log contents
  - 400/404/500 on errors

---

## Files (public)

### GET /api/v1/files/:id

Stream a file stored in MongoDB GridFS by its ObjectId.

- Params: `id` (string) — the GridFS file ObjectId
- Responses:
  - 200: file bytes streamed with appropriate `Content-Type` and long-term cache headers
  - 400: `{ error: "invalid id" }`
  - 404 on missing file
  - 500 on stream errors

Notes

- URLs returned from upload endpoints point to this route (e.g., `/api/v1/files/<fileId>`).

Future work

- Payload validation and basic sanitization are in place for profile updates and post creation. For stricter contracts, migrate to a schema library (Joi/Zod) and add OpenAPI.
- Media uploads are stored in MongoDB GridFS and streamed back via `/api/v1/files/:id`. For production at scale, consider object storage and CDNs.
- OpenAPI/Swagger spec and Postman collection.


Friends (authenticated)

All routes under /api/v1/friends require a valid authenticated session.
These endpoints support social connections, friend requests, and user discovery.

POST /api/v1/friends/request

Send a friend request to another user.

- Auth: requires a valid session
- Body (application/json):
    - targetUserId: string (required) — MongoDB ObjectId of the target user
- Responses:
    - 201: { message: "Friend request sent" }
    - 400: { error: "invalid targetUserId" }
    - 400: { error: "cannot send request to yourself" }
    - 404: { error: "user not found" }
    - 409: { error: "request already sent" }
    - 409: { error: "already friends" }
    - 401: { error: "Not authenticated" }
    - 500: { error: "Internal server error" }
Notes
  - Duplicate friend requests are prevented.
  - Requests cannot be sent to users who are already friends.

POST /api/v1/friends/accept
Accept an incoming friend request.
  - Auth: requires a valid session (receiver must be logged in)
  - Body (application/json):
      - senderUserId: string (required) — MongoDB ObjectId of the user who sent the request
  - Responses:
      - 200: { message: "Friend request accepted" }
      - 400: { error: "invalid senderUserId" }
      - 400: { error: "cannot accept yourself" }
      - 404: { error: "sender not found" }
      - 409: { error: "no pending request to accept" }
      - 409: { error: "already friends" }
      - 401: { error: "Not authenticated" }
      - 500: { error: "Internal server error" }
  - Notes:
      - Accepting a request creates a mutual friendship.
      - Pending request entries are removed from both users.

GET /api/v1/friends/search
  - Search for users by name or email and return relationship status.
Auth: requires a valid session
Query parameters:
    - q: string (required) — search text (minimum 2 characters)
    - limit: number (optional) — max results (default: 10, max: 20)
Responses:
200:
{
  "results": [
    {
      "_id": "string",
      "name": "string",
      "email": "string",
      "picture": "string | null",
      "description": "string",
      "isFriend": false,
      "incomingPending": false,
      "outgoingPending": true
    }
  ]
}

- 400: { error: "q must be at least 2 characters" }
- 401: { error: "Not authenticated" }
- 500: { error: "Internal server error" }

Relationship flags:
- isFriend: user is already a friend
- incomingPending: user has sent a friend request to you
- outgoingPending: you have sent a friend request to the user

Notes:
- The authenticated user is excluded from search results.
- Passwords and sensitive fields are never returned.
- Data Model Notes (Users Collection)

The following fields are used internally to support social features:
- friends: array of user ObjectIds
- friendRequestsIncoming: array of user ObjectIds
- friendRequestsOutgoing: array of user ObjectIds

These fields are managed exclusively by the friends API endpoints.
