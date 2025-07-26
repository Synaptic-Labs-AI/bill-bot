# Railway Deployment Guide

## Executive Summary

Railway provides seamless deployment for full-stack applications with built-in support for monorepos, Docker, environment variables, and GitHub integration. For Bill Bot, Railway enables easy deployment of both frontend and backend services from a single repository, with automatic deployments, database hosting, and domain management.

## Technology Overview

Railway offers:
- **Monorepo Support**: Deploy multiple services from a single repository
- **Docker Deployment**: Custom Dockerfile support with automatic builds
- **GitHub Integration**: Automatic deployments on code changes
- **Environment Variables**: Secure configuration management
- **Database Hosting**: PostgreSQL with vector extensions
- **Domain Management**: Custom domains and SSL certificates
- **Service Discovery**: Internal networking between services

## Project Structure for Monorepo

### Recommended Directory Structure

```
bill-bot/
├── frontend/                 # React + Vite frontend
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── backend/                  # Node.js backend
│   ├── src/
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── docs/                     # Documentation
├── package.json              # Root package.json
├── docker-compose.yml       # Local development
└── README.md
```

### Root Package.json Configuration

```json
{
  "name": "bill-bot",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "frontend",
    "backend",
    "shared"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:frontend": "cd frontend && npm run dev",
    "dev:backend": "cd backend && npm run dev",
    "build": "npm run build:shared && npm run build:backend && npm run build:frontend",
    "build:shared": "cd shared && npm run build",
    "build:backend": "cd backend && npm run build",
    "build:frontend": "cd frontend && npm run build",
    "start:backend": "cd backend && npm start",
    "start:frontend": "cd frontend && npm start",
    "deploy": "railway up"
  },
  "devDependencies": {
    "concurrently": "^8.2.0",
    "turbo": "^1.10.0"
  }
}
```

## Docker Configuration

### Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
RUN npm ci --only=production

# Build the app
FROM base AS builder
WORKDIR /app

# Copy source code
COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Build shared package first
WORKDIR /app/shared
RUN npm run build

# Build backend
WORKDIR /app/backend
RUN npm run build

# Production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Add non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/backend/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/backend/package*.json ./
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

USER nodejs

EXPOSE 3001

ENV PORT=3001

CMD ["node", "dist/index.js"]
```

### Frontend Dockerfile

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app

COPY package*.json ./
COPY shared/package*.json ./shared/
RUN npm ci

# Build the app
FROM base AS builder
WORKDIR /app

COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Build shared package
WORKDIR /app/shared
RUN npm run build

# Build frontend
WORKDIR /app/frontend
RUN npm run build

# Production image with nginx
FROM nginx:alpine AS runner

# Copy built assets
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY frontend/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Nginx Configuration for Frontend

```nginx
# frontend/nginx.conf
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    sendfile        on;
    keepalive_timeout  65;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json;

    server {
        listen       80;
        server_name  localhost;
        root   /usr/share/nginx/html;
        index  index.html index.htm;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # Handle client-side routing
        location / {
            try_files $uri $uri/ /index.html;
        }

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # Security: deny access to sensitive files
        location ~ /\. {
            deny all;
        }
    }
}
```

## Railway Configuration

### railway.json Configuration

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "numReplicas": 1,
    "sleepApplication": false,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Environment Variables Configuration

```bash
# Backend Environment Variables
NODE_ENV=production
PORT=3001

# Database
DATABASE_URL=postgresql://username:password@host:port/database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# API Keys
OPENROUTER_API_KEY=your-openrouter-key
COHERE_API_KEY=your-cohere-key

# CORS
FRONTEND_URL=https://your-frontend-domain.railway.app

# Security
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-encryption-key

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

```bash
# Frontend Environment Variables
VITE_API_BASE_URL=https://your-backend-domain.railway.app
VITE_APP_NAME=Bill Bot
VITE_APP_VERSION=1.0.0
```

## Service Setup on Railway

### 1. Backend Service Configuration

```yaml
# Service: bill-bot-backend
name: bill-bot-backend
source:
  repo: your-username/bill-bot
  rootDirectory: /backend
build:
  builder: DOCKERFILE
  dockerfilePath: Dockerfile
deploy:
  healthcheckPath: /health
  healthcheckTimeout: 300
  numReplicas: 1
variables:
  NODE_ENV: production
  PORT: 3001
```

### 2. Frontend Service Configuration

```yaml
# Service: bill-bot-frontend  
name: bill-bot-frontend
source:
  repo: your-username/bill-bot
  rootDirectory: /frontend
build:
  builder: DOCKERFILE
  dockerfilePath: Dockerfile
deploy:
  numReplicas: 1
variables:
  VITE_API_BASE_URL: ${{bill-bot-backend.RAILWAY_PUBLIC_DOMAIN}}
```

