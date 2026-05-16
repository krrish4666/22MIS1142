'use strict';

const { Log } = require('../../logging_middleware');
const { fetchNotifications, markNotificationRead } = require('./externalApi');
const { getPriorityInbox, normalizeNotification } = require('./priority');
const { sendJson, sendError, readJson } = require('./http');
const { getConfig } = require('./config');

async function route(req, res) {
  const startedAt = Date.now();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    await Log('backend', 'info', 'route', `${req.method} ${url.pathname} request received.`);

    if (req.method === 'GET' && url.pathname === '/') {
      await Log('backend', 'info', 'controller', 'Root endpoint returned service metadata.');
      return sendJson(res, 200, {
        service: 'campus-notifications-backend',
        status: 'running',
        endpoints: [
          'GET /health',
          'GET /notifications?studentID=1042',
          'PATCH /notifications/:id/read',
          'GET /notifications/stream?studentID=1042',
          'GET /priority-inbox?studentID=1042&limit=10'
        ]
      });
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      await Log('backend', 'info', 'controller', 'Health check succeeded.');
      return sendJson(res, 200, { status: 'ok' });
    }

    if (req.method === 'GET' && url.pathname === '/notifications') {
      const filters = Object.fromEntries(url.searchParams.entries());
      const notifications = await fetchNotifications(filters);
      const normalized = notifications.map(normalizeNotification);
      await Log('backend', 'info', 'controller', `Returning ${normalized.length} notifications.`);
      return sendJson(res, 200, { data: normalized, count: normalized.length });
    }

    const markReadMatch = url.pathname.match(/^\/notifications\/([^/]+)\/read$/);
    if (req.method === 'PATCH' && markReadMatch) {
      const body = await readJson(req);
      const payload = await markNotificationRead(markReadMatch[1], body);
      await Log('backend', 'info', 'controller', 'Notification read state updated.');
      return sendJson(res, 200, { data: payload });
    }

    if (req.method === 'GET' && url.pathname === '/priority-inbox') {
      const filters = Object.fromEntries(url.searchParams.entries());
      const notifications = await fetchNotifications(filters);
      const data = getPriorityInbox(notifications, Number(filters.limit || 10));
      await Log('backend', 'info', 'domain', `Priority inbox calculated with ${data.length} records.`);
      return sendJson(res, 200, {
        data,
        count: data.length,
        weights: { Placement: 3, Result: 2, Event: 1 }
      });
    }

    if (req.method === 'GET' && url.pathname === '/notifications/stream') {
      await Log('backend', 'info', 'controller', 'Preparing notification stream response.');
      return streamNotifications(req, res, Object.fromEntries(url.searchParams.entries()));
    }

    await Log('backend', 'warn', 'route', `No route matched ${req.method} ${url.pathname}.`);
    return sendError(res, 404, 'NOT_FOUND', 'Route not found.');
  } catch (error) {
    const statusCode = error.statusCode || 500;
    await Log('backend', statusCode >= 500 ? 'error' : 'warn', 'handler', error.message);
    return sendError(res, statusCode, error.code || 'REQUEST_FAILED', error.message, error.body);
  } finally {
    await Log('backend', 'debug', 'middleware', `${req.method} ${url.pathname} finished in ${Date.now() - startedAt}ms.`);
  }
}

async function streamNotifications(req, res, filters) {
  const config = getConfig();
  let closed = false;

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive'
  });

  req.on('close', () => {
    closed = true;
  });

  await Log('backend', 'info', 'controller', 'Notification stream opened.');

  const sendSnapshot = async () => {
    if (closed) return;
    try {
      const notifications = await fetchNotifications(filters);
      const payload = JSON.stringify({
        data: notifications.map(normalizeNotification),
        sentAt: new Date().toISOString()
      });
      res.write(`event: notifications\n`);
      res.write(`data: ${payload}\n\n`);
    } catch (error) {
      await Log('backend', 'error', 'handler', `Stream fetch failed: ${error.message}`);
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: error.message })}\n\n`);
    }
  };

  await sendSnapshot();
  const timer = setInterval(sendSnapshot, config.streamPollMs);
  req.on('close', async () => {
    clearInterval(timer);
    await Log('backend', 'info', 'controller', 'Notification stream closed.');
  });
}

module.exports = { route };
