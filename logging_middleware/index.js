'use strict';

const DEFAULT_BASE_URL = 'http://4.224.186.213';
const LOG_ENDPOINT = '/evaluation-service/logs';
const AUTH_ENDPOINT = '/evaluation-service/auth';
const REGISTER_ENDPOINT = '/evaluation-service/register';

const VALID_STACKS = new Set(['backend']);
const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'fatal']);
const VALID_PACKAGES = new Set([
  'cache',
  'controller',
  'cron_job',
  'db',
  'domain',
  'handler',
  'repository',
  'route',
  'service',
  'auth',
  'config',
  'middleware',
  'utils'
]);

let cachedToken = null;
let tokenExpiresAt = 0;

function requireFetch() {
  if (typeof fetch !== 'function') {
    throw new Error('Node.js 18 or newer is required for global fetch support.');
  }
  return fetch;
}

function getBaseUrl() {
  return (process.env.EVALUATION_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} must contain valid JSON.`);
  }
}

function buildAuthPayload() {
  const explicitPayload = parseJsonEnv('EVALUATION_AUTH_PAYLOAD_JSON');
  if (explicitPayload) return explicitPayload;

  const payload = {};
  const fieldMap = {
    EVALUATION_EMAIL: 'email',
    EVALUATION_ROLL_NO: 'rollNo',
    EVALUATION_ACCESS_CODE: 'accessCode',
    EVALUATION_CLIENT_ID: 'clientID',
    EVALUATION_CLIENT_SECRET: 'clientSecret'
  };

  for (const [envName, payloadName] of Object.entries(fieldMap)) {
    if (process.env[envName]) payload[payloadName] = process.env[envName];
  }

  return payload;
}

function hasUsableToken() {
  return cachedToken && Date.now() < tokenExpiresAt - 30_000;
}

async function registerClient(payload = parseJsonEnv('EVALUATION_REGISTRATION_PAYLOAD_JSON')) {
  if (!payload) {
    throw new Error('Registration payload is required. Set EVALUATION_REGISTRATION_PAYLOAD_JSON or pass a payload.');
  }

  const response = await requireFetch()(`${getBaseUrl()}${process.env.EVALUATION_REGISTER_PATH || REGISTER_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(`Registration failed with HTTP ${response.status}: ${stringifyBody(body)}`);
  }

  return body;
}

async function getAccessToken(forceRefresh = false) {
  if (!forceRefresh && hasUsableToken()) return cachedToken;
  if (process.env.EVALUATION_ACCESS_TOKEN) return process.env.EVALUATION_ACCESS_TOKEN;

  const payload = buildAuthPayload();
  if (!payload.clientID || !payload.clientSecret) {
    throw new Error('Missing credentials. Set EVALUATION_ACCESS_TOKEN or auth payload environment variables.');
  }

  const response = await requireFetch()(`${getBaseUrl()}${process.env.EVALUATION_AUTH_PATH || AUTH_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(`Auth failed with HTTP ${response.status}: ${stringifyBody(body)}`);
  }

  cachedToken = body.access_token || body.accessToken || body.token;
  const expiresInSeconds = Number(body.expires_in || body.expiresIn || 3600);
  tokenExpiresAt = Date.now() + expiresInSeconds * 1000;

  if (!cachedToken) {
    throw new Error('Auth response did not include an access token.');
  }

  return cachedToken;
}

function validateLogInput(stack, level, packageName, message) {
  if (!VALID_STACKS.has(stack)) throw new Error(`Invalid stack: ${stack}`);
  if (!VALID_LEVELS.has(level)) throw new Error(`Invalid level: ${level}`);
  if (!VALID_PACKAGES.has(packageName)) throw new Error(`Invalid package: ${packageName}`);
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new Error('Log message must be a non-empty string.');
  }
}

async function Log(stack, level, packageName, message) {
  validateLogInput(stack, level, packageName, message);

  const payload = {
    stack,
    level,
    package: packageName,
    message: message.slice(0, 500)
  };

  const headers = { 'content-type': 'application/json' };
  try {
    headers.authorization = `Bearer ${await getAccessToken()}`;
  } catch (error) {
    if (process.env.LOG_REQUIRE_REMOTE === 'true') throw error;
    return { delivered: false, reason: error.message };
  }

  let response;
  try {
    response = await requireFetch()(`${getBaseUrl()}${process.env.EVALUATION_LOG_PATH || LOG_ENDPOINT}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (process.env.LOG_REQUIRE_REMOTE === 'true') throw error;
    return { delivered: false, reason: 'log_service_unavailable' };
  }

  if (!response.ok) {
    const body = await readResponseBody(response);
    if (response.status === 401) {
      cachedToken = null;
    }
    if (process.env.LOG_REQUIRE_REMOTE === 'true') {
      throw new Error(`Remote log failed with HTTP ${response.status}: ${stringifyBody(body)}`);
    }
    return { delivered: false, status: response.status, body };
  }

  return { delivered: true };
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text };
  }
}

function stringifyBody(body) {
  return typeof body === 'string' ? body : JSON.stringify(body);
}

module.exports = {
  Log,
  getAccessToken,
  registerClient,
  constants: {
    VALID_STACKS,
    VALID_LEVELS,
    VALID_PACKAGES
  }
};
