# Deployment Architecture

## Executive Summary

The Bill Bot deployment architecture is designed for Railway platform deployment using a monorepo structure with Docker containers. The architecture emphasizes scalability, reliability, and maintainability through containerized microservices, automated CI/CD pipelines, and comprehensive monitoring. The design supports both development and production environments with appropriate security measures and performance optimizations.

## Deployment Overview

### Platform Architecture

```mermaid
graph TB
    subgraph "Railway Platform"
        subgraph "Production Environment"
            FE[Frontend Service]
            BE[Backend Service]
            MCP[MCP Server Service]
        end
        
        subgraph "Database Layer"
            SB[(Supabase PostgreSQL)]
            RD[(Redis Cache)]
        end
        
        subgraph "External Services"
            OR[OpenRouter API]
            CO[Cohere API]
            RSS[Government RSS Feeds]
        end
        
        subgraph "Monitoring"
            LOG[Logging Service]
            MET[Metrics Collection]
            ALT[Alerting]
        end
    end
    
    subgraph "CDN Layer"
        CF[Cloudflare/Railway CDN]
    end
    
    Users --> CF
    CF --> FE
    FE --> BE
    BE --> MCP
    BE --> OR
    BE --> CO
    MCP --> SB
    BE --> RD
    MCP --> RSS
    
    FE --> LOG
    BE --> LOG
    MCP --> LOG
    LOG --> MET
    MET --> ALT
```

### Monorepo Structure

```
bill-bot/
├── .github/
│   └── workflows/
│       ├── deploy-production.yml
│       ├── deploy-staging.yml
│       └── test.yml
├── frontend/
│   ├── src/
│   ├── public/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── backend/
│   ├── src/
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── mcp-server/
│   ├── src/
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── shared/
│   ├── types/
│   ├── utils/
│   └── package.json
├── config/
│   ├── production.yml
│   ├── staging.yml
│   └── development.yml
├── migrations/
│   ├── 001_initial_schema.sql
│   └── 002_indexes_optimization.sql
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.production.yml
│   └── Dockerfile.base
├── scripts/
│   ├── deploy.sh
│   ├── migrate.sh
│   └── health-check.sh
├── docs/
├── package.json
├── turbo.json
└── railway.json
```

## Service Containerization

### Frontend Container (Nginx + React)

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package*.json ./
COPY ../shared/package*.json ../shared/
RUN npm ci --only=production

# Build application
FROM base AS builder
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/../shared/node_modules ../shared/node_modules

# Build shared package first
WORKDIR /app/../shared
RUN npm run build

# Build frontend
WORKDIR /app
RUN npm run build

# Production server
FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Backend Container (Node.js API)

```dockerfile
# backend/Dockerfile
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat curl
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package*.json ./
COPY ../shared/package*.json ../shared/
RUN npm ci --only=production && npm cache clean --force

# Build application
FROM base AS builder
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/../shared/node_modules ../shared/node_modules

# Build shared package
WORKDIR /app/../shared
RUN npm run build

# Build backend
WORKDIR /app
RUN npm run build

# Production runtime
FROM node:20-alpine AS runner
RUN apk add --no-cache curl dumb-init
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Health check script
COPY --chown=nodejs:nodejs health-check.sh ./
RUN chmod +x health-check.sh

USER nodejs

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ./health-check.sh

EXPOSE 3001

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

### MCP Server Container

```dockerfile
# mcp-server/Dockerfile
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package*.json ./
COPY ../shared/package*.json ../shared/
RUN npm ci --only=production

# Build application
FROM base AS builder
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/../shared/node_modules ../shared/node_modules

# Build shared package
WORKDIR /app/../shared
RUN npm run build

# Build MCP server
WORKDIR /app
RUN npm run build

# Production runtime
FROM node:20-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app

ENV NODE_ENV=production
ENV MCP_PORT=3002

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

USER nodejs

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)"

EXPOSE 3002

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

## Railway Configuration

### Service Definitions

