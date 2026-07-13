# WSchools Fee Management System — production image
# node:sqlite requires Node >= 22.5, so we pin Node 22.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies first (better layer caching).
COPY package*.json ./
RUN npm ci --omit=dev

# App source.
COPY . .

# Runtime data directories (also mounted as volumes in compose).
RUN mkdir -p data backups public/uploads && chown -R node:node /app
USER node

EXPOSE 3000

# Liveness probe hits the built-in /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# On first boot the server auto-creates + seeds the database if missing.
CMD ["node", "server.js"]
