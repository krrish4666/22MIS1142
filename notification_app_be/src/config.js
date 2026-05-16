'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_BASE_URL = 'http://4.224.186.213';
let envLoaded = false;

function loadEnvFile() {
  if (envLoaded) return;
  envLoaded = true;

  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'notification_app_be', '.env'),
    path.resolve(__dirname, '..', '.env')
  ];

  for (const envPath of candidatePaths) {
    if (!fs.existsSync(envPath)) continue;

    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function getConfig() {
  loadEnvFile();

  return {
    port: Number(process.env.PORT || 8080),
    evaluationBaseUrl: (process.env.EVALUATION_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    notificationsPath: process.env.NOTIFICATIONS_API_PATH || '/evaluation-service/notifications',
    markReadPathTemplate: process.env.MARK_READ_API_PATH || '/evaluation-service/notifications/:id/read',
    requestTimeoutMs: Number(process.env.EXTERNAL_REQUEST_TIMEOUT_MS || 8000),
    streamPollMs: Number(process.env.STREAM_POLL_MS || 15000)
  };
}

module.exports = { getConfig, loadEnvFile };
