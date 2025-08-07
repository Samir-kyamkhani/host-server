# AWS Builder Server

A modular AWS deployment server for automated application deployment with support for multiple frameworks and API server integration.

## 🚀 **Project Structure**

```
build-server/
├── src/
│   ├── aws/                    # AWS service modules
│   │   ├── index.js           # AWS services index
│   │   ├── aws-config.js      # AWS configuration & clients
│   │   ├── aws-ecr.js         # ECR services
│   │   ├── aws-rds.js         # RDS services
│   │   ├── aws-ecs.js         # ECS services
│   │   ├── aws-loadbalancer.js # Load balancer services
│   │   ├── aws-s3.js          # S3 services
│   │   ├── aws-cloudwatch.js  # CloudWatch services
│   │   └── aws-secrets-manager.js # Secrets Manager
│   ├── utils/                  # Utility modules
│   │   ├── index.js           # Utils index
│   │   ├── utils.js           # Common utilities
│   │   ├── docker-builder.js  # Docker operations
│   │   └── api-communication.js # API server communication
│   └── main.js              # Main deployment main
├── main.sh                    # Main automation main
├── package.json               # Dependencies & scripts
├── Dockerfile                 # Container configuration
├── .dockerignore             # Docker ignore rules
└── README.md                 # This file
```

## 📦 **Installation**

```bash
npm install
```

## 🏃‍♂️ **Usage**

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Deployment with API Integration
```bash
npm run deploy
```

## 🔧 **Supported Frameworks**

### ✅ **Laravel Fullstack**
- **PHP 8.2 + FPM** with all required extensions
- **Composer** dependency management
- **MySQL/PostgreSQL** database support (required)
- **Laravel migrations** auto-run
- **Nginx** configuration with PHP-FPM
- **Production optimizations** (config cache, route cache, view cache)

### ✅ **Next.js Fullstack**
- **Multi-stage Docker build** for optimal image size
- **Prisma support** (optional) with auto-migrations
- **SSR support** with standalone output optimization
- **Production-ready** configuration
- **Environment variables** support

### ✅ **Node.js REST API**
- **Alpine Node.js** base for security and size
- **Prisma support** (optional) with database migrations
- **Non-root user** security
- **Production optimizations**
- **Express.js** and other Node.js frameworks

### ✅ **Vite Frontend**
- **Build + Serve pipeline** for static assets
- **Nginx static serving** for optimal performance
- **Environment variables** support
- **Optimized static assets** with proper caching
- **S3 + CloudFront** deployment

### ✅ **Static Sites**
- **S3 + CloudFront** deployment
- **No server required** - pure static hosting
- **Global CDN distribution** for fast loading
- **Cost-effective hosting** solution
- **HTML, CSS, JS, PHP** file support

## ☁️ **AWS Services Used**

- **ECR** - Container registry
- **ECS** - Container orchestration
- **RDS** - Database instances
- **ALB** - Application load balancer
- **S3** - File storage and static website hosting
- **CloudFront** - CDN for static files
- **CloudWatch** - Logging & monitoring
- **Secrets Manager** - Secure credential storage

## 🔑 **Environment Variables**

### Required
```env
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
VPC_ID=vpc-12345678
SUBNET_IDS=subnet-123,subnet-456
SECURITY_GROUP_IDS=sg-123,sg-456
```

### Deployment Variables
```env
PROJECT_ID=project-123
DEPLOYMENT_ID=deployment-456
SUBDOMAIN=my-app
PROJECT_CONFIG={"name":"My App","framework":"nextjs",...}
```

### Optional
```env
API_BASE_URL=https://api.example.com
```

## 🌐 **External API Server Integration**

### Data Flow: External API Server → AWS Builder Server

The builder server can communicate with an external API server to:
- Send real-time deployment logs
- Update deployment status
- Report project status
- Send health checks

### Project Configuration Format

```json
{
  "name": "My Application",
  "gitUrl": "https://github.com/user/repo.git",
  "gitBranch": "main",
  "framework": "nextjs",
  "db": "postgres",
  "envVars": [
    {
      "key": "API_SERVER_URL",
      "value": "http://your-api-server.digitalocean.app"
    },
    {
      "key": "API_KEY",
      "value": "your-api-key"
    },
    {
      "key": "NODE_ENV",
      "value": "production"
    },
    {
      "key": "DATABASE_URL",
      "value": "postgresql://user:pass@host:5432/db"
    }
  ]
}
```