### 3. Database Service

```yaml
# Service: PostgreSQL Database
name: bill-bot-database
source:
  image: postgres:15
variables:
  POSTGRES_DB: billbot
  POSTGRES_USER: billbot
  POSTGRES_PASSWORD: ${{POSTGRES_PASSWORD}}
  PGDATA: /var/lib/postgresql/data/pgdata
volumes:
  - /var/lib/postgresql/data
```

## GitHub Integration Setup

### 1. Repository Connection

```typescript
// Railway CLI commands for GitHub integration
const railwayCommands = {
  // Login to Railway
  login: 'railway login',
  
  // Link repository
  link: 'railway link your-username/bill-bot',
  
  // Set up environment
  addVariables: 'railway variables set KEY=value',
  
  // Deploy
  deploy: 'railway up',
  
  // Monitor logs
  logs: 'railway logs',
};
```

### 2. GitHub Actions Workflow (Optional)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Railway

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Build project
      run: npm run build
    
    - name: Deploy to Railway
      if: github.ref == 'refs/heads/main'
      uses: railway/gh-action@v1
      with:
        railway_token: ${{ secrets.RAILWAY_TOKEN }}
        command: 'up'
```

## Database Migration and Setup

### 1. Database Initialization Script

```sql
-- migrations/001_initial_setup.sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Bills table
CREATE TABLE bills (
  id BIGSERIAL PRIMARY KEY,
  bill_number VARCHAR(50) NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  full_text TEXT,
  sponsor VARCHAR(255),
  introduced_date DATE,
  status VARCHAR(100),
  chamber VARCHAR(20),
  committee VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Vector embeddings
  title_embedding VECTOR(384),
  summary_embedding VECTOR(384),
  content_embedding VECTOR(1536),
  
  -- Full-text search
  search_vector TSVECTOR
);

