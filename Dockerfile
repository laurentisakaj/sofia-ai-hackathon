# Stage 1: Build frontend
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files and install ALL deps (need devDeps for vite build)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source for frontend build
COPY index.html embed.html vite.config.ts tsconfig*.json tailwind.config.* postcss.config.* ./
COPY index.tsx index.css App.tsx embed.tsx types.ts constants.ts ./
COPY components/ components/
COPY services/ services/
COPY assets/ assets/
COPY public/ public/

# Build frontend
RUN npm run build

# Stage 2: Production runtime
FROM node:22-alpine AS runtime

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy backend source
COPY server.js server_constants.js ./
COPY backend/ backend/
COPY routes/ routes/
COPY lib/ lib/

# Copy built frontend from build stage
COPY --from=build /app/dist/ dist/

# Create empty data directory (clean slate)
RUN mkdir -p data sofia_data && \
    echo '[]' > data/stats.json && \
    echo '[]' > data/admin_logs.json && \
    echo '{}' > data/soft_knowledge.json && \
    echo '[]' > data/kb_suggestions.json && \
    echo '[]' > data/users.json && \
    echo '{}' > data/admin_config.json && \
    echo '[]' > data/knowledge_base.json && \
    echo '[]' > data/admin_activity.json && \
    echo '[]' > data/admin_audit.json

# Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

# Cloud Run sets PORT=8080 by default
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server.js"]
