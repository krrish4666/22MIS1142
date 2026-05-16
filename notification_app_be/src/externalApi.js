'use strict';

const { getAccessToken, Log } = require('../../logging_middleware');
const { getConfig } = require('./config');

function withQuery(path, queryParams) {
  const config = getConfig();
  const url = new URL(`${config.evaluationBaseUrl}${path}`);
  for (const [key, value] of Object.entries(queryParams || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function fetchExternalJson(url, options = {}) {
  const config = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    let token = await getAccessToken();
    let response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });

    if (response.status === 401) {
      await Log('backend', 'warn', 'auth', 'External API returned 401; refreshing access token once.');
      token = await getAccessToken(true);
      response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(options.headers || {})
        }
      });
    }

    const text = await response.text();
    const body = text ? parseJsonOrRaw(text) : {};
    if (!response.ok) {
      const error = new Error(`External API returned HTTP ${response.status}`);
      error.statusCode = response.status;
      error.body = body;
      throw error;
    }
    return body;
  } catch (error) {
    if (error.statusCode) throw error;
    throw toExternalServiceError(error);
  } finally {
    clearTimeout(timeout);
  }
}

function toExternalServiceError(cause) {
  const error = new Error('External notification service is unavailable.');
  error.statusCode = 503;
  error.code = 'EXTERNAL_SERVICE_UNAVAILABLE';
  error.body = {
    cause: cause.name === 'AbortError' ? 'request_timeout' : 'request_failed'
  };
  return error;
}

function parseJsonOrRaw(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text };
  }
}

function unwrapNotifications(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.notifications)) return payload.notifications;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.notifications)) return payload.data.notifications;
  return [];
}

async function fetchNotifications(filters) {
  const config = getConfig();
  const url = withQuery(config.notificationsPath, filters);
  await Log('backend', 'debug', 'service', 'Fetching notifications from external API.');
  const payload = await fetchExternalJson(url, { method: 'GET' });
  const notifications = unwrapNotifications(payload);
  await Log('backend', 'info', 'service', `Fetched ${notifications.length} notifications from external API.`);
  return notifications;
}

async function markNotificationRead(notificationId, body = {}) {
  const config = getConfig();
  const encodedId = encodeURIComponent(notificationId);
  const path = config.markReadPathTemplate.replace(':id', encodedId);
  const url = withQuery(path, {});
  await Log('backend', 'info', 'service', `Marking notification ${encodedId} as read.`);
  try {
    return await fetchExternalJson(url, {
      method: 'PATCH',
      body: JSON.stringify({ isRead: true, ...body })
    });
  } catch (error) {
    if (error.statusCode !== 404) throw error;

    await Log('backend', 'warn', 'service', 'External mark-read endpoint unavailable; returning local acknowledgement.');
    return {
      id: notificationId,
      isRead: true,
      readAt: new Date().toISOString(),
      externalSynced: false,
      reason: 'external_mark_read_endpoint_not_available'
    };
  }
}

module.exports = {
  fetchNotifications,
  markNotificationRead
};
