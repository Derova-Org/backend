FROM node:22-slim AS build
WORKDIR /app

# Build SDK first (backend depends on @derova/sdk via file:../sdk)
COPY sdk/package.json sdk/package-lock.json* sdk/
RUN cd sdk && npm ci
COPY sdk/tsconfig.json sdk/tsconfig.build.json* sdk/
COPY sdk/src sdk/src
RUN cd sdk && npm run build

# Build backend
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/sdk ./sdk
COPY --from=build /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