### Framework-Specific Examples

#### Next.js with Prisma
```json
{
  "name": "Next.js App with Database",
  "gitUrl": "https://github.com/user/nextjs-prisma-app.git",
  "framework": "nextjs",
  "db": "postgres",
  "envVars": [
    {"key": "NODE_ENV", "value": "production"},
    {"key": "NEXTAUTH_SECRET", "value": "your-secret-key"}
  ]
}
```

#### Laravel Application
```json
{
  "name": "Laravel App",
  "gitUrl": "https://github.com/user/laravel-app.git",
  "framework": "laravel",
  "db": "mysql",
  "envVars": [
    {"key": "APP_ENV", "value": "production"},
    {"key": "APP_DEBUG", "value": "false"},
    {"key": "APP_KEY", "value": "base64:your-app-key"}
  ]
}
```

#### Vite.js Frontend
```json
{
  "name": "Vite.js Frontend",
  "gitUrl": "https://github.com/user/vite-app.git",
  "framework": "vite",
  "db": null,
  "envVars": [
    {"key": "VITE_API_URL", "value": "https://api.example.com"},
    {"key": "VITE_APP_TITLE", "value": "My Vite App"}
  ]
}
```

#### Static Files (HTML/CSS/JS/PHP)
```json
{
  "name": "Static Website",
  "gitUrl": "https://github.com/user/static-website.git",
  "framework": "static",
  "db": null,
  "envVars": [
    {"key": "SITE_TITLE", "value": "My Static Site"},
    {"key": "GOOGLE_ANALYTICS_ID", "value": "GA-123456789"}
  ]
}
```

### API Communication Endpoints

The builder server communicates with the API server using these endpoints:

- **POST /api/logs** - Send deployment logs
- **POST /api/deployments/{id}/status** - Update deployment status
- **PUT /api/projects/{id}** - Update project status
- **POST /api/health** - Send health checks

### Deployment Status Updates

The builder server sends status updates throughout the deployment:

1. **started** - Deployment initiated
2. **provisioning** - AWS resources being created
3. **building** - Docker image being built
4. **deploying** - Application being deployed to ECS
5. **completed** - Deployment successful
6. **failed** - Deployment failed

## 🏗️ **Deployment Architecture**

### **Framework-Specific Deployment Strategy**

The build server automatically determines the best deployment method based on the framework:

#### **Dynamic Applications (ECS Deployment)**
- **Laravel Fullstack** - PHP-FPM + Nginx container
- **Next.js Fullstack** - Node.js with SSR support
- **Node.js REST API** - Express.js with optional Prisma

#### **Static Applications (S3 + CloudFront)**
- **Vite Frontend** - Built static assets
- **Static Sites** - HTML, CSS, JS, PHP files

### **Auto-Detection Features**
- **Framework Detection** - Automatically detects framework from project files
- **Database Detection** - Identifies Prisma usage and database requirements
- **Build Optimization** - Framework-specific build commands and optimizations

### **Production Optimizations**
- **Laravel** - Config cache, route cache, view cache
- **Next.js** - Standalone output, optimized builds
- **Node.js** - Non-root user, Alpine base image
- **Vite** - Optimized static assets with proper caching
- **Static** - Global CDN distribution

## 🚀 **Build Server Deployment**

### Deploy Build Server to ECR + ECS

```bash
# 1. Set AWS credentials
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION=""

# 2. Deploy build server
./deploy-build-server.sh
```

## 🔗 **API Server Integration**

### How External API Server Calls Build Server

The build server is designed to work with an **external API server** that manages deployments. Here's how the integration works:

### **🏗️ Architecture Overview**

