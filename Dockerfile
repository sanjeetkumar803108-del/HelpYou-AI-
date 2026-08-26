FROM node:20-slim

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies cleanly
RUN npm install

# Copy application source
COPY . .

# Build Vite frontend & Express bundle
RUN npm run build

# Expose port (Railway will map PORT dynamically)
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Start Node server
CMD ["node", "--max-old-space-size=1024", "dist/server.cjs"]
