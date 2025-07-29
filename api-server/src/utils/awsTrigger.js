import axios from 'axios';
import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

// Trigger AWS builder server via ECS
const triggerAWSBuilder = async (config) => {
  try {
    const {
      projectId,
      deploymentId,
      subdomain,
      deploymentConfig
    } = config;

    // Method 1: Direct ECS Task Execution
    if (process.env.AWS_ECS_CLUSTER_ARN) {
      return await triggerViaECSTask({
        projectId,
        deploymentId,
        subdomain,
        deploymentConfig
      });
    }

    // Method 2: API Gateway + Lambda
    if (process.env.AWS_API_GATEWAY_URL) {
      return await triggerViaAPIGateway({
        projectId,
        deploymentId,
        subdomain,
        deploymentConfig
      });
    }

    // Method 3: SQS Queue
    if (process.env.AWS_SQS_QUEUE_URL) {
      return await triggerViaSQS({
        projectId,
        deploymentId,
        subdomain,
        deploymentConfig
      });
    }

    throw new Error('No AWS trigger method configured');

  } catch (error) {
    console.error('AWS trigger error:', error);
    return {
      success: false,
      error: error.message
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
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  const taskParams = {
    cluster: AWS_ECS_CLUSTER_ARN,
    taskDefinition: AWS_ECS_TASK_DEFINITION_ARN,
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: process.env.AWS_SUBNET_IDS.split(','),
        securityGroups: process.env.AWS_SECURITY_GROUP_IDS.split(','),
        assignPublicIp: 'ENABLED'
      }
    },
    overrides: {
      containerOverrides: [
        {
          name: 'builder-server',
          environment: [
            {
              name: 'PROJECT_ID',
              value: config.projectId
            },
            {
              name: 'DEPLOYMENT_ID',
              value: config.deploymentId
            },
            {
              name: 'SUBDOMAIN',
              value: config.subdomain
            },
            {
              name: 'PROJECT_CONFIG',
              value: JSON.stringify(config.deploymentConfig)
            }
          ]
        }
      ]
    }
  };

  const command = new RunTaskCommand(taskParams);
  const result = await ecsClient.send(command);

  return {
    success: true,
    taskArn: result.tasks[0].taskArn,
    message: 'ECS task started successfully'
  };
};

// Trigger via API Gateway
const triggerViaAPIGateway = async (config) => {
  const response = await axios.post(
    `${process.env.AWS_API_GATEWAY_URL}/deploy`,
    {
      projectId: config.projectId,
      deploymentId: config.deploymentId,
      subdomain: config.subdomain,
      deploymentConfig: config.deploymentConfig
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.AWS_API_GATEWAY_KEY
      },
      timeout: 10000
    }
  );

  return {
    success: true,
    data: response.data,
    message: 'Deployment triggered via API Gateway'
  };
};

// Trigger via SQS Queue
const triggerViaSQS = async (config) => {
  const sqsClient = new SQSClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  const message = {
    MessageBody: JSON.stringify({
      projectId: config.projectId,
      deploymentId: config.deploymentId,
      subdomain: config.subdomain,
      deploymentConfig: config.deploymentConfig,
      timestamp: new Date().toISOString()
    }),
    QueueUrl: process.env.AWS_SQS_QUEUE_URL
  };

  const command = new SendMessageCommand(message);
  const result = await sqsClient.send(command);

  return {
    success: true,
    messageId: result.MessageId,
    message: 'Deployment queued successfully'
  };
};

// Verify webhook signature
const verifyWebhookSignature = (body, signature) => {
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');

  return signature === expectedSignature;
};

export { triggerAWSBuilder, verifyWebhookSignature }; 