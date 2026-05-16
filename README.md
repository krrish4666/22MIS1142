# 22MIS1142 Campus Notifications Backend

Backend-only Node.js service for the campus notifications assessment.

## Structure

- `logging_middleware`: reusable logging package exposing `Log(stack, level, package, message)`
- `notification_app_be`: backend service and priority inbox implementation
- `notification_system_design.md`: stage-wise API, data, optimization, caching, and reliability design

## Run

```bash
npm run check
npm start
```

Set the values in `notification_app_be/.env.example` as environment variables before calling protected external APIs.

## Local Endpoints

- `GET /health`
- `GET /notifications?studentID=1042`
- `PATCH /notifications/:id/read`
- `GET /notifications/stream?studentID=1042`
- `GET /priority-inbox?studentID=1042&limit=10`
