# Campus Notifications Backend - Project Report

## Overview

This repository contains a backend-only implementation for the Campus Notifications Microservice assessment. The project is organized around a reusable logging package, a Node.js backend service, and a stage-wise system design document.

The implementation intentionally avoids frontend code and does not include login or registration screens. API users are assumed to be pre-authorized, while the service supports the required external Bearer-token flow through environment variables.

## Repository Structure

```text
22MIS1142/
  logging_middleware/
    index.js
    package.json
  notification_app_be/
    .env.example
    package.json
    src/
      config.js
      externalApi.js
      http.js
      priority.js
      router.js
      server.js
  notification_system_design.md
  PROJECT_REPORT.md
  README.md
  package.json
  .gitignore
```

## What Has Been Created

### 1. Reusable Logging Middleware

Location: `logging_middleware/index.js`

Created a reusable `Log(stack, level, package, message)` function.

Features:

- Validates `stack`, `level`, and `package` against the assessment-approved values.
- Sends logs to the protected external logs endpoint.
- Supports Bearer-token authentication.
- Supports token retrieval through the external auth endpoint.
- Supports client registration through a helper function.
- Avoids direct console logging and common built-in logging libraries.
- Fails gracefully by default if credentials are not configured, while allowing strict failure mode with `LOG_REQUIRE_REMOTE=true`.

Supported environment variables include:

```text
EVALUATION_BASE_URL
EVALUATION_ACCESS_TOKEN
EVALUATION_CLIENT_ID
EVALUATION_CLIENT_SECRET
EVALUATION_EMAIL
EVALUATION_ROLL_NO
EVALUATION_ACCESS_CODE
EVALUATION_AUTH_PAYLOAD_JSON
EVALUATION_REGISTRATION_PAYLOAD_JSON
LOG_REQUIRE_REMOTE
```

### 2. Backend Service

Location: `notification_app_be/src`

Created a dependency-light Node.js backend using the built-in `http` module and built-in `fetch`.

Implemented local endpoints:

```http
GET /health
GET /notifications?studentID=1042
PATCH /notifications/:id/read
GET /notifications/stream?studentID=1042
GET /priority-inbox?studentID=1042&limit=10
```

Important modules:

- `server.js`: starts the HTTP server.
- `router.js`: routes requests, calls service functions, logs request lifecycle events.
- `externalApi.js`: calls protected external notification APIs.
- `priority.js`: normalizes notifications and calculates priority scores.
- `http.js`: JSON response and request-body helpers.
- `config.js`: central runtime configuration.

### 3. Priority Inbox Logic

Location: `notification_app_be/src/priority.js`

Created the Stage 6 priority sorting logic.

Priority rules:

```text
Placement > Result > Event
```

Scoring formula:

```text
score = categoryWeight * 1000 + recencyScore * 100
```

Where:

```text
placement = 3
result = 2
event = 1
recencyScore = 1 / (1 + ageHours / 24)
```

The endpoint returns the top 10 notifications by default:

```http
GET /priority-inbox?studentID=1042&limit=10
```

### 4. System Design Document

Location: `notification_system_design.md`

Created a stage-wise design document covering:

- Stage 1: REST API design, headers, JSON schemas, and real-time update endpoint.
- Stage 2: PostgreSQL persistence choice, schema, queries, and scalability notes.
- Stage 3: query optimization for unread notifications at large scale.
- Stage 4: Redis caching, polling, SSE, and WebSocket tradeoffs.
- Stage 5: reliable bulk notification processing using queues and workers.
- Stage 6: implementation notes for the priority inbox.

### 5. Runtime Configuration

Location: `notification_app_be/.env.example`

Created an environment template for protected external API access:

```text
PORT=8080
EVALUATION_BASE_URL=http://4.224.186.213
EVALUATION_ACCESS_TOKEN=
EVALUATION_CLIENT_ID=
EVALUATION_CLIENT_SECRET=
EVALUATION_EMAIL=
EVALUATION_ROLL_NO=
EVALUATION_ACCESS_CODE=
NOTIFICATIONS_API_PATH=/evaluation-service/notifications
MARK_READ_API_PATH=/evaluation-service/notifications/:id/read
LOG_REQUIRE_REMOTE=false
```

### 6. Git Repository

The local Git repository has been initialized.

Current branch:

```text
main
```

Initial commit:

```text
Initial backend assessment implementation
```

The commit message avoids personal names and restricted company references.

### 7. Verification Already Completed

The following checks were completed:

- Node syntax checks passed for all source files.
- Local backend server started successfully.
- `GET /health` returned:

```json
{
  "status": "ok"
}
```

- A text scan found no occurrences of:
  - the student's personal name
  - the restricted company reference
  - direct console logging calls
  - common third-party logger packages

## How To Run

From the repository root:

```bash
cd 22MIS1142
```

If PowerShell blocks `npm.ps1`, use:

```powershell
npm.cmd run check
npm.cmd start
```

Or run Node directly:

```powershell
node notification_app_be/src/server.js
```

Default local URL:

```text
http://localhost:8080
```

Health check:

```http
GET http://localhost:8080/health
```

Priority inbox:

```http
GET http://localhost:8080/priority-inbox?studentID=1042&limit=10
```

## What Is Left To Do

### 1. Configure Real External API Credentials

The code is ready for protected API calls, but the actual credentials must be supplied as environment variables.

Required options:

- Use `EVALUATION_ACCESS_TOKEN` directly, or
- Set the auth fields:

```text
EVALUATION_CLIENT_ID
EVALUATION_CLIENT_SECRET
EVALUATION_EMAIL
EVALUATION_ROLL_NO
EVALUATION_ACCESS_CODE
```

If the evaluation server expects a different auth payload shape, set:

```text
EVALUATION_AUTH_PAYLOAD_JSON
```

### 2. Confirm Exact External Notification Paths

The service defaults to:

```text
/evaluation-service/notifications
/evaluation-service/notifications/:id/read
```

If the evaluator provides different paths, update:

```text
NOTIFICATIONS_API_PATH
MARK_READ_API_PATH
```

No code changes are needed for this.

### 3. Capture API Client Screenshots

Screenshots still need to be captured from Postman or Insomnia.

Required screenshots:

- `GET /priority-inbox?studentID=1042&limit=10`
  - Request URL
  - Response body
  - Response time
- `GET /notifications?studentID=1042`
  - Request URL
  - Response body
  - Response time
- `PATCH /notifications/{id}/read`
  - Request body
  - Response body
  - Response time

These screenshots require real protected API credentials and reachable external notification data.

### 4. Create Public Remote Repository

The local repository has been created, but the public GitHub repository still needs to be created and pushed.

This environment does not have GitHub CLI installed, so remote creation could not be completed here.

Suggested commands after creating an empty public repository named `22MIS1142`:

```bash
git remote add origin https://github.com/krrish4666/22MIS1142.git
git push -u origin main
```

### 5. Optional Production Hardening

The current implementation is assessment-ready. For a real deployment, the next improvements would be:

- Add automated tests for priority scoring and response normalization.
- Add OpenAPI documentation.
- Add request rate limiting.
- Add structured health checks for external API reachability.
- Add Redis caching for notification fetches.
- Replace polling-based SSE snapshots with queue-backed event fan-out.
- Add Dockerfile and deployment configuration.

## Current Status

The backend implementation, logging middleware, design documentation, and local Git repository are complete.

Remaining work is submission-side:

- provide real external API credentials,
- confirm protected notification endpoint paths,
- capture API client screenshots,
- create and push the public GitHub repository.
