FROM node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a

WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY src ./src
RUN mkdir .state /handover && chown node:node .state /handover

USER node
CMD ["node", "src/index.js"]
