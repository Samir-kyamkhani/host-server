import path from "path";
import fs from "fs";
import { runCommand } from "./utils.js";

export function generateDockerfile(props) {
  const { framework, port } = props;
  
  switch (framework) {
    case "laravel":
      return `FROM php:8.2-fpm
RUN apt-get update && apt-get install -y nginx mysql-client
COPY . /var/www/html
WORKDIR /var/www/html
RUN composer install --no-dev --optimize-autoloader
RUN chown -R www-data:www-data /var/www/html
EXPOSE 80
CMD ["php", "artisan", "migrate", "--force", "&&", "php", "-S", "0.0.0.0:80", "-t", "public"]`;
      
    case "nextjs":
      return `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE ${port}
CMD ["npm", "start"]`;
      
    case "nextjs-prisma":
      return `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
RUN npx prisma migrate deploy
RUN npm run build
EXPOSE ${port}
CMD ["npm", "start"]`;
      
    case "nodejs":
      return `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE ${port}
CMD ["npm", "start"]`;
      
    case "nodejs-prisma":
      return `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
RUN npx prisma migrate deploy
EXPOSE ${port}
CMD ["npm", "start"]`;
      
    default:
      return `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`;
  }
}

export async function buildDockerImage(props) {
  const { projectPath, imageTag, dockerfileContent, publishLog } = props;
  
  await publishLog(`🐳 Building Docker image: ${imageTag}`);
  
  // Ensure project directory exists
  if (!fs.existsSync(projectPath)) {
    await publishLog(`📁 Creating project directory: ${projectPath}`);
    fs.mkdirSync(projectPath, { recursive: true });
  }
  
  const dockerfilePath = path.join(projectPath, "Dockerfile");
  
  // Ensure parent directory exists before writing file
  const dockerfileDir = path.dirname(dockerfilePath);
  if (!fs.existsSync(dockerfileDir)) {
    await publishLog(`📁 Creating Dockerfile directory: ${dockerfileDir}`);
    fs.mkdirSync(dockerfileDir, { recursive: true });
  }
  
  await publishLog(`📝 Writing Dockerfile to: ${dockerfilePath}`);
  
  try {
    fs.writeFileSync(dockerfilePath, dockerfileContent);
    await publishLog(`✅ Dockerfile written successfully`);
  } catch (error) {
    await publishLog(`❌ Error writing Dockerfile: ${error.message}`);
    await publishLog(`📁 Current directory: ${process.cwd()}`);
    await publishLog(`📁 Project path: ${projectPath}`);
    await publishLog(`📁 Dockerfile path: ${dockerfilePath}`);
    
    // Try to create directory again with more verbose logging
    try {
      await publishLog(`🔄 Retrying directory creation...`);
      fs.mkdirSync(projectPath, { recursive: true, mode: 0o755 });
      await publishLog(`✅ Directory created successfully`);
      
      // Try writing file again
      fs.writeFileSync(dockerfilePath, dockerfileContent);
      await publishLog(`✅ Dockerfile written successfully on retry`);
    } catch (retryError) {
      await publishLog(`❌ Retry failed: ${retryError.message}`);
      throw retryError;
    }
  }
  
  await runCommand({
    command: `docker build -t ${imageTag} .`,
    cwd: projectPath,
    publishLog,
  });
  
  await publishLog(`✅ Docker image built: ${imageTag}`);
  return imageTag;
}

export async function pushDockerImageToECR(props) {
  const { imageTag, ecrUri, projectPath, publishLog } = props;
  
  await publishLog(`📦 Pushing Docker image to ECR: ${ecrUri}`);
  
  await runCommand({
    command: `docker tag ${imageTag} ${ecrUri}`,
    cwd: projectPath,
    publishLog,
  });
  
  await runCommand({
    command: `docker push ${ecrUri}`,
    cwd: projectPath,
    publishLog,
  });
  
  await publishLog(`✅ Docker image pushed to ECR: ${ecrUri}`);
  return ecrUri;
}

export async function buildAndPushDockerImage(props) {
  const { 
    projectPath, 
    framework, 
    port, 
    ecrRepositoryName, 
    region, 
    publishLog 
  } = props;
  
  const dockerfileContent = generateDockerfile({ framework, port });
  
  const imageTag = `${ecrRepositoryName}:latest`;
  await buildDockerImage({
    projectPath,
    imageTag,
    dockerfileContent,
    publishLog,
  });
  
  const accountId = process.env.AWS_ACCOUNT_ID || "123456789012";
  const ecrUri = `${accountId}.dkr.ecr.${region}.amazonaws.com/${ecrRepositoryName}:latest`;
  
  await pushDockerImageToECR({
    imageTag,
    ecrUri,
    projectPath,
    publishLog,
  });
  
  return ecrUri;
} 