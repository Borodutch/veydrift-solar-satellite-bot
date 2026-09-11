FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir .state && chown node:node .state

USER node
CMD ["npm", "start"]
