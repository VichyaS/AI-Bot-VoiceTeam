# Dockerfile — Fly.io
FROM node:24-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci && npm cache clean --force

# Copy admin-dashboard package
COPY admin-dashboard/package*.json admin-dashboard/
RUN cd admin-dashboard && npm ci && npm cache clean --force

# Copy source
COPY . .

# Build
RUN npm run build:all

# Expose ports
EXPOSE 8080
EXPOSE 5060/udp
EXPOSE 5062

# Start
CMD ["node", "dist/webhook-server.js"]