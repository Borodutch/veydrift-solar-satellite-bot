FROM node:22.23.4-alpine

WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY src ./src
RUN mkdir .state /handover && chown node:node .state /handover

USER node
CMD ["node", "src/index.js"]
