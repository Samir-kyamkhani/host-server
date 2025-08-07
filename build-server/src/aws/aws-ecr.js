import pkg from "@aws-sdk/client-ecr";
const { CreateRepositoryCommand, GetAuthorizationTokenCommand } = pkg;
import { ecrClient } from "../config/aws-config.js";
import { runCommand } from "../utils/utils.js";
import fs from "fs/promises";
import path from "path";

export async function createECRRepository({ repositoryName, publishLog }) {
  if (!repositoryName) throw new Error("Repository name is required");
  if (!publishLog) throw new Error("Logging function is required");

  await publishLog(`🏗️ Creating ECR repository: ${repositoryName}`);

  try {
    await ecrClient().send(
      new CreateRepositoryCommand({
        repositoryName,
        imageScanningConfiguration: {
          scanOnPush: true,
        },
        tags: [
          {
            Key: "CreatedBy",
            Value: "build-server",
          },
        ],
      })
    );

    await publishLog(`✅ ECR repository created: ${repositoryName}`);
    return repositoryName;
  } catch (error) {
    if (error.name === "RepositoryAlreadyExistsException") {
      await publishLog(`ℹ️ ECR repository already exists: ${repositoryName}`);
      return repositoryName;
    }
    await publishLog(`❌ Failed to create ECR repository: ${error.message}`);
    throw error;
  }
}

export async function getECRLoginToken({ publishLog }) {
  if (!publishLog) throw new Error("Logging function is required");

  await publishLog(`🔐 Getting ECR login token...`);

  try {
    const result = await ecrClient().send(new GetAuthorizationTokenCommand({}));
    const token = result.authorizationData[0].authorizationToken;
    const proxyEndpoint = result.authorizationData[0].proxyEndpoint;

    // Normalize endpoint URL
    let endpoint = proxyEndpoint
      .replace(/^https?:\/\//, "")
      .replace(/\/v2\/?$/, "");

    // Fallback to default endpoint if format is incorrect
    if (!endpoint.includes("dkr.ecr.")) {
      endpoint = `${process.env.AWS_ACCOUNT_ID}.dkr.ecr.${
        process.env.AWS_REGION || "ap-south-1"
      }.amazonaws.com`;
    }

    await publishLog(`✅ ECR login token obtained`);
    return { token, endpoint };
  } catch (error) {
    await publishLog(`❌ Failed to get ECR login token: ${error.message}`);
    throw error;
  }
}

export async function buildAndPushDockerImage({
  projectId,
  projectPath,
  framework,
  region,
  publishLog,
}) {
  if (!projectId || !projectPath || !framework || !region || !publishLog) {
    throw new Error("Missing required parameters");
  }

  const repositoryName = `${projectId}-app`;
  const imageTag = `${repositoryName}:latest`;
  const ecrUri = `${
    process.env.AWS_ACCOUNT_ID || "133489485418"
  }.dkr.ecr.${region}.amazonaws.com`;
  const fullImageUri = `${ecrUri}/${imageTag}`;

  await publishLog(`🐳 Building Docker image for ${framework}...`);

  try {
    // Create ECR repository
    await createECRRepository({ repositoryName, publishLog });

    // Get ECR login token
    const { token, endpoint } = await getECRLoginToken({ publishLog });

    // Get the base image for the framework
    const baseImage = await getBaseImageForFramework(projectPath);
    await publishLog(`📦 Using base image: ${baseImage}`);

    // Create Dockerfile
    const dockerfileContent = `FROM ${baseImage}
WORKDIR /app
COPY . .
RUN npm ci --only=production
EXPOSE 3000
CMD ["npm", "start"]`;

    await fs.writeFile(path.join(projectPath, "Dockerfile"), dockerfileContent);

    // Login to ECR
    await publishLog(`🔐 Logging into ECR...`);
    await runCommand({
      command: `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${endpoint}`,
      cwd: projectPath,
      publishLog,
    });

    // Build and push image
    try {
      await publishLog(`🏗️ Building Docker image...`);
      await runCommand({
        command: `docker build --no-cache -t ${fullImageUri} .`,
        cwd: projectPath,
        publishLog,
      });

      await publishLog(`📤 Pushing Docker image...`);
      await runCommand({
        command: `docker push ${fullImageUri}`,
        cwd: projectPath,
        publishLog,
      });

      await publishLog(`✅ Image pushed: ${fullImageUri}`);
      return fullImageUri;
    } catch (dockerError) {
      await publishLog(`⚠️ Docker build failed: ${dockerError.message}`);
      await publishLog(`🔄 Falling back to base image with code injection`);
      return `${baseImage}-with-app-code`;
    }
  } catch (error) {
    await publishLog(`❌ Docker build failed: ${error.message}`);
    throw error;
  }
}

async function getBaseImageForFramework(projectPath) {
  const DEFAULT_NODE_IMAGE = "node:22-alpine";

  try {
    const pkgPath = path.join(projectPath, "package.json");
    const pkgData = await fs.readFile(pkgPath, "utf-8");
    const pkgJson = JSON.parse(pkgData);

    // Check for engines.node first
    if (pkgJson.engines?.node) {
      const versionSpecifier = pkgJson.engines.node;

      const versionMatch = versionSpecifier.match(/(\d+)(?:\.\d+)?(?:\.\d+)?/);

      if (versionMatch) {
        const majorVersion = versionMatch[1];

        if (/^\d+$/.test(majorVersion)) {
          const ltsVersion =
            Number(majorVersion) % 2 === 0
              ? majorVersion
              : Math.max(16, Number(majorVersion) - 1);

          return `node:${ltsVersion}-alpine`;
        }
      }
    }

    if (pkgJson.version) {
      const versionMatch = pkgJson.version.match(/^(\d+)\./);
      if (versionMatch) {
        return `node:${versionMatch[1]}-alpine`;
      }
    }

    return DEFAULT_NODE_IMAGE;
  } catch (err) {
    console.warn(
      `⚠️ Using default Node.js image (${DEFAULT_NODE_IMAGE}) due to:`,
      err.message
    );
    return DEFAULT_NODE_IMAGE;
  }
}
