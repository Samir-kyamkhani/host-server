import pkg from "@aws-sdk/client-ecs";
import { awsConfig } from "./aws-config.js";

const {
  ECSClient,
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
  CreateServiceCommand,
  RunTaskCommand,
} = pkg;

// Create ECS client instance
const ecsClient = new ECSClient(awsConfig);

// Helper function to get start command based on image (no longer needed with custom Docker images)
function getStartCommand(imageUri) {
  // Custom Docker images have their own CMD, so we don't override
  return null;
}

export async function createECSCluster(props) {
  const { clusterName, publishLog } = props;

  await publishLog(`🏗️ Creating ECS cluster: ${clusterName}`);

  try {
    await ecsClient.send(
      new CreateClusterCommand({
        clusterName,
        capacityProviders: ["FARGATE"],
        defaultCapacityProviderStrategy: [
          {
            capacityProvider: "FARGATE",
            weight: 1,
          },
        ],
      })
    );

    await publishLog(`✅ ECS cluster created: ${clusterName}`);
    return clusterName;
  } catch (error) {
    if (error.name === "ClusterAlreadyExistsException") {
      await publishLog(`ℹ️ ECS cluster already exists: ${clusterName}`);
      return clusterName;
    }
    throw error;
  }
}

export async function createECSTaskDefinition(props) {
  const { projectId, imageUri, port, environment, region, publishLog, repositoryUrl } = props;

  const taskDefinitionName = `${projectId}-task`;

  await publishLog(`🏗️ Creating ECS task definition: ${taskDefinitionName}`);

  // Prepare secrets from AWS Secrets Manager (only if we're not using direct environment variables)
  const secrets = [];
  // Note: We're using direct environment variables, so no secrets needed

  // Check if we need to handle the special case where Docker build failed
  const isBaseImageWithAppCode = imageUri.includes('-with-app-code');
  const baseImage = isBaseImageWithAppCode ? imageUri.replace('-with-app-code', '') : imageUri;

  const containerDefinitions = [];

  // If we have the special case, use application code injection approach
  if (isBaseImageWithAppCode) {
    await publishLog(`🔧 Using base image with application code injection approach...`);
  }

  // Main application container
  containerDefinitions.push({
    name: `${projectId}-container`,
    image: baseImage,
    workingDirectory: "/app",
    portMappings: [
      {
        containerPort: port,
        protocol: "tcp",
      },
    ],
    command: [
      "sh", "-c",
      `apk add --no-cache git && mkdir -p /app && cd /app && git clone ${repositoryUrl} . && npm install && npm start`
    ],
    environment: Object.entries(environment).map(([key, value]) => ({
      name: key,
      value: value.toString(),
    })),
    // secrets: secrets, // Removed to avoid conflicts with direct environment variables
    logConfiguration: {
      logDriver: "awslogs",
      options: {
        "awslogs-group": `/ecs/${taskDefinitionName}`,
        "awslogs-region": region,
        "awslogs-stream-prefix": "ecs",
      },
    },
    essential: true,
    healthCheck: {
      command: ["CMD-SHELL", `node -e "require('http').get('http://localhost:${port}/', (res) => { process.exit([200,302,404].includes(res.statusCode) ? 0 : 1) }).on('error', () => process.exit(1))"`],
      interval: 30,
      timeout: 5,
      retries: 3,
      startPeriod: 60,
    },
  });

  const taskDefinition = {
    family: taskDefinitionName,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: "256",
    memory: "512",
    executionRoleArn: "ecsTaskExecutionRole",
    taskRoleArn: "ecsTaskExecutionRole",
    containerDefinitions,
  };

  const result = await ecsClient.send(
    new RegisterTaskDefinitionCommand(taskDefinition)
  );

  await publishLog(`✅ ECS task definition created: ${taskDefinitionName}`);

  return result.taskDefinition.taskDefinitionArn;
}

export async function createECSService(props) {
  const {
    projectId,
    clusterName,
    taskDefinitionArn,
    targetGroupArn,
    subnetIds,
    securityGroupIds,
    port,
    publishLog,
  } = props;

  const serviceName = `${projectId}-service`;

  await publishLog(`🚀 Creating ECS service: ${serviceName}`);

  try {
    await ecsClient.send(
      new CreateServiceCommand({
        cluster: clusterName,
        serviceName,
        taskDefinition: taskDefinitionArn,
        desiredCount: 1,
        launchType: "FARGATE",
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: subnetIds,
            securityGroups: securityGroupIds,
            assignPublicIp: "ENABLED",
          },
        },
        loadBalancers: [
          {
            targetGroupArn,
            containerName: `${projectId}-container`,
            containerPort: port,
          },
        ],
        healthCheckGracePeriodSeconds: 120,
      })
    );

    await publishLog(`✅ ECS service created: ${serviceName}`);
    
    // Wait a bit for the service to start and then check target health
    await publishLog(`⏳ Waiting for ECS service to start and register targets...`);
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
    
    return serviceName;
  } catch (error) {
    if (error.name === "ServiceAlreadyExistsException") {
      await publishLog(`ℹ️ ECS service already exists: ${serviceName}`);
      return serviceName;
    }
    throw error;
  }
}
