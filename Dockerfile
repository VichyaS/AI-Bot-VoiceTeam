# Dockerfile — Fly.io
FROM node:24-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production && npm cache clean --force

# Copy admin-dashboard package
COPY admin-dashboard/package*.json admin-dashboard/
RUN cd admin-dashboard && npm ci --production && npm cache clean --force

# Copy source
COPY . .

# Build
RUN npm run build:all

# Expose ports
EXPOSE 8080
EXPOSE 5060/udp

# Start
CMD ["node", "dist/webhook-server.js"]