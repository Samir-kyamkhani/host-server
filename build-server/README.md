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
│   └── script.js              # Main deployment script
├── main.sh                    # Main automation script
├── deploy.sh                  # Deployment script with API integration
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

- **Laravel** - PHP framework with MySQL
- **Next.js** - React framework
- **Next.js with Prisma** - Next.js with database ORM
- **Node.js** - Express.js applications
- **Node.js with Prisma** - Node.js with database ORM
- **Static Sites** - HTML/CSS/JS websites

## ☁️ **AWS Services Used**

- **ECR** - Container registry
- **ECS** - Container orchestration
- **RDS** - Database instances
- **ALB** - Application load balancer
- **S3** - File storage
- **CloudWatch** - Logging & monitoring
- **Secrets Manager** - Secure credential storage

## 🔑 **Environment Variables**

### Required
```env
AWS_REGION=us-east-1
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

## 🌐 **API Server Integration**

### Data Flow: DigitalOcean API Server → AWS Builder Server

The builder server can communicate with an API server running on DigitalOcean to:
- Send real-time deployment logs
- Update deployment status
- Report project status
- Send health checks

### Project Configuration Format

```json
{
  "name": "My Application",
  "gitUrl": "https://github.com/user/repo.git",
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
    }
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

## 🚀 **Deployment Methods**

### 1. Direct Environment Variables
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

### 3. AWS ECS Task
```json
{
  "family": "builder-server",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "builder-server",
      "image": "your-ecr-repo/builder-server:latest",
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
4. **AWS Resource Creation** - Creates ECR, RDS, ECS, ALB resources
5. **Docker Build** - Builds and pushes Docker image
6. **Application Deployment** - Deploys to ECS with load balancer
7. **Status Update** - Reports deployment success/failure to API server

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