# Frontend Dockerfile - Multi-stage build

# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --include=dev

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
ARG PRISM_RELEASE=development
ARG PRISM_REVISION=unknown
ARG PRISM_BUILD_DATE=unknown
LABEL org.opencontainers.image.title="KiCAD Prism frontend" \
    org.opencontainers.image.version="${PRISM_RELEASE}" \
    org.opencontainers.image.revision="${PRISM_REVISION}" \
    org.opencontainers.image.created="${PRISM_BUILD_DATE}" \
    org.opencontainers.image.source="https://github.com/krishna-swaroop/KiCAD-Prism" \
    org.opencontainers.image.licenses="Apache-2.0"

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config for SPA routing and API proxy.
# Map lives in a separate conf.d file (http context) so $prism_forwarded_proto
# can prefer the outer X-Forwarded-Proto over the internal HTTP $scheme.
COPY nginx-forwarded-map.conf /etc/nginx/conf.d/00-forwarded-map.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=10 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
