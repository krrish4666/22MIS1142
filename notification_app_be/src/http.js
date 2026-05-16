'use strict';

function sendJson(res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...headers
  });
  res.end(payload);
}

function sendError(res, statusCode, code, message, details) {
  sendJson(res, statusCode, {
    error: {
      code,
      message,
      ...(details ? { details } : {})
    }
  });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    error.statusCode = 400;
    error.code = 'INVALID_JSON';
    throw error;
  }
}

module.exports = { sendJson, sendError, readJson };
