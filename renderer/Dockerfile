# Playwright + Chromium, used only to render JavaScript pages the collector cannot read directly.
# Base image is the same Debian trixie slim the app uses (already present on this machine).
FROM node:24-trixie-slim

# Same switch as the app image: point npm at a mirror when the default registry is slow.
ARG NPM_REGISTRY=
# Optional mirror for the browser download (e.g. https://npmmirror.com/mirrors/playwright).
ARG PLAYWRIGHT_DOWNLOAD_HOST=

WORKDIR /app

# One fixed path so the non-root user finds the browser installed by the build.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund ${NPM_REGISTRY:+--registry=$NPM_REGISTRY} \
    && npx playwright install --with-deps chromium \
    && chown -R node:node /ms-playwright \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

COPY server.mjs ./

ENV NODE_ENV=production \
    PORT=3000

USER node
EXPOSE 3000

CMD ["node", "server.mjs"]
