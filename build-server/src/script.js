import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { awsConfig, validateAWSConfig } from "./aws/aws-config.js";
import { createECRRepository } from "./aws/aws-ecr.js";
import { createRDSInstance, getDatabaseEnvironmentVariables } from "./aws/aws-rds.js";
import { 
  createECSCluster, 
  createECSTaskDefinition, 
  createECSService 
} from "./aws/aws-ecs.js";
import { createCompleteLoadBalancerSetup } from "./aws/aws-loadbalancer.js";
import { buildAndPushDockerImage } from "./utils/docker-builder.js";
import { createECSLogGroup } from "./aws/aws-cloudwatch.js";
import { createDatabaseSecret } from "./aws/aws-secrets-manager.js";

import { 
  publishLog, 
  readProjectConfig, 
  generateDeploymentConfig, 
  updateDeploymentStatus,
  runCommand
} from "./utils/utils.js";

import {
  createAPIServerCommunication,
  extractAPIServerConfig
} from "./utils/api-communication.js";

dotenv.config({ path: "../.env" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;
const PROJECT_ID = process.env.PROJECT_ID;
const SUBDOMAIN = process.env.SUBDOMAIN;
const API_BASE_URL = process.env.API_BASE_URL;

async function builderServer(projectConfig) {
  let apiCommunication = null;
  
  try {
    validateAWSConfig();
    
    const deploymentConfig = generateDeploymentConfig({
      deploymentId: DEPLOYMENT_ID,
      projectId: PROJECT_ID,
      subdomain: SUBDOMAIN,
    });

    const config = readProjectConfig(projectConfig);
    
    const { apiServerUrl, apiKey } = extractAPIServerConfig(config.envVars || []);
    
    apiCommunication = createAPIServerCommunication({
      apiServerUrl,
      apiKey,
      deploymentId: deploymentConfig.deploymentId,
      projectId: deploymentConfig.projectId
    });

    const logPublisher = async (message) => {
      await publishLog({
        message,
        deploymentId: deploymentConfig.deploymentId,
        projectId: deploymentConfig.projectId,
        apiBaseUrl: API_BASE_URL,
      });
      
      await apiCommunication.sendLog({ message });
    };

    await logPublisher("🚀 Builder Server Started");
    await logPublisher(`📋 Project: ${projectConfig.name}`);
    await logPublisher(`🆔 Deployment ID: ${deploymentConfig.deploymentId}`);
    await logPublisher(`🌐 Subdomain: ${deploymentConfig.subdomain}`);
    
    if (apiServerUrl) {
      await logPublisher(`🔗 API Server: ${apiServerUrl}`);
    }

    await apiCommunication.updateDeploymentStatus({
      status: 'started',
      framework: config.framework,
      database: config.database
    });

    const outDirPath = path.join(__dirname, "../output");

    await logPublisher("📖 Reading project configuration from API...");
    await logPublisher(`🧠 Detected framework: ${config.framework}`);
    await logPublisher(`🗄️ Database: ${config.database}`);

    if (config.buildCommand) {
      await logPublisher(`🔧 Running build command: ${config.buildCommand}`);
      await runCommand({
        command: config.buildCommand,
        cwd: outDirPath,
        publishLog: logPublisher,
      });
    }

    await logPublisher("☁️ Provisioning AWS services...");
    await apiCommunication.updateDeploymentStatus({ status: 'provisioning' });

    const ecrRepositoryName = `${deploymentConfig.projectId}-repo`;
    await createECRRepository({
      repositoryName: ecrRepositoryName,
      publishLog: logPublisher,
    });

    let dbConfig = null;
    if (["laravel", "nodejs-prisma", "nextjs-prisma"].includes(config.framework)) {
      dbConfig = await createRDSInstance({
        projectId: deploymentConfig.projectId,
        framework: config.framework,
        database: config.database,
        subnetIds: deploymentConfig.subnetIds,
        securityGroupIds: deploymentConfig.securityGroupIds,
        publishLog: logPublisher,
      });

      const dbEnvVars = getDatabaseEnvironmentVariables({
        dbConfig,
        framework: config.framework,
      });
      config.environment = { ...config.environment, ...dbEnvVars };

      await createDatabaseSecret({
        projectId: deploymentConfig.projectId,
        dbConfig,
        publishLog: logPublisher,
      });
    }

    const clusterName = `${deploymentConfig.projectId}-cluster`;
    await createECSCluster({
      clusterName,
      publishLog: logPublisher,
    });

    await createECSLogGroup({
      projectId: deploymentConfig.projectId,
      publishLog: logPublisher,
    });

    const lbConfig = await createCompleteLoadBalancerSetup({
      projectId: deploymentConfig.projectId,
      subnetIds: deploymentConfig.subnetIds,
      securityGroupIds: deploymentConfig.securityGroupIds,
      vpcId: deploymentConfig.vpcId,
      port: config.port,
      publishLog: logPublisher,
    });

    await logPublisher("🐳 Building and pushing Docker image...");
    await apiCommunication.updateDeploymentStatus({ status: 'building' });

    const imageUri = await buildAndPushDockerImage({
      projectPath: outDirPath,
      framework: config.framework,
      port: config.port,
      ecrRepositoryName,
      region: awsConfig.region,
      publishLog: logPublisher,
    });

    await logPublisher("🚀 Creating ECS task definition...");
    const taskDefinitionArn = await createECSTaskDefinition({
      projectId: deploymentConfig.projectId,
      imageUri,
      port: config.port,
      environment: config.environment,
      region: awsConfig.region,
      publishLog: logPublisher,
    });

    await logPublisher("⚡ Deploying to ECS...");
    await apiCommunication.updateDeploymentStatus({ status: 'deploying' });

    await createECSService({
      projectId: deploymentConfig.projectId,
      clusterName,
      taskDefinitionArn,
      targetGroupArn: lbConfig.targetGroupArn,
      subnetIds: deploymentConfig.subnetIds,
      securityGroupIds: deploymentConfig.securityGroupIds,
      port: config.port,
      publishLog: logPublisher,
    });

    const uniqueUrl = `http://${lbConfig.dnsName}`;

    await logPublisher("🎉 Deployment completed successfully!");
    await logPublisher(`🌐 Application URL: ${uniqueUrl}`);

    await apiCommunication.updateDeploymentStatus({
      status: 'completed',
      url: uniqueUrl,
      framework: config.framework,
      database: dbConfig ? config.database : null
    });

    await apiCommunication.updateProjectStatus({
      status: 'deployed',
      url: uniqueUrl
    });

    await apiCommunication.sendHealthCheck();

    return {
      success: true,
      url: uniqueUrl,
      projectId: deploymentConfig.projectId,
      deploymentId: deploymentConfig.deploymentId,
      framework: config.framework,
      database: dbConfig ? config.database : null,
    };

  } catch (error) {
    const deploymentConfig = generateDeploymentConfig({
      deploymentId: DEPLOYMENT_ID,
      projectId: PROJECT_ID,
    });

    const logPublisher = async (message) => {
      await publishLog({
        message,
        deploymentId: deploymentConfig.deploymentId,
        projectId: deploymentConfig.projectId,
        apiBaseUrl: API_BASE_URL,
      });
      
      if (apiCommunication) {
        await apiCommunication.sendLog({ message, level: 'error' });
      }
    };

    await logPublisher(`❌ Builder Server Error: ${error.message}`);
    console.error(error);

    if (apiCommunication) {
      await apiCommunication.updateDeploymentStatus({
        status: 'failed',
        error: error.message
      });

      await apiCommunication.updateProjectStatus({
        status: 'failed',
        error: error.message
      });
    }

    return {
      success: false,
      error: error.message,
      projectId: deploymentConfig.projectId,
      deploymentId: deploymentConfig.deploymentId,
    };
  }
}

export { builderServer };

if (import.meta.url === `file://${process.argv[1]}`) {
  let projectConfig;

  if (process.env.PROJECT_CONFIG) {
    projectConfig = JSON.parse(process.env.PROJECT_CONFIG);
    builderServer(projectConfig).then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    });
  } else {
    process.stdin.setEncoding('utf8');
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', async () => {
      try {
        projectConfig = JSON.parse(data);
        const result = await builderServer(projectConfig);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
      } catch (error) {
        console.error('Failed to parse project config:', error);
        process.exit(1);
      }
    });
  }
} 