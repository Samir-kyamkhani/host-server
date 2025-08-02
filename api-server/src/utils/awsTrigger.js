import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";

// Trigger AWS builder server via ECS
const triggerAWSBuilder = async (config) => {
  try {
    const { projectId, deploymentId, subdomain, deploymentConfig } = config;

    // Method 1: Direct ECS Task Execution
    if (process.env.AWS_ECS_CLUSTER_ARN) {
      return await triggerViaECSTask({
        projectId,
        deploymentId,
        subdomain,
        deploymentConfig,
      });
    }

    throw new Error("No AWS trigger method configured");
  } catch (error) {
    console.error("AWS trigger error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

// Trigger via ECS Task
const triggerViaECSTask = async (config) => {
  const { AWS_ECS_CLUSTER_ARN, AWS_ECS_TASK_DEFINITION_ARN } = process.env;

  const ecsClient = new ECSClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const taskParams = {
    cluster: AWS_ECS_CLUSTER_ARN,
    taskDefinition: AWS_ECS_TASK_DEFINITION_ARN,
    launchType: "FARGATE",
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: process.env.AWS_SUBNET_IDS.split(","),
        securityGroups: process.env.AWS_SECURITY_GROUP_IDS.split(","),
        assignPublicIp: "ENABLED",
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: "build-server",
          environment: [
            {
              name: "PROJECT_ID",
              value: config.projectId,
            },
            {
              name: "DEPLOYMENT_ID",
              value: config.deploymentId,
            },
            {
              name: "SUBDOMAIN",
              value: config.subdomain,
            },
            {
              name: "PROJECT_CONFIG",
              value: JSON.stringify(config.deploymentConfig),
            },
          ],
        },
      ],
    },
  };

  const command = new RunTaskCommand(taskParams);
  const result = await ecsClient.send(command);

  return {
    success: true,
    taskArn: result.tasks[0].taskArn,
    message: "ECS task started successfully",
  };
};

// Verify webhook signature
const verifyWebhookSignature = (body, signature) => {
  const crypto = require("crypto");
  const expectedSignature = crypto
    .createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest("hex");

  return signature === expectedSignature;
};

export { triggerAWSBuilder, verifyWebhookSignature };
