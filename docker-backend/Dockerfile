FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
# Install ALL deps for build (includes dev deps like typescript)
RUN npm install
COPY tsconfig.json ./tsconfig.json
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
# Install only production deps for runtime
RUN npm install --omit=dev
# Copy compiled output from builder
COPY --from=builder /app/dist ./dist
# Also copy demo filesystem template needed at runtime
COPY --from=builder /app/src/filesystem_template ./src/filesystem_template

# Prepare demo filesystem directory
RUN mkdir -p /app/data/demo_fs

ENV API_PORT=3001
ENV DEMO_FS_PATH=/app/data/demo_fs

EXPOSE 3001

CMD ["node", "dist/index.js"]

