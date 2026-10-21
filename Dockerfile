FROM node:24.19.0-bookworm-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24.19.0-bookworm-slim AS backend-dependencies

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:24.19.0-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app/backend

COPY --from=backend-dependencies /app/backend/node_modules ./node_modules
COPY backend/package.json backend/package-lock.json ./
COPY backend/src ./src
COPY backend/assets ./assets
COPY logo.jpg /app/logo.jpg
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

EXPOSE 8888
CMD ["node", "src/server.js"]
