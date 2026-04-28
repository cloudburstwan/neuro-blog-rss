FROM node:24-alpine AS base
WORKDIR /etc/app

FROM base as installation

COPY package.json /temp/dev
RUN cd /temp/dev && npm install --save-dev

COPY package.json /temp/prod
RUN cd /temp/prod && npm install

FROM base as build

COPY --from=installation /temp/dev/node_modules ./node_modules
COPY src ./src
RUN npm install typescript -g
RUN tsc

FROM base as release

COPY --from=installation /temp/prod/node_modules ./node_modules
COPY --from=build dist .
ENTRYPOINT ["node", "index.js"]