```json
// railway.json
{
  "$schema": "https://railway.app/railway.schema.json",
  "services": {
    "frontend": {
      "source": {
        "repo": "your-username/bill-bot",
        "rootDirectory": "/frontend"
      },
      "build": {
        "builder": "DOCKERFILE",
        "dockerfilePath": "Dockerfile"
      },
      "deploy": {
        "healthcheckPath": "/health",
        "healthcheckTimeout": 300,
        "numReplicas": 1,
        "sleepApplication": false,
        "restartPolicyType": "ON_FAILURE"
      },
      "variables": {
        "VITE_API_BASE_URL": "${{backend.RAILWAY_PUBLIC_DOMAIN}}",
        "VITE_APP_NAME": "Bill Bot",
        "VITE_APP_VERSION": "1.0.0"
      }
    },
    
    "backend": {
      "source": {
        "repo": "your-username/bill-bot",
        "rootDirectory": "/backend"
      },
      "build": {
        "builder": "DOCKERFILE",
        "dockerfilePath": "Dockerfile"
      },
      "deploy": {
        "healthcheckPath": "/api/health",
        "healthcheckTimeout": 300,
        "numReplicas": 1,
        "sleepApplication": false,
        "restartPolicyType": "ON_FAILURE"
      },
      "variables": {
        "NODE_ENV": "production",
        "PORT": "3001",
        "FRONTEND_URL": "${{frontend.RAILWAY_PUBLIC_DOMAIN}}",
        "MCP_SERVER_URL": "${{mcp-server.RAILWAY_PRIVATE_DOMAIN}}:3002",
        "DATABASE_URL": "${{Postgres.DATABASE_URL}}",
        "REDIS_URL": "${{Redis.REDIS_URL}}",
        "OPENROUTER_API_KEY": "${{OPENROUTER_API_KEY}}",
        "COHERE_API_KEY": "${{COHERE_API_KEY}}"
      }
    },
    
    "mcp-server": {
      "source": {
        "repo": "your-username/bill-bot",
        "rootDirectory": "/mcp-server"
      },
      "build": {
        "builder": "DOCKERFILE",
        "dockerfilePath": "Dockerfile"
      },
      "deploy": {
        "numReplicas": 1,
        "sleepApplication": false,
        "restartPolicyType": "ON_FAILURE"
      },
      "variables": {
        "NODE_ENV": "production",
        "MCP_PORT": "3002",
        "DATABASE_URL": "${{Postgres.DATABASE_URL}}",
        "COHERE_API_KEY": "${{COHERE_API_KEY}}"
      }
    }
  }
}
```

### Environment Configuration

```bash
# Production Environment Variables (Railway)

# Application
NODE_ENV=production
LOG_LEVEL=info

# API Configuration
PORT=3001
FRONTEND_URL=https://billbot.railway.app
CORS_ORIGINS=https://billbot.railway.app,https://billbot-staging.railway.app

# Database
DATABASE_URL=postgresql://username:password@host:port/database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Cache
REDIS_URL=redis://username:password@host:port

# External APIs
OPENROUTER_API_KEY=your-openrouter-api-key
COHERE_API_KEY=your-cohere-api-key

# Security
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-encryption-key

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Monitoring
SENTRY_DSN=your-sentry-dsn
NEW_RELIC_LICENSE_KEY=your-newrelic-key

# Feature Flags
ENABLE_RSS_POLLING=true
ENABLE_RERANKING=true
ENABLE_CACHING=true
MAX_SEARCH_ITERATIONS=20
```

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run linting
      run: npm run lint
      
    - name: Run type checking
      run: npm run type-check
      
    - name: Run tests
      run: npm run test
      
    - name: Build applications
      run: npm run build

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [frontend, backend, mcp-server]
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
      
    - name: Log in to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
        
    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-${{ matrix.service }}
        tags: |
          type=ref,event=branch
          type=ref,event=pr
          type=sha,prefix={{branch}}-
          type=raw,value=latest,enable={{is_default_branch}}
          
    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
        context: ./${{ matrix.service }}
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: production
    
    steps:
    - name: Deploy to Railway
      uses: railway/railway-deploy@v1
      with:
        railway_token: ${{ secrets.RAILWAY_TOKEN }}
        service: bill-bot-production
        
    - name: Run database migrations
      run: |
        curl -X POST \
          -H "Authorization: Bearer ${{ secrets.RAILWAY_API_TOKEN }}" \
          -H "Content-Type: application/json" \
          -d '{"command": "npm run migrate"}' \
          https://api.railway.app/v2/projects/${{ secrets.RAILWAY_PROJECT_ID }}/services/${{ secrets.RAILWAY_BACKEND_SERVICE_ID }}/deployments
          
    - name: Health check
      run: |
        sleep 30
        curl -f https://billbot-api.railway.app/api/health || exit 1
        
    - name: Notify deployment
      uses: 8398a7/action-slack@v3
      with:
        status: ${{ job.status }}
        channel: '#deployments'
        webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
      if: always()
```

### Staging Environment

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [develop]
  pull_request:
    branches: [main]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Deploy to Railway (Staging)
      uses: railway/railway-deploy@v1
      with:
        railway_token: ${{ secrets.RAILWAY_STAGING_TOKEN }}
        service: bill-bot-staging
        
    - name: Run integration tests
      run: npm run test:integration
      env:
        API_BASE_URL: https://billbot-staging-api.railway.app
        
    - name: Comment PR with staging URL
      uses: actions/github-script@v7
      if: github.event_name == 'pull_request'
      with:
        script: |
          github.rest.issues.createComment({
            issue_number: context.issue.number,
            owner: context.repo.owner,
            repo: context.repo.repo,
            body: '🚀 Staging deployment ready: https://billbot-staging.railway.app'
          })
```

## Health Monitoring

### Health Check Implementation

```bash
#!/bin/bash
# scripts/health-check.sh

# Backend health check
check_backend() {
    local response=$(curl -s -w "%{http_code}" http://localhost:3001/api/health -o /tmp/health_response)
    local http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" = "200" ]; then
        local status=$(jq -r '.status' /tmp/health_response)
        if [ "$status" = "healthy" ]; then
            echo "Backend: Healthy"
            return 0
        else
            echo "Backend: Unhealthy - Status: $status"
            return 1
        fi
    else
        echo "Backend: Unhealthy - HTTP $http_code"
        return 1
    fi
}

# Database connectivity check
check_database() {
    if node -e "
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.query('SELECT 1').then(() => {
            console.log('Database: Connected');
            process.exit(0);
        }).catch(err => {
            console.error('Database: Connection failed -', err.message);
            process.exit(1);
        });
    "; then
        return 0
    else
        return 1
    fi
}

# External services check
check_external_services() {
    # Check OpenRouter
    if curl -s -f -H "Authorization: Bearer $OPENROUTER_API_KEY" \
       https://openrouter.ai/api/v1/models > /dev/null; then
        echo "OpenRouter: Available"
    else
        echo "OpenRouter: Unavailable"
        return 1
    fi
    
    # Check Cohere
    if curl -s -f -H "Authorization: Bearer $COHERE_API_KEY" \
       https://api.cohere.ai/v1/models > /dev/null; then
        echo "Cohere: Available"
    else
        echo "Cohere: Unavailable"
        return 1
    fi
    
    return 0
}

# Run all checks
main() {
    echo "Running health checks..."
    
    local exit_code=0
    
    check_backend || exit_code=1
    check_database || exit_code=1
    check_external_services || exit_code=1
    
    if [ $exit_code -eq 0 ]; then
        echo "✅ All health checks passed"
    else
        echo "❌ Some health checks failed"
    fi
    
    exit $exit_code
}

main "$@"
```

### Monitoring and Alerting

```typescript
// src/monitoring/metrics.ts
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Enable default metrics collection
collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

export const chatSessionsActive = new Gauge({
  name: 'chat_sessions_active',
  help: 'Number of active chat sessions',
});

export const searchOperationsTotal = new Counter({
  name: 'search_operations_total',
  help: 'Total number of search operations',
  labelNames: ['type', 'status'],
});

export const searchDuration = new Histogram({
  name: 'search_duration_seconds',
  help: 'Duration of search operations in seconds',
  labelNames: ['type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

// Middleware to collect HTTP metrics
export function metricsMiddleware(req: any, res: any, next: any) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    
    httpRequestsTotal
      .labels(req.method, route, res.statusCode.toString())
      .inc();
      
    httpRequestDuration
      .labels(req.method, route)
      .observe(duration);
  });
  
  next();
}

// Metrics endpoint
export function metricsHandler(req: any, res: any) {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
}
```

## Backup and Recovery

### Database Backup Strategy

```bash
#!/bin/bash
# scripts/backup.sh

set -e

BACKUP_DIR="/tmp/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="billbot_backup_${TIMESTAMP}.sql"

echo "Starting database backup..."

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create database backup
pg_dump "$DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --format=custom \
  --file="$BACKUP_DIR/$BACKUP_FILE"

echo "Backup created: $BACKUP_DIR/$BACKUP_FILE"

# Compress backup
gzip "$BACKUP_DIR/$BACKUP_FILE"
echo "Backup compressed: $BACKUP_DIR/${BACKUP_FILE}.gz"

# Upload to cloud storage (if configured)
if [ -n "$BACKUP_STORAGE_URL" ]; then
    echo "Uploading backup to cloud storage..."
    curl -X PUT \
      -H "Content-Type: application/gzip" \
      --data-binary "@$BACKUP_DIR/${BACKUP_FILE}.gz" \
      "$BACKUP_STORAGE_URL/${BACKUP_FILE}.gz"
    echo "Backup uploaded successfully"
fi

# Clean up old backups (keep last 7 days)
find "$BACKUP_DIR" -name "billbot_backup_*.sql.gz" -mtime +7 -delete

echo "Backup process completed"
```

### Disaster Recovery Plan

```yaml
# disaster-recovery.yml
disaster_recovery:
  rto: 4 hours  # Recovery Time Objective
  rpo: 1 hour   # Recovery Point Objective
  
  procedures:
    database_failure:
      - Identify failure scope and impact
      - Switch to read-only mode if possible
      - Restore from latest backup
      - Verify data integrity
      - Resume normal operations
      
    service_failure:
      - Check Railway service status
      - Review application logs
      - Restart failed services
      - Scale up if necessary
      - Monitor for recovery
      
    complete_platform_failure:
      - Deploy to backup infrastructure
      - Restore database from backup
      - Update DNS records
      - Verify all services operational
      - Communicate with users
      
  backup_verification:
    frequency: daily
    process:
      - Restore backup to test environment
      - Run smoke tests
      - Verify data completeness
      - Document any issues
      
  monitoring:
    - Service availability monitoring
    - Database replication lag monitoring
    - Backup completion monitoring
    - External dependency monitoring
```

## Security Considerations

### Container Security

```dockerfile
# Security-hardened base image
FROM node:20-alpine

# Security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Secure file permissions
COPY --chown=nodejs:nodejs . .
USER nodejs

# Security labels
LABEL security.scan="enabled" \
      security.vulnerability-check="enabled"
```

### Network Security

```nginx
# nginx.conf security configuration
http {
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; connect-src 'self' https:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline';" always;
    
    # Hide server version
    server_tokens off;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=chat:10m rate=2r/s;
    
    server {
        listen 80;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
        
        # API endpoints with stricter limits
        location /api/chat {
            limit_req zone=chat burst=5 nodelay;
            proxy_pass http://backend;
        }
        
        # Security headers for all responses
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

This deployment architecture provides a comprehensive, production-ready foundation for Bill Bot with robust security, monitoring, and recovery capabilities suitable for Railway platform deployment.