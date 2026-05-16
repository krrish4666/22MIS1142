'use strict';

const DEFAULT_BASE_URL = 'http://4.224.186.213';

function getConfig() {
  return {
    port: Number(process.env.PORT || 8080),
    evaluationBaseUrl: (process.env.EVALUATION_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    notificationsPath: process.env.NOTIFICATIONS_API_PATH || '/evaluation-service/notifications',
    markReadPathTemplate: process.env.MARK_READ_API_PATH || '/evaluation-service/notifications/:id/read',
    requestTimeoutMs: Number(process.env.EXTERNAL_REQUEST_TIMEOUT_MS || 8000),
    streamPollMs: Number(process.env.STREAM_POLL_MS || 15000)
  };
}

module.exports = { getConfig };
