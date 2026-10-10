# One image, two roles: the website (Next.js standalone server) and the pipeline worker.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# No database is needed at build time: every page reads Postgres at request time.
RUN npx next build \
 && cp -r .next/static .next/standalone/.next/static \
 && cp -r public .next/standalone/public

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MEDIA_DIR=/data/media
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/media && chown -R node:node /data
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
# web (default) — the worker overrides this command in docker-compose.yml
CMD ["node", ".next/standalone/server.js"]
