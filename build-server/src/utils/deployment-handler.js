import path from "path";
import fs from "fs";
import { runCommand } from "./utils.js";
import { FrameworkHandler } from "./framework-handler.js";

// ECS Deployment Handler for dynamic applications
export class ECSDeploymentHandler {
  constructor(awsServices, projectId, publishLog) {
    this.awsServices = awsServices;
    this.projectId = projectId;
    this.publishLog = publishLog;
  }

  async deploy(projectPath, framework, database, environment) {
    await this.publishLog("🚀 Starting ECS deployment for dynamic application...");
    
    // Handle framework-specific setup
    const frameworkHandler = new FrameworkHandler(projectPath, framework, database, this.publishLog);
    const frameworkConfig = await frameworkHandler.handle();
    
    // Create ECS cluster
    await this.publishLog("🏗️ Creating ECS cluster...");
    const clusterName = `${this.projectId}-cluster`;
    await this.awsServices.createECSCluster({
      clusterName,
      publishLog: this.publishLog
    });
    
    // Create ECR repository
    await this.publishLog("📦 Creating ECR repository...");
    const ecrRepoName = `${this.projectId}-repo`;
    await this.awsServices.createECRRepository({
      repositoryName: ecrRepoName,
      publishLog: this.publishLog
    });
    
    // Build and push Docker image
    await this.publishLog("🐳 Building and pushing Docker image...");
    const imageUri = await this.buildAndPushImage(projectPath, framework, ecrRepoName);
    
    // Create CloudWatch log group
    await this.publishLog("📊 Creating CloudWatch log group...");
    await this.awsServices.createECSLogGroup({
      projectId: this.projectId,
      taskDefinitionName: `${this.projectId}-task`,
      publishLog: this.publishLog,
    });
    
    // Create ECS task definition
    await this.publishLog("⚡ Creating ECS task definition...");
    const taskDefinitionArn = await this.awsServices.createECSTaskDefinition({
      projectId: this.projectId,
      imageUri,
      port: frameworkConfig.port,
      environment,
      publishLog: this.publishLog,
    });
    
    // Create load balancer
    await this.publishLog("🌐 Creating load balancer...");
    const lbConfig = await this.awsServices.createCompleteLoadBalancerSetup({
      projectId: this.projectId,
      port: frameworkConfig.port,
      publishLog: this.publishLog,
    });
    
    // Create ECS service
    await this.publishLog("⚡ Creating ECS service...");
    await this.awsServices.createECSService({
      projectId: this.projectId,
      clusterName,
      taskDefinitionArn,
      targetGroupArn: lbConfig.targetGroupArn,
      port: frameworkConfig.port,
      publishLog: this.publishLog
    });
    
    return {
      type: "ecs",
      url: `http://${lbConfig.dnsName}`,
      clusterName,
      serviceName: `${this.projectId}-service`,
      loadBalancerArn: lbConfig.loadBalancerArn,
    };
  }
  
  async buildAndPushImage(projectPath, framework, ecrRepoName) {
    // Generate Dockerfile based on framework
    const dockerfile = this.generateDockerfile(framework);
    const dockerfilePath = path.join(projectPath, "Dockerfile");
    
    fs.writeFileSync(dockerfilePath, dockerfile);
    await this.publishLog("📝 Generated Dockerfile for deployment");
    
    // Build Docker image
    const imageTag = `${ecrRepoName}:latest`;
    await runCommand({
      command: `docker build -t ${imageTag} .`,
      cwd: projectPath,
      publishLog: this.publishLog,
    });
    
    // Get ECR login token
    await this.publishLog("🔐 Logging into ECR...");
    const loginCommand = await this.awsServices.getECRLoginCommand();
    await runCommand({
      command: loginCommand,
      publishLog: this.publishLog,
    });
    
    // Tag image for ECR
    const ecrUri = `${process.env.AWS_ACCOUNT_ID}.dkr.ecr.${process.env.AWS_REGION}.amazonaws.com/${ecrRepoName}:latest`;
    await runCommand({
      command: `docker tag ${imageTag} ${ecrUri}`,
      publishLog: this.publishLog,
    });
    
    // Push to ECR
    await this.publishLog("📤 Pushing image to ECR...");
    await runCommand({
      command: `docker push ${ecrUri}`,
      publishLog: this.publishLog,
    });
    
    return ecrUri;
  }
  
