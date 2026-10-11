const { constants, accessSync } = require('node:fs');
const { delimiter, join } = require('node:path');
const { createServer } = require('node:http');
const puppeteer = require('puppeteer-core');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const VIEWPORT_WIDTH = Number(process.env.VIEWPORT_WIDTH || 1280);
const VIEWPORT_HEIGHT = Number(process.env.VIEWPORT_HEIGHT || 720);
const MAX_HTML_SIZE = 2 * 1024 * 1024;
const CHROMIUM_NAMES = [
  'chromium',
  'chromium-browser',
  'google-chrome',
  'google-chrome-stable',
];
const COMMON_CHROMIUM_PATHS = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/snap/bin/chromium',
  '/opt/google/chrome/chrome',
];

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function findChromium() {
  const pathEntries = (process.env.PATH || '').split(delimiter);
  const candidates = [
    process.env.CHROMIUM_PATH,
    ...pathEntries.flatMap((directory) =>
      CHROMIUM_NAMES.map((name) => join(directory, name)),
    ),
    ...COMMON_CHROMIUM_PATHS,
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function readScreenshotRequest(request) {
  return new Promise((resolve, reject) => {
    const contentType = (request.headers['content-type'] || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_HTML_SIZE) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });

    request.on('end', () => {
      if (tooLarge) {
        reject(new HttpError(413, 'HTML body exceeds the 2 MB limit'));
        return;
      }

      const body = Buffer.concat(chunks).toString('utf8');
      if (contentType !== 'application/json') {
        reject(new HttpError(415, 'Content-Type must be application/json'));
        return;
      }

      try {
        const payload = JSON.parse(body);
        if (typeof payload.html !== 'string') {
          throw new HttpError(400, 'JSON body must include a string "html" field');
        }
        if (payload.selector !== undefined &&
            (typeof payload.selector !== 'string' || !payload.selector.trim())) {
          throw new HttpError(400, 'JSON "selector" field must be a non-empty CSS selector string');
        }
        resolve({ html: payload.html, selector: payload.selector || 'html' });
      } catch (error) {
        reject(error instanceof HttpError ? error : new HttpError(400, 'Invalid JSON body'));
      }
    });

    request.on('error', reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

async function start() {
  const executablePath = findChromium();
  if (!executablePath) {
    throw new Error('Chromium not found. Install Chromium or set CHROMIUM_PATH to its executable.');
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    if (request.method === 'GET' && url.pathname === '/healthz') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (request.method !== 'POST' || url.pathname !== '/screenshot') {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    let context;
    try {
      const { html, selector } = await readScreenshotRequest(request);
      context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
      page.setDefaultNavigationTimeout(15000);
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const element = await page.$(selector);
      if (!element) {
        throw new HttpError(400, `No element found for selector: ${selector}`);
      }
      const image = await element.screenshot({ type: 'png' });

      response.writeHead(200, {
        'content-type': 'image/png',
        'content-length': image.length,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(image);
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      if (statusCode === 500) console.error('Screenshot request failed:', error);
      if (!response.headersSent) {
        sendJson(response, statusCode, {
          error: statusCode === 500 ? 'Failed to render screenshot' : error.message,
        });
      }
    } finally {
      if (context) await context.close().catch(() => {});
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`HTML screenshot server listening on http://${HOST}:${PORT}`);
    console.log(`Using Chromium at ${executablePath}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close();
      browser.close().catch((error) => console.error('Failed to close Chromium:', error));
    });
  }
}

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});