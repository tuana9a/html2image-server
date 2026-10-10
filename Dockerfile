FROM node:24-bookworm@sha256:64af3819f9275802414d7cdc38c27e9d82bd564dec4d4da87d008255d36c63b4

ENV LANG=en_US.UTF-8
ENV PPTRUSER_UID=10042
ENV DBUS_SESSION_BUS_ADDRESS=autolaunch:

# Enable non-free fonts and pre-accept the installer EULA for noninteractive builds.
RUN sed -i 's/Components: main$/Components: main contrib non-free non-free-firmware/' /etc/apt/sources.list.d/debian.sources \
    && echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        dbus \
        dbus-x11 \
        dumb-init \
        fonts-freefont-ttf \
        fonts-ipafont-gothic \
        fonts-kacst \
        fonts-khmeros \
        ttf-mscorefonts-installer \
        fonts-thai-tlwg \
        fonts-wqy-zenhei \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r pptruser \
    && useradd -u "$PPTRUSER_UID" -rm -g pptruser -G audio,video pptruser

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js ./
RUN chown -R pptruser:pptruser /app

ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PORT=3000
EXPOSE 3000

USER $PPTRUSER_UID
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