```
┌─────────────────┐    HTTP/ECS Request    ┌─────────────────┐
│   API Server    │ ─────────────────────► │  Build Server   │
│  (External)     │                        │  (AWS ECS)      │
│                 │ ◄───────────────────── │                 │
└─────────────────┘   Status Updates       └─────────────────┘
                                                      │
                                                      ▼
                                              ┌─────────────────┐
                                              │  Project        │
                                              │  Resources      │
                                              │  (ECR, ECS,     │
                                              │   RDS, ALB)     │
                                              └─────────────────┘
```

### **📋 Resource Creation Flow**

1. **Build Server** runs in its own ECS cluster (`build-server-cluster`)
2. **Build Server** creates **project-specific resources**:
   - Project ECR repository (`project-123-repo`)
   - Project ECS cluster (`project-123-cluster`)
   - Project RDS database (`project-123-db`)
   - Project Load Balancer (`project-123-alb`)
   - Project ECS service (`project-123-service`)

3. **Project application** runs in **project's own cluster**, not build server cluster

#### **1. API Server Architecture**
```
┌─────────────────┐    HTTP Requests    ┌─────────────────┐
│   API Server    │ ──────────────────► │  Build Server   │
│  (External)     │                     │  (AWS ECS)      │
│                 │ ◄────────────────── │                 │
└─────────────────┘   Status Updates    └─────────────────┘
```

#### **2. API Server Calls Build Server**

**Method 1: Direct HTTP Request**
```bash
# API Server sends deployment request to Build Server
curl -X POST "https://your-build-server-url/deploy" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "projectId": "project-123",
    "deploymentId": "deployment-456",
    "gitUrl": "https://github.com/user/repo.git",
    "gitBranch": "main",
    "framework": "nextjs",
    "database": "postgresql",
    "environment": {
      "NODE_ENV": "production",
      "DATABASE_URL": "postgresql://..."
    }
  }'
```

**Method 2: ECS Task Execution**
```bash
# API Server triggers ECS task directly
aws ecs run-task \
  --cluster build-server-cluster \
  --task-definition build-server \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-123],securityGroups=[sg-456],assignPublicIp=ENABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "build-server",
      "environment": [
        {"name": "PROJECT_ID", "value": "project-123"},
        {"name": "DEPLOYMENT_ID", "value": "deployment-456"},
        {"name": "GIT_URL", "value": "https://github.com/user/repo.git"},
        {"name": "FRAMEWORK", "value": "nextjs"},
        {"name": "DATABASE", "value": "postgresql"}
      ]
    }]
  }'
```

#### **3. Build Server Communication Back to API Server**

The build server sends **real-time updates** back to the API server:

```javascript
// Build Server sends status updates
await apiCommunication.sendLog({
  deploymentId: "deployment-456",
  message: "📦 Building Docker image...",
  level: "info"
});

await apiCommunication.updateStatus({
  deploymentId: "deployment-456",
  status: "building",
  progress: 50
});
```

#### **4. Complete Deployment Flow**

```
1. API Server receives deployment request
   ↓
2. API Server calls Build Server (HTTP/ECS)
   ↓
3. Build Server starts deployment
   ↓
4. Build Server sends logs to API Server
   ↓
5. Build Server updates status to API Server
   ↓
6. API Server shows real-time progress to user
   ↓
7. Build Server completes deployment
   ↓
8. API Server receives final status
```

## 🚀 **Application Deployment Methods**

### 1. Direct Environment Variables (Recommended)
```bash
export PROJECT_ID="project-123"
export DEPLOYMENT_ID="deployment-456"
export SUBDOMAIN="my-app"
export PROJECT_CONFIG='{"name":"My App","framework":"nextjs",...}'

./deploy.sh
```

### 2. Docker Container
```bash
docker run -e PROJECT_ID="project-123" \
           -e DEPLOYMENT_ID="deployment-456" \
           -e SUBDOMAIN="my-app" \
           -e PROJECT_CONFIG='{"name":"My App",...}' \
           your-builder-server-image
```

### 3. ECS Task Definition
```json
{
  "family": "builder-server",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "builder-server",
      "image": "your-ecr-repo/build-server:latest",
      "environment": [
        {"name": "PROJECT_ID", "value": "project-123"},
        {"name": "DEPLOYMENT_ID", "value": "deployment-456"},
        {"name": "SUBDOMAIN", "value": "my-app"},
        {"name": "PROJECT_CONFIG", "value": "{\"name\":\"My App\",...}"}
      ]
    }
  ]
}
```

