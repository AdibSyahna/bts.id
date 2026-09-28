# Single-stage image: install deps, compile TypeScript, run dist/index.js.
# Base image matches the local Node version and provides the glibc prebuilt
# sqlite3 binding, so no compiler (python3/make/g++) is needed in the image.
FROM node:24-bookworm-slim

WORKDIR /app

# Container defaults; docker-compose.yml can override any of these.
ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=data/app.db

# Dependencies first, so this layer stays cached while you edit source code.
COPY package.json package-lock.json ./
RUN npm ci

# TypeScript -> dist/
# Append "&& npm run test" to gate the image on the test suite.
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Drop dev-only packages (typescript, tsx, supertest) from the image.
RUN npm prune --omit=dev

# The sqlite file lives in /app/data; docker-compose mounts a volume there.
RUN mkdir -p /app/data && chown -R node:node /app

# Do not run the API as root.
USER node

EXPOSE 3000

# Uses the app's own /health endpoint (slim images have no curl/wget).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then((r)=>{process.exit(r.ok?0:1);}).catch(()=>{process.exit(1);})"

# src/index.ts traps SIGTERM/SIGINT, so `docker stop` closes the DB cleanly.
CMD ["node", "dist/index.js"]
