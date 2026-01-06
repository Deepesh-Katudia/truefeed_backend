# Running the backend with Docker

This document explains how to run the backend locally using Docker + Docker Compose.

Prerequisites

- Docker and Docker Compose installed on your machine

Quick start

1. Copy the environment example to a local file and edit values if needed:

```powershell
cd backend
copy .env.example .env
# Edit .env to point to your desired DB URL if changed
```

2. From the repo root, build and start services:

```powershell
docker compose up --build
```

This will start a `mongo` service and the `backend` service. The backend listens on port 5000 by default and reads `DATABASE_URL` from the environment (the compose file injects `mongodb://mongo:27017/truefeed` via `backend/.env` by default).

Using an external (hosted) MongoDB

If you already have a hosted MongoDB (Atlas or other cloud provider), you don't need the local `mongo` service. Instead:

1. Set your DATABASE_URL in `backend/.env` to the connection string provided by your cloud provider. Example:

```text
DATABASE_URL=mongodb+srv://<user>:<password>@cluster0.example.mongodb.net/truefeed?retryWrites=true&w=majority
```

2. From the repo root, start only the backend service using the remote compose file we provide:

```powershell
docker compose -f docker-compose.remote.yml up --build
```

This will build and run just the backend container and it will connect to your hosted MongoDB using `DATABASE_URL` from `backend/.env`.

Stopping and cleanup

```powershell
docker compose down -v
```

Notes

- In production, prefer using multi-stage builds and scanning images for vulnerabilities.
- The Dockerfile uses Node 18 LTS. For stricter security controls, consider pinning to a specific patch version or using distroless images.