## 🐳 **Docker Support**

The server automatically:
- Generates appropriate Dockerfiles
- Builds Docker images
- Pushes to ECR
- Deploys to ECS

## 🔒 **Security Features**

- AWS configuration validation
- Secrets management
- Secure credential handling
- Environment variable encryption
- API key authentication

## 📊 **Monitoring**

- CloudWatch log groups
- Application health checks
- Deployment status tracking
- Error logging and reporting
- Real-time API server communication

## 🚀 **Deployment Process**

1. **Configuration Validation** - Validates AWS credentials and settings
2. **API Server Connection** - Establishes communication with API server
3. **Project Setup** - Reads and processes project configuration
4. **Git Repository Clone** - Clones the specified git repository and branch
5. **Prisma Setup** - Generates Prisma client and handles database schema
6. **Environment Variables** - Stores environment variables in AWS Secrets Manager
7. **Database Setup** - Creates RDS instances for database frameworks
8. **AWS Resource Creation** - Creates ECR, ECS, ALB resources
9. **Docker Build** - Builds and pushes Docker image with framework-specific configurations
10. **Application Deployment** - Deploys to ECS with load balancer and secrets integration
11. **Status Update** - Reports deployment success/failure to API server

## 📥 **Git Repository Support**

The builder server automatically:
- Clones the specified git repository from `gitUrl`
- Checks out the specified branch (defaults to "main")
- Cleans existing output directory before cloning
- Supports both public and private repositories
- Provides detailed logging during clone process

## 📁 **Static Files Deployment**

### S3 + CloudFront Integration
- **Automatic S3 Bucket Creation** - Creates dedicated S3 bucket for static files
- **CloudFront CDN** - Global content delivery network for fast loading
- **File Type Support** - HTML, CSS, JS, PHP, images, fonts, and more
- **Automatic Content-Type Detection** - Proper MIME types for all file types
- **Static Website Hosting** - S3 static website hosting configuration
- **Custom Error Pages** - 404 error handling with custom error pages

### Supported Static File Types
- **HTML Files** - `.html`, `.htm`
- **CSS Files** - `.css`
- **JavaScript Files** - `.js`
- **PHP Files** - `.php` (processed by web server)
- **Images** - `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.ico`
- **Fonts** - `.woff`, `.woff2`, `.ttf`, `.eot`
- **Documents** - `.pdf`, `.txt`, `.xml`, `.json`

## 🗄️ **Database Support**

### Prisma ORM Integration
- **Automatic Schema Generation** - Generates Prisma client during deployment
- **Migration Support** - Handles database migrations for Next.js and Node.js with Prisma
- **Multi-Database Support** - MySQL and PostgreSQL support
- **Environment Integration** - Database credentials stored in AWS Secrets Manager

### Laravel Migrations
- **Built-in Migration System** - Uses Laravel's artisan migrate command
- **MySQL/PostgreSQL Support** - Configurable database backends
- **Production Optimized** - Optimized for production deployments

## 🔐 **Environment Variables & Secrets**

### AWS Secrets Manager Integration
- **Secure Storage** - All environment variables stored in AWS Secrets Manager
- **ECS Integration** - Environment variables automatically injected into containers
- **Database Credentials** - Database connection details securely managed
- **Framework-Specific** - Different handling for different frameworks

### Supported Variable Types
- **Database URLs** - Automatically generated for Prisma and Laravel
- **API Keys** - Securely stored and injected
- **Framework Config** - Framework-specific environment variables
- **Custom Variables** - User-defined environment variables

## 📝 **Logging**

All operations are logged to:
- Console output
- CloudWatch logs
- API server endpoints (if configured)

## 🔄 **Error Handling**

- Comprehensive error catching
- Graceful degradation
- Detailed error messages
- Automatic rollback on failure
- API server error reporting

## 📈 **Performance Optimizations**

- Lazy-loaded AWS clients
- Efficient resource management
- Optimized Docker builds
- Retry mechanisms
- Connection pooling for API communication

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 **License**

ISC License - see package.json for details. 