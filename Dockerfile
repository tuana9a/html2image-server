FROM node:24-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js ./

ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
