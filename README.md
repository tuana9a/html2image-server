# HTML to Image Server

HTTP server that renders HTML to PNG with Puppeteer Core and a locally installed Chromium browser.

## Requirements

- Node.js 24 or newer
- Chromium, installed separately from Puppeteer

## Run

```sh
npm install
CHROMIUM_PATH=/path/to/chromium npm start
```

`CHROMIUM_PATH` is optional when Chromium is on `PATH` or installed at a common Linux location. Set `PORT` to change the default port (`3000`), `HOST` to change the default bind address (`0.0.0.0`), or `VIEWPORT_WIDTH` and `VIEWPORT_HEIGHT` to change the default screenshot viewport (`1280` by `720`).

## API

Send a JSON object with a string `html` field to `POST /screenshot` using `Content-Type: application/json`. The response is a PNG image of the rendered `<html>` element; the viewport defaults to 1280 by 720 pixels. HTML bodies are limited to 2 MB.

```sh
curl -X POST http://localhost:3000/screenshot \
  -H 'Content-Type: application/json' \
  --data '{"html":"<html><body><h1>Hello, world!</h1></body></html>"}' \
  --output screenshot.png
```

`GET /healthz` returns a JSON health status.

Only submit trusted HTML: rendered pages can execute scripts and request network resources available to the server.