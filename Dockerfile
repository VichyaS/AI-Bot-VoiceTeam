FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npm run build
EXPOSE 8080 5060/udp 5061/tcp
CMD ["node", "dist/webhook-server.js"]
