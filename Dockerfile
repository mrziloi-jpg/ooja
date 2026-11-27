# Docker Hub blocks Iranian IPs. On an Iranian server build with a mirror:
#   docker compose build --build-arg REGISTRY=docker.arvancloud.ir/
ARG REGISTRY=
FROM ${REGISTRY}node:24-alpine AS build
# The public URL is baked into the build (canonical URLs, trusted proxy host).
ARG SITE_URL=http://localhost:4321
ENV SITE_URL=${SITE_URL}
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM ${REGISTRY}node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./
COPY --from=build /app/scripts ./scripts
# Uploaded product photos live in the "media" volume. Creating the folder owned by "node" here makes Docker
# create the named volume with that ownership; otherwise it is root-owned and uploads fail.
RUN mkdir -p /media && chown node:node /media
USER node
EXPOSE 4321
# Apply pending migrations, then start. Node's heap is capped so the app stays inside its memory budget.
CMD ["sh", "-c", "node scripts/migrate.mjs && node --max-old-space-size=384 dist/server/entry.mjs"]