  generateDockerfile(framework) {
    switch (framework) {
      case "laravel":
        return this.generateLaravelDockerfile();
      case "nextjs":
      case "nextjs-prisma":
        return this.generateNextJSDockerfile();
      case "nodejs":
      case "nodejs-prisma":
        return this.generateNodeJSDockerfile();
      case "vite":
        return this.generateViteDockerfile();
      default:
        return this.generateNodeJSDockerfile();
    }
  }
  
  generateLaravelDockerfile() {
    return `# Laravel Fullstack Dockerfile
FROM php:8.2-fpm-alpine

# Install system dependencies
RUN apk add --no-cache \\
    nginx \\
    supervisor \\
    mysql-client \\
    git \\
    curl \\
    libpng-dev \\
    libxml2-dev \\
    zip \\
    unzip \\
    && docker-php-ext-install pdo pdo_mysql gd xml

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /var/www/html

# Copy application files
COPY . .

# Install Composer dependencies
RUN composer install --no-dev --optimize-autoloader

# Set permissions
RUN chown -R www-data:www-data /var/www/html \\
    && chmod -R 755 /var/www/html/storage

# Copy configuration files
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose port
EXPOSE 80

# Start supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]`;
  }
  
  generateNextJSDockerfile() {
    return `# Next.js Fullstack Dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client if needed
RUN npx prisma generate

# Build the application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]`;
  }
  
  generateNodeJSDockerfile() {
    return `# Node.js REST API Dockerfile
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Generate Prisma client if needed
COPY prisma ./prisma
RUN npx prisma generate

# Bundle app source
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /usr/src/app
USER nodejs

EXPOSE 3000

CMD ["npm", "start"]`;
  }
  
  generateViteDockerfile() {
    return `# Vite Frontend Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]`;
  }
}

// S3 + CloudFront Deployment Handler for static sites
export class S3DeploymentHandler {
  constructor(awsServices, projectId, publishLog) {
    this.awsServices = awsServices;
    this.projectId = projectId;
    this.publishLog = publishLog;
  }

  async deploy(projectPath, framework, environment) {
    await this.publishLog("🚀 Starting S3 + CloudFront deployment for static site...");
    
    // Handle framework-specific setup
    const frameworkHandler = new FrameworkHandler(projectPath, framework, null, this.publishLog);
    const frameworkConfig = await frameworkHandler.handle();
    
    // Create S3 bucket
    await this.publishLog("📦 Creating S3 bucket...");
    const bucketName = `${this.projectId}-static-hosting`;
    await this.awsServices.createS3Bucket({
      bucketName,
      publishLog: this.publishLog,
    });
    
    // Configure bucket for static website hosting
    await this.publishLog("🌐 Configuring S3 for static website hosting...");
    await this.awsServices.configureS3StaticHosting({
      bucketName,
      publishLog: this.publishLog,
    });
    
    // Upload static files to S3
    await this.publishLog("📤 Uploading static files to S3...");
    await this.awsServices.uploadDirectoryToS3({
      bucketName,
      sourcePath: frameworkConfig.buildOutput,
      publishLog: this.publishLog,
    });
    
    // Create CloudFront distribution
    await this.publishLog("🌍 Creating CloudFront CDN distribution...");
    const cloudfrontConfig = await this.awsServices.createCloudFrontDistribution({
      bucketName,
      projectId: this.projectId,
      publishLog: this.publishLog,
    });
    
    return {
      type: "s3",
      url: cloudfrontConfig.domainName,
      s3Url: `http://${bucketName}.s3-website-${process.env.AWS_REGION}.amazonaws.com`,
      bucketName,
      distributionId: cloudfrontConfig.distributionId,
    };
  }
}

// Main Deployment Handler
export class DeploymentHandler {
  constructor(awsServices, projectId, publishLog) {
    this.awsServices = awsServices;
    this.projectId = projectId;
    this.publishLog = publishLog;
    this.ecsHandler = new ECSDeploymentHandler(awsServices, projectId, publishLog);
    this.s3Handler = new S3DeploymentHandler(awsServices, projectId, publishLog);
  }

  async deploy(projectPath, framework, database, environment) {
    await this.publishLog(`🎯 Starting deployment for framework: ${framework}`);
    
    // Determine deployment type
    const isStatic = this.isStaticFramework(framework);
    
    if (isStatic) {
      return await this.s3Handler.deploy(projectPath, framework, environment);
    } else {
      return await this.ecsHandler.deploy(projectPath, framework, database, environment);
    }
  }
  
  isStaticFramework(framework) {
    const staticFrameworks = ["vite", "static", "html", "css", "js"];
    return staticFrameworks.includes(framework);
  }
} 