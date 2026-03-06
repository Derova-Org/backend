FROM node:22-slim AS build
WORKDIR /repo

# Build SDK first (backend depends on @derova/sdk via file:../sdk)
COPY sdk/package.json sdk/package-lock.json* sdk/
RUN cd sdk && npm ci
COPY sdk/tsconfig.json sdk/tsconfig.build.json* sdk/
COPY sdk/src sdk/src
RUN cd sdk && npm run build

# Build backend
COPY backend/package.json backend/package-lock.json* backend/
RUN cd backend && npm ci
COPY backend/tsconfig.json backend/
COPY backend/src backend/src
RUN cd backend && npm run build

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo/backend
COPY --from=build /repo/sdk /repo/sdk
COPY --from=build /repo/backend/package.json /repo/backend/package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /repo/backend/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
