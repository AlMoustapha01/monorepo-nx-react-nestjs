# syntax=docker/dockerfile:1
# Image d'une app Node du monorepo, choisie par APP (api par défaut).
# api : une seule image, trois commandes.
#   node main.js     API HTTP (JOBS_ENABLED=false en prod : les jobs tournent dans le worker)
#   node worker.js   relais de l'outbox, worker BullMQ, purge quotidienne
#   node migrate.js  migrations, en étape de déploiement avant les nouvelles instances
# auth (docker build --build-arg APP=auth) : node main.js (service d'identité), node migrate.js.
# Base épinglée par digest (node 24.22.0) : un tag peut changer, un digest non.
ARG NODE_IMAGE=node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
ARG APP=api

FROM ${NODE_IMAGE} AS build
ARG APP
WORKDIR /repo
RUN corepack enable
ENV NX_DAEMON=false NX_NO_CLOUD=true NX_SKIP_NX_CACHE=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --offline
# Bundle webpack, plus package.json et lockfile réduits aux dépendances runtime (generatePackageJson).
RUN pnpm nx build ${APP}

FROM ${NODE_IMAGE} AS deps
ARG APP
WORKDIR /app
RUN corepack enable
COPY --from=build /repo/dist/apps/${APP}/package.json /repo/dist/apps/${APP}/pnpm-lock.yaml /repo/dist/apps/${APP}/pnpm-workspace.yaml ./
# Sans dépendances optionnelles : les peers optionnels (better-auth : drizzle-kit, vitest, react…)
# que pnpm rattache aux paquets du monorepo n'entrent pas dans l'image.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --no-optional

FROM ${NODE_IMAGE} AS runtime
ARG APP
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /repo/dist/apps/${APP} ./
USER node
EXPOSE 3000
CMD ["node", "main.js"]
