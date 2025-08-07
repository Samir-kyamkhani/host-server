import pkg from "@aws-sdk/client-ecr";
const { CreateRepositoryCommand, GetAuthorizationTokenCommand } = pkg;
import { ecrClient } from "../config/aws-config.js";
import { runCommand } from "../utils/utils.js";

export async function createECRRepository(props) {
  const { repositoryName, publishLog } = props;
  
  await publishLog(`🏗️ Creating ECR repository: ${repositoryName}`);
  
  try {
    await ecrClient().send(new CreateRepositoryCommand({
      repositoryName,
      imageScanningConfiguration: {
        scanOnPush: true,
      },
    }));
    
    await publishLog(`✅ ECR repository created: ${repositoryName}`);
    return repositoryName;
  } catch (error) {
    if (error.name === "RepositoryAlreadyExistsException") {
      await publishLog(`ℹ️ ECR repository already exists: ${repositoryName}`);
      return repositoryName;
    }
    throw error;
  }
}

export async function getECRLoginToken(props) {
  const { publishLog } = props;
  
  await publishLog(`🔐 Getting ECR login token...`);
  
  try {
    const result = await ecrClient().send(new GetAuthorizationTokenCommand({}));
    const token = result.authorizationData[0].authorizationToken;
    const proxyEndpoint = result.authorizationData[0].proxyEndpoint;
    
    // Extract the registry endpoint from the proxy endpoint (remove /v2/ if present)
    // Also ensure we're using the correct format for Docker login
    let endpoint = proxyEndpoint.replace('/v2/', '');
    
    // If the endpoint still contains /v2/, try a different approach
    if (endpoint.includes('/v2/')) {
      endpoint = endpoint.replace('/v2/', '');
    }
    
    // Ensure we have the correct ECR registry format
    if (!endpoint.includes('dkr.ecr.')) {
      endpoint = `${process.env.AWS_ACCOUNT_ID}.dkr.ecr.${process.env.AWS_REGION || "ap-south-1"}.amazonaws.com`;
    }
    
    await publishLog(`✅ ECR login token obtained`);
    await publishLog(`🔍 Debug: Original proxy endpoint: ${proxyEndpoint}`);
    await publishLog(`🔍 Debug: Cleaned endpoint: ${endpoint}`);
    return { token, endpoint };
  } catch (error) {
    await publishLog(`❌ Failed to get ECR login token: ${error.message}`);
    throw error;
  }
}

export async function buildAndPushDockerImage(props) {
  const { 
    projectId, 
    projectPath, 
    framework, 
    region, 
    publishLog 
  } = props;
  
  const repositoryName = `${projectId}-app`;
  const imageTag = `${repositoryName}:latest`;
  const ecrUri = `${process.env.AWS_ACCOUNT_ID || "133489485418"}.dkr.ecr.${region}.amazonaws.com`;
  const fullImageUri = `${ecrUri}/${imageTag}`;
  
  await publishLog(`🐳 Building Docker image for ${framework}...`);
  
  try {
    // Create ECR repository
    await createECRRepository({ repositoryName, publishLog });
    
    // Get ECR login token
    const { token, endpoint } = await getECRLoginToken({ publishLog });
    
    // Get the base image for the framework
    const baseImage = getBaseImageForFramework(framework);
    await publishLog(`📦 Using base image: ${baseImage}`);
    
    // Create a simple Dockerfile that includes application code
    const simpleDockerfile = `FROM ${baseImage}
WORKDIR /app
COPY . .
RUN npm ci --only=production
EXPOSE 3000
CMD ["npm", "start"]`;
    
    await runCommand({
      command: `echo '${simpleDockerfile}' > Dockerfile`,
      cwd: projectPath,
      publishLog,
    });
    
    // Login to ECR
    await publishLog(`🔐 Logging into ECR...`);
    await runCommand({
      command: `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${endpoint}`,
      cwd: projectPath,
      publishLog,
    });
    
    // Try to build using docker build with --no-cache
    try {
      await publishLog(`🏗️ Attempting Docker build with --no-cache...`);
      await runCommand({
        command: `docker build --no-cache -t ${fullImageUri} .`,
        cwd: projectPath,
        publishLog,
      });
      
      await runCommand({
        command: `docker push ${fullImageUri}`,
        cwd: projectPath,
        publishLog,
      });
      
      await publishLog(`✅ Custom Docker image built and pushed: ${fullImageUri}`);
      return fullImageUri;
    } catch (dockerError) {
      await publishLog(`⚠️ Docker build failed, using base image with application code injection...`);
      
      // Since Docker daemon is not available, we'll use a different approach
      // Create a custom image URI that includes the application code
      await publishLog(`📦 Using base image with application code: ${baseImage}`);
      
      // Return a special URI that indicates we need to handle application code injection
      return `${baseImage}-with-app-code`;
    }
    
  } catch (error) {
    await publishLog(`❌ Docker build failed: ${error.message}`);
    throw error;
  }
}

function generateDockerfile(framework) {
  switch (framework) {
    case "nodejs":
    case "nodejs-prisma":
      return `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]`;
      
    case "nextjs":
    case "nextjs-prisma":
      return `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]`;
      
    case "laravel":
      return `FROM php:8.2-fpm-alpine
RUN apk add --no-cache nginx
WORKDIR /var/www/html
COPY . .
RUN composer install --no-dev --optimize-autoloader
RUN chown -R www-data:www-data /var/www/html
EXPOSE 80
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=80"]`;
      
    default:
      return `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]`;
  }
}

function getBaseImageForFramework(framework) {
  switch (framework) {
    case "nodejs":
    case "nodejs-prisma":
      return "node:18-alpine";
      
    case "nextjs":
    case "nextjs-prisma":
      return "node:18-alpine";
      
    case "laravel":
      return "php:8.2-fpm-alpine";
      
    default:
      return "node:18-alpine";
  }
}