FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/admin-web/package.json ./apps/admin-web/package.json
RUN corepack enable && pnpm install --frozen-lockfile --filter @openspace/admin-web
WORKDIR /repo
COPY apps/admin-web ./apps/admin-web
RUN pnpm --filter @openspace/admin-web build

FROM nginx:stable-alpine@sha256:47928bf67eb62a1863cb08d9ecb52d3e704304ba614eaee17884204677702951
RUN apk add --no-cache brotli-libs=1.2.1-r0
COPY --from=build /repo/apps/admin-web/dist /usr/share/nginx/html
COPY apps/admin-web/nginx-main.conf /etc/nginx/nginx.conf
COPY apps/admin-web/nginx.conf /etc/nginx/conf.d/default.conf
USER nginx
EXPOSE 8080
