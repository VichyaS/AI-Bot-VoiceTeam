FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 8080 5060/udp
ENV NODE_ENV=production
CMD ["node", "dist/webhook-server.js"]