-- Indexes
CREATE INDEX bills_title_embedding_idx ON bills 
USING ivfflat (title_embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX bills_summary_embedding_idx ON bills 
USING ivfflat (summary_embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX bills_search_vector_idx ON bills USING GIN(search_vector);
CREATE INDEX bills_status_idx ON bills (status);
CREATE INDEX bills_chamber_idx ON bills (chamber);
CREATE INDEX bills_date_idx ON bills (introduced_date);
```

### 2. Migration Runner

```typescript
// backend/src/scripts/migrate.ts
import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';

class DatabaseMigrator {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  async runMigrations() {
    try {
      // Create migrations table if it doesn't exist
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      const migrationsDir = path.join(__dirname, '../../../migrations');
      const migrationFiles = await fs.readdir(migrationsDir);
      const sqlFiles = migrationFiles
        .filter(file => file.endsWith('.sql'))
        .sort();

      for (const file of sqlFiles) {
        const migrationName = path.basename(file, '.sql');
        
        // Check if migration already executed
        const result = await this.pool.query(
          'SELECT id FROM migrations WHERE name = $1',
          [migrationName]
        );

        if (result.rows.length === 0) {
          console.log(`Running migration: ${migrationName}`);
          
          const sqlContent = await fs.readFile(
            path.join(migrationsDir, file),
            'utf-8'
          );

          await this.pool.query('BEGIN');
          try {
            await this.pool.query(sqlContent);
            await this.pool.query(
              'INSERT INTO migrations (name) VALUES ($1)',
              [migrationName]
            );
            await this.pool.query('COMMIT');
            
            console.log(`✓ Migration ${migrationName} completed`);
          } catch (error) {
            await this.pool.query('ROLLBACK');
            throw error;
          }
        } else {
          console.log(`⚠ Migration ${migrationName} already executed`);
        }
      }

      console.log('All migrations completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    } finally {
      await this.pool.end();
    }
  }
}

// Run migrations if called directly
if (require.main === module) {
  const migrator = new DatabaseMigrator();
  migrator.runMigrations();
}
```

## Health Checks and Monitoring

### Backend Health Check Endpoint

```typescript
// backend/src/routes/health.ts
import { Router } from 'express';
import { Pool } from 'pg';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    database: 'connected' | 'disconnected';
    openrouter: 'available' | 'unavailable';
    cohere: 'available' | 'unavailable';
  };
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
}

router.get('/health', async (req, res) => {
  const startTime = Date.now();
  const healthStatus: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: 'disconnected',
      openrouter: 'unavailable',
      cohere: 'unavailable',
    },
    uptime: process.uptime(),
    memory: {
      used: process.memoryUsage().heapUsed,
      total: process.memoryUsage().heapTotal,
      percentage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100,
    },
  };

  try {
    // Check database connection
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('SELECT 1');
    await pool.end();
    healthStatus.services.database = 'connected';
  } catch (error) {
    healthStatus.status = 'unhealthy';
  }

  // Check external services
  try {
    const openrouterCheck = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (openrouterCheck.ok) {
      healthStatus.services.openrouter = 'available';
    }
  } catch (error) {
    // OpenRouter check failed - not critical for health status
  }

  try {
    const cohereCheck = await fetch('https://api.cohere.ai/v1/models', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${process.env.COHERE_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (cohereCheck.ok) {
      healthStatus.services.cohere = 'available';
    }
  } catch (error) {
    // Cohere check failed - not critical for health status
  }

  const responseTime = Date.now() - startTime;
  
  res.status(healthStatus.status === 'healthy' ? 200 : 503).json({
    ...healthStatus,
    responseTime,
  });
});

router.get('/ready', async (req, res) => {
  try {
    // Check if app is ready to serve traffic
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('SELECT 1');
    await pool.end();
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
```

## Performance Optimization

### 1. Build Optimization

```dockerfile
# Multi-stage Docker build optimization
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies with cache mount
FROM base AS deps
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production

# Build stage with cache
FROM base AS builder
COPY . .
COPY --from=deps /app/node_modules ./node_modules
RUN --mount=type=cache,target=/root/.npm \
    npm run build

# Production stage - minimal footprint
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

USER nodejs
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### 2. Railway Optimization Settings

```typescript
// Railway performance configuration
const railwayOptimization = {
  // Resource allocation
  resources: {
    memory: '2GB', // Adjust based on needs
    cpu: '1 vCPU',
    storage: '10GB SSD',
  },
  
  // Scaling configuration
  scaling: {
    minReplicas: 1,
    maxReplicas: 3,
    autoScaling: true,
    targetCPU: 70,
    targetMemory: 80,
  },
  
  // Networking
  networking: {
    region: 'us-west1', // Choose closest to users
    customDomain: 'billbot.yourcompany.com',
    ssl: true,
    cdn: true,
  },
  
  // Build optimization
  build: {
    dockerBuildCache: true,
    buildTimeoutMinutes: 10,
    parallelBuilds: true,
  },
};
```

## Monitoring and Logging

### Application Logging

```typescript
// backend/src/utils/logger.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'bill-bot-backend',
    version: process.env.npm_package_version,
    environment: process.env.NODE_ENV,
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
    })
  );
}

export default logger;
```

## Best Practices

### 1. Security Configuration

```typescript
// Security best practices for Railway deployment
const securityConfig = {
  // Environment variables
  secrets: {
    useRailwayVariables: true,
    neverCommitSecrets: true,
    rotateApiKeys: 'quarterly',
  },
  
  // CORS configuration
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP',
  },
  
  // Security headers
  helmet: {
    contentSecurityPolicy: true,
    hsts: true,
    noSniff: true,
    xssFilter: true,
  },
};
```

### 2. Deployment Checklist

```typescript
const deploymentChecklist = {
  preDeployment: [
    'Run tests locally',
    'Build and test Docker images',
    'Check environment variables',
    'Verify database migrations',
    'Test health endpoints',
  ],
  
  deployment: [
    'Deploy backend first',
    'Run database migrations',
    'Verify backend health',
    'Deploy frontend',
    'Test end-to-end functionality',
  ],
  
  postDeployment: [
    'Monitor application logs',
    'Check performance metrics',
    'Verify SSL certificates',
    'Test custom domain',
    'Update documentation',
  ],
};
```

## Common Pitfalls to Avoid

1. **Missing Environment Variables**: Always set all required environment variables
2. **Incorrect Root Directory**: Set proper root directory for monorepo services
3. **Database Connection Issues**: Configure SSL and connection pooling properly
4. **Build Timeouts**: Optimize Dockerfile for faster builds
5. **Resource Limits**: Monitor memory and CPU usage to avoid crashes
6. **CORS Errors**: Configure CORS properly for frontend-backend communication
7. **Health Check Failures**: Implement proper health check endpoints

## Resource Links

- [Railway Documentation](https://docs.railway.app/)
- [Railway Monorepo Guide](https://docs.railway.app/tutorials/deploying-a-monorepo)
- [Railway Environment Variables](https://docs.railway.app/deploy/env-vars)
- [Railway GitHub Integration](https://docs.railway.app/deploy/deploy-github)
- [Railway Database Guide](https://docs.railway.app/databases/postgresql)