'use strict';

const http = require('http');
const { Log } = require('../../logging_middleware');
const { getConfig } = require('./config');
const { route } = require('./router');

async function main() {
  const config = getConfig();
  const server = http.createServer((req, res) => {
    route(req, res);
  });

  server.on('clientError', async (error, socket) => {
    await Log('backend', 'warn', 'handler', `Client error: ${error.message}`);
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  server.listen(config.port, async () => {
    await Log('backend', 'info', 'config', `Notification backend listening on port ${config.port}.`);
  });
}

main().catch(async (error) => {
  await Log('backend', 'fatal', 'handler', `Server failed to start: ${error.message}`);
  process.exitCode = 1;
});
