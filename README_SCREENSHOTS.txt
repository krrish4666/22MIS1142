Campus Notifications Backend - Screenshot Guide

Before taking screenshots:
1. Start the backend:
   npm.cmd start

2. Confirm the backend is running at:
   http://localhost:8080

3. If calling protected external notification APIs, set the required environment variables first:
   EVALUATION_ACCESS_TOKEN
   or
   EVALUATION_CLIENT_ID
   EVALUATION_CLIENT_SECRET
   EVALUATION_EMAIL
   EVALUATION_ROLL_NO
   EVALUATION_ACCESS_CODE

Postman or Insomnia screenshots to capture:

1. Health Check
   Method: GET
   URL: http://localhost:8080/health
   Body: none
   Expected response:
   {
     "status": "ok"
   }
   Capture:
   - request method and URL
   - response body
   - response time

2. Fetch Notifications
   Method: GET
   URL: http://localhost:8080/notifications?studentID=1042
   Body: none
   Capture:
   - request method and URL
   - response body
   - response time

3. Priority Inbox
   Method: GET
   URL: http://localhost:8080/priority-inbox?studentID=1042&limit=10
   Body: none
   Capture:
   - request method and URL
   - response body showing top notifications
   - response time

4. Mark Notification As Read
   Method: PATCH
   URL: http://localhost:8080/notifications/<notification_id>/read
   Headers:
   content-type: application/json
   Body:
   {
     "isRead": true
   }
   Capture:
   - request method and URL
   - request body
   - response body
   - response time

Screenshot naming suggestion:
health_check.png
fetch_notifications.png
priority_inbox.png
mark_read.png

Do not include personal names or real secrets in screenshot file names, captions, or visible environment fields.
