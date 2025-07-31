import pkg from '@aws-sdk/client-ecs';
const { ECSClient, CreateClusterCommand, CreateTaskDefinitionCommand, CreateServiceCommand, RunTaskCommand } = pkg;
import { ecsClient } from "./aws-config.js";

export async function createECSCluster(props) {
  const { clusterName, publishLog } = props;
  
  await publishLog(`🏗️ Creating ECS cluster: ${clusterName}`);
  
  try {
    await ecsClient().send(new CreateClusterCommand({
      clusterName,
      capacityProviders: ["FARGATE"],
      defaultCapacityProviderStrategy: [
        {
          capacityProvider: "FARGATE",
          weight: 1,
        },
      ],
    }));
    
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
  const { 
    projectId, 
    imageUri, 
    port, 
    environment, 
    region, 
    publishLog 
  } = props;
  
  const taskDefinitionName = `${projectId}-task`;
  
  await publishLog(`🏗️ Creating ECS task definition: ${taskDefinitionName}`);
  
  // Prepare secrets from AWS Secrets Manager
  const secrets = [];
  if (Object.keys(environment).length > 0) {
    secrets.push({
      name: "ENVIRONMENT_VARS",
      valueFrom: `arn:aws:secretsmanager:${region}:${process.env.AWS_ACCOUNT_ID || "123456789012"}:secret:${projectId}-env-secret`,
    });
  }
  
  const taskDefinition = {
    family: taskDefinitionName,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: "256",
    memory: "512",
    executionRoleArn: "ecsTaskExecutionRole",
    taskRoleArn: "ecsTaskExecutionRole",
    containerDefinitions: [
      {
        name: `${projectId}-container`,
        image: imageUri,
        portMappings: [
          {
            containerPort: port,
            protocol: "tcp",
          },
        ],
        environment: Object.entries(environment).map(([key, value]) => ({
          name: key,
          value: value.toString(),
        })),
        secrets: secrets,
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
          command: ["CMD-SHELL", "curl -f http://localhost:3000/ || exit 1"],
          interval: 30,
          timeout: 5,
          retries: 3,
          startPeriod: 60,
        },
      },
    ],
  };
  
  const result = await ecsClient().send(new CreateTaskDefinitionCommand(taskDefinition));
  
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
    publishLog 
  } = props;
  
  const serviceName = `${projectId}-service`;
  
  await publishLog(`🚀 Creating ECS service: ${serviceName}`);
  
  try {
    await ecsClient().send(new CreateServiceCommand({
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
      healthCheckGracePeriodSeconds: 60,
    }));
    
    await publishLog(`✅ ECS service created: ${serviceName}`);
    return serviceName;
  } catch (error) {
    if (error.name === "ServiceAlreadyExistsException") {
      await publishLog(`ℹ️ ECS service already exists: ${serviceName}`);
      return serviceName;
    }
    throw error;
  }
}

 