# Campus Notifications Microservice Design

## Stage 1: API Design

Base path: `/api/v1`

Common headers:

```http
authorization: Bearer <access_token>
content-type: application/json
accept: application/json
```

### Fetch notifications

`GET /api/v1/students/{studentID}/notifications?unreadOnly=true&category=placement&limit=20&cursor=eyJjcmVhdGVkQXQiOiI...`

Query parameters:

```json
{
  "unreadOnly": "boolean, optional",
  "category": "placement | result | event, optional",
  "limit": "number, optional, default 20, max 100",
  "cursor": "string, optional"
}
```

Response:

```json
{
  "data": [
    {
      "id": "noti_01",
      "studentID": 1042,
      "category": "placement",
      "title": "Drive opened",
      "message": "A new placement drive is available.",
      "isRead": false,
      "createdAt": "2026-05-16T09:30:00.000Z"
    }
  ],
  "page": {
    "limit": 20,
    "nextCursor": "eyJjcmVhdGVkQXQiOiI..."
  }
}
```

Error response:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "limit must be between 1 and 100"
  }
}
```

### Mark as read

`PATCH /api/v1/students/{studentID}/notifications/{notificationID}/read`

Request:

```json
{
  "isRead": true
}
```

Response:

```json
{
  "data": {
    "id": "noti_01",
    "studentID": 1042,
    "isRead": true,
    "readAt": "2026-05-16T10:15:00.000Z"
  }
}
```

Idempotency rule: marking an already-read notification as read should still return `200 OK` with the current read state. This prevents clients from failing when a user double-clicks or retries after a network timeout.

### Real-time updates

`GET /api/v1/students/{studentID}/notifications/stream`

Server-Sent Events are enough for one-way notification delivery. WebSockets are better if the client also needs acknowledgement, typing-style presence, or bidirectional commands.

SSE event:

```json
{
  "event": "notification.created",
  "data": {
    "id": "noti_02",
    "category": "result",
    "title": "Result published",
    "createdAt": "2026-05-16T10:20:00.000Z"
  }
}
```

Real-time connection behavior:

- The client authenticates once with the same Bearer token header.
- The service sends a snapshot event after connection.
- New notification events are pushed as they arrive.
- The client reconnects using normal SSE retry behavior if the network drops.

## Stage 2: Data Persistence

Recommended database: PostgreSQL.

Reason: notifications have strong relational access patterns by student, read state, category, and time. PostgreSQL gives ACID writes, partial indexes, partitioning, JSONB metadata, and reliable pagination. A document database is viable for flexible payloads, but read-state updates and indexed filtering are cleaner in SQL.

Schema:

```sql
CREATE TYPE notification_category AS ENUM ('placement', 'result', 'event');

CREATE TABLE students (
  id BIGINT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id BIGINT NOT NULL REFERENCES students(id),
  category notification_category NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Queries:

Insert a notification:

```sql
INSERT INTO notifications (student_id, category, title, message, metadata)
VALUES ($1, $2, $3, $4, COALESCE($5, '{}'::jsonb))
RETURNING id, student_id, category, title, message, is_read, created_at;
```

Fetch notifications:

```sql
SELECT id, student_id, category, title, message, is_read, created_at
FROM notifications
WHERE student_id = $1
  AND ($2::boolean IS NULL OR is_read = $2)
  AND ($3::notification_category IS NULL OR category = $3)
ORDER BY created_at DESC, id DESC
LIMIT $4;
```

```sql
UPDATE notifications
SET is_read = true, read_at = now()
WHERE id = $1 AND student_id = $2
RETURNING id, student_id, is_read, read_at;
```

Scalability concerns:

- Large fan-out writes for campus-wide notifications can create write spikes.
- Per-student unread queries become hot during class start times and page loads.
- Old notifications should be partitioned or archived by month.
- Cursor pagination avoids slow high-offset scans.
- Bulk campaign writes should use batched inserts instead of one insert per request loop.
- If the notification table reaches hundreds of millions of rows, partition by `created_at` month and keep hot partitions indexed for recent reads.

## Stage 3: Query Optimization

Given query:

```sql
SELECT *
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

Why it is slow at 5 million rows:

- Without a useful composite index, the database may scan many rows to find one student's unread notifications.
- `ORDER BY createdAt DESC` can require an expensive sort after filtering.
- `SELECT *` reads unnecessary columns such as large message or metadata values.
- Boolean columns like `isRead` are low-cardinality, so a standalone index on `isRead` is often poor.

The "index every column" pitfall:

- More indexes slow inserts and updates because each write must update every index.
- Single-column indexes may not match real query predicates.
- The planner may ignore low-selectivity indexes.
- Extra indexes consume memory and storage, making useful indexes less cache-friendly.

Optimized index:

```sql
CREATE INDEX idx_notifications_unread_student_created
ON notifications (student_id, created_at DESC)
WHERE is_read = false;
```

Why this index works:

- `student_id` matches the most selective equality filter.
- The partial condition stores only unread rows, reducing index size.
- `created_at DESC` supports the sort order directly.
- The query can stop after the requested page limit instead of scanning all unread rows.

Optimized fetch:

```sql
SELECT id, category, title, message, created_at
FROM notifications
WHERE student_id = $1 AND is_read = false
ORDER BY created_at DESC, id DESC
LIMIT $2;
```

Placement notifications from the last 7 days:

```sql
CREATE INDEX idx_notifications_student_category_created
ON notifications (student_id, category, created_at DESC);

SELECT id, title, message, created_at
FROM notifications
WHERE student_id = $1
  AND category = 'placement'
  AND created_at >= now() - interval '7 days'
ORDER BY created_at DESC, id DESC
LIMIT 50;
```

## Stage 4: Performance and Caching

Strategy:

- Cache unread notification pages in Redis with keys like `notifications:student:{id}:unread:v1`.
- Use short TTLs, such as 30 to 90 seconds, and delete affected keys when a notification is created or marked read.
- Cache unread counts separately because badges are requested more often than full notification lists.
- Prefer cursor pagination and projection queries to avoid large DB reads.
- Use SSE or WebSockets for near-real-time delivery instead of aggressive polling.

Cache key examples:

```text
notifications:student:1042:unread:v1
notifications:student:1042:count:v1
notifications:student:1042:category:placement:v1
```

Cache invalidation:

```text
on notification_created(student_id):
  delete notifications:student:{student_id}:*
  publish notification.created event

on notification_marked_read(student_id, notification_id):
  delete notifications:student:{student_id}:*
  publish notification.read event
```

Page-load optimization:

- Serve cached unread count immediately.
- Fetch first page from Redis if available.
- On cache miss, query PostgreSQL using the composite/partial index, write Redis with TTL, then return.
- Use background refresh for frequently accessed students if traffic is predictable.

Tradeoffs:

- Redis lowers DB pressure but adds invalidation complexity.
- Polling is simple, but synchronized page loads can overwhelm the DB.
- SSE is simple and efficient for one-way updates.
- WebSockets support richer interaction but require connection state, scaling through a broker, and load balancer support.

## Stage 5: System Reliability and Bulk Processing

Naive `notify_all` creates a notification and sends email inside one request loop. That couples database writes, email provider latency, retries, and user-facing response time.

Redesigned flow:

1. API validates the bulk notification request.
2. API stores a `notification_campaign` row.
3. API publishes jobs to a queue, partitioned by student range or department.
4. Workers consume jobs and insert notification rows in batches.
5. Email jobs are published separately after durable notification rows are created.
6. Email workers retry transient failures with exponential backoff and dead-letter permanent failures.

Redesigned `notify_all` pseudocode:

```text
function notify_all(request):
  campaign = save_campaign(request)
  student_ranges = split_students_into_ranges(request.audience)

  for range in student_ranges:
    publish queue "notification.write" {
      campaign_id: campaign.id,
      student_range: range
    }

  return {
    campaign_id: campaign.id,
    status: "queued"
  }

worker notification.write:
  insert notifications in batches of 500 to 1000
  publish one email.send job per recipient or per provider batch
  acknowledge queue message only after DB commit

worker email.send:
  call email provider
  retry transient failures with backoff
  move exhausted failures to dead-letter queue
```

Example tables:

```sql
CREATE TABLE notification_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category notification_category NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_delivery_failures (
  id BIGSERIAL PRIMARY KEY,
  campaign_id UUID NOT NULL,
  student_id BIGINT NOT NULL,
  channel TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Handling 200 email failures:

- Notification rows remain committed, so in-app delivery is not blocked.
- Failed email jobs are retried by the queue.
- After retry exhaustion, failures are moved to a dead-letter queue and recorded.
- Operators can replay failures after fixing provider or template issues.
- Metrics track failure rate by campaign and channel.

RabbitMQ vs Kafka:

- RabbitMQ is a strong fit for task queues, acknowledgements, retries, and dead-letter queues.
- Kafka is better for high-throughput event streams and replayable audit logs.
- For this service, RabbitMQ is simpler for email jobs; Kafka can be added for analytics and long-term event replay.

## Stage 6: Coding - Priority Inbox

Implemented in `notification_app_be`.

Local endpoint:

```http
GET /priority-inbox?studentID=1042&limit=10
```

Behavior:

- Fetches notifications from the configured protected external API.
- Normalizes common response shapes.
- Scores each notification by category and recency.
- Returns the top 10 by default.
- Uses `Log(stack, level, package, message)` throughout routing, service, domain, middleware, and error handling.

Priority formula:

```text
score = categoryWeight * 1000 + recencyScore * 100
categoryWeight: placement=3, result=2, event=1
recencyScore: 1 / (1 + ageHours / 24)
```

Sample response:

```json
{
  "data": [
    {
      "id": "noti_11",
      "title": "Drive opened",
      "message": "A new placement drive is available.",
      "category": "placement",
      "studentID": 1042,
      "isRead": false,
      "createdAt": "2026-05-16T09:30:00.000Z",
      "priorityScore": 3095.2041
    }
  ],
  "count": 1,
  "weights": {
    "Placement": 3,
    "Result": 2,
    "Event": 1
  }
}
```

## API Client Screenshots

Screenshots should be captured from Postman or Insomnia after setting the protected API credentials:

- `GET /priority-inbox?studentID=1042&limit=10`: request URL, response body, and response time.
- `GET /notifications?studentID=1042`: request URL, response body, and response time.
- `PATCH /notifications/{id}/read`: request body, response body, and response time.

Keep screenshot files in the submission folder without adding personal names to file names or captions.
