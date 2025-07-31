import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

import { AWSServices } from "./aws/aws-services.js";
import { DeploymentHandler } from "./utils/deployment-handler.js";
import { FrameworkHandler, detectFrameworkFromFiles } from "./utils/framework-handler.js";

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
dotenv.config({ path: "../../.env" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;
const PROJECT_ID = process.env.PROJECT_ID;
const SUBDOMAIN = process.env.SUBDOMAIN;
const API_BASE_URL = process.env.API_BASE_URL;

// Validate required environment variables
if (!DEPLOYMENT_ID) {
  throw new Error("DEPLOYMENT_ID environment variable is required");
}
if (!PROJECT_ID) {
  throw new Error("PROJECT_ID environment variable is required");
}
if (!SUBDOMAIN) {
  throw new Error("SUBDOMAIN environment variable is required");
}

async function builderServer(projectConfig) {
  let apiCommunication = null;
  
  try {
    // Initialize AWS Services
    const awsServices = new AWSServices();
    awsServices.validateConfig();
    
    const deploymentConfig = generateDeploymentConfig({
      deploymentId: DEPLOYMENT_ID,
      projectId: PROJECT_ID,
      subdomain: SUBDOMAIN,
    });

    const config = readProjectConfig(projectConfig);
    
    // Validate that we have a valid project ID
    if (!deploymentConfig.projectId) {
      throw new Error("Project ID is required but not provided");
    }
    
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

    await logPublisher(`🆔 Project ID: ${deploymentConfig.projectId}`);
    
    await logPublisher("🚀 Builder Server Started");
    await logPublisher(`📋 Project: ${projectConfig.name}`);
    await logPublisher(`🆔 Project ID: ${deploymentConfig.projectId}`);
    await logPublisher(`🆔 Deployment ID: ${deploymentConfig.deploymentId}`);
    await logPublisher(`🌐 Subdomain: ${deploymentConfig.subdomain}`);
    await logPublisher(`🔧 Framework: ${config.framework}`);
    await logPublisher(`🗄️ Database: ${config.database || 'None'}`);
    
    if (apiServerUrl) {
      await logPublisher(`🔗 API Server: ${apiServerUrl}`);
    }

    await apiCommunication.updateDeploymentStatus({
      status: 'started',
      framework: config.framework,
      database: config.database
    });

    const outDirPath = path.join(__dirname, "../output");

    // Clone git repository (mandatory)
    await logPublisher(`📥 Cloning repository from: ${config.gitUrl}`);
    await logPublisher(`📁 Cloning to directory: ${outDirPath}`);
    await logPublisher(`🌿 Branch: ${config.gitBranch}`);
    
    // Clean output directory if it exists
    if (fs.existsSync(outDirPath)) {
      await logPublisher("🧹 Cleaning existing output directory...");
      await runCommand({
        command: `rm -rf "${outDirPath}"`,
        cwd: path.dirname(outDirPath),
        publishLog: logPublisher,
      });
    }
    
    // Create output directory
    fs.mkdirSync(outDirPath, { recursive: true });
    
    // Clone the repository
    await runCommand({
      command: `git clone "${config.gitUrl}" .`,
      cwd: outDirPath,
      publishLog: logPublisher,
    });
    
    // Checkout specific branch if provided
    if (config.gitBranch && config.gitBranch !== "main") {
      await logPublisher(`🔄 Checking out branch: ${config.gitBranch}`);
      await runCommand({
        command: `git checkout ${config.gitBranch}`,
        cwd: outDirPath,
        publishLog: logPublisher,
      });
    }
    
    await logPublisher("✅ Repository cloned successfully");

    await logPublisher("📖 Reading project configuration...");
    await logPublisher(`🧠 Detected framework: ${config.framework}`);
    await logPublisher(`🗄️ Database: ${config.database || 'None'}`);
    await logPublisher(`🔧 Deployment type: ${config.deploymentType}`);
    await logPublisher(`📦 Needs database: ${config.needsDatabase ? 'Yes' : 'No'}`);
    await logPublisher(`⚡ Uses Prisma: ${config.usesPrisma ? 'Yes' : 'No'}`);

    // Auto-detect framework if not specified
    if (!config.framework || config.framework === "auto") {
      const detectedFramework = detectFrameworkFromFiles(outDirPath);
      config.framework = detectedFramework;
      await logPublisher(`🔍 Auto-detected framework: ${detectedFramework}`);
    }

    await logPublisher("☁️ Starting deployment process...");
    await apiCommunication.updateDeploymentStatus({ status: 'provisioning' });

    // Create database if needed
    let dbConfig = null;
    if (config.needsDatabase && config.database && ["mysql", "postgresql"].includes(config.database)) {
      await logPublisher(`🗄️ Creating ${config.database} database for ${config.framework}...`);
      
      try {
        // Create RDS instance
        dbConfig = await awsServices.createRDSInstance({
          projectId: deploymentConfig.projectId,
          database: config.database,
          subnetIds: deploymentConfig.subnetIds,
          securityGroupIds: deploymentConfig.securityGroupIds,
          publishLog: logPublisher,
        });
        
        // Create database secret
        await awsServices.createDatabaseSecret({
          projectId: deploymentConfig.projectId,
          database: config.database,
          dbConfig: dbConfig,
          region: awsServices.getConfig().region,
          publishLog: logPublisher,
        });
        
        await logPublisher(`✅ ${config.database} database created successfully`);
      } catch (error) {
        await logPublisher(`❌ Database creation failed: ${error.message}`);
        throw error;
      }
    } else if (config.needsDatabase && !config.database) {
      await logPublisher(`⚠️ ${config.framework} requires database but none provided`);
      throw new Error(`${config.framework} requires database configuration`);
    } else {
      await logPublisher(`ℹ️ ${config.framework} doesn't require database, skipping database creation`);
    }

    // Create environment secret if environment variables exist
    if (Object.keys(config.environment || {}).length > 0) {
      await logPublisher("🔐 Creating environment variables secret...");
      await logPublisher(`📋 Environment variables: ${Object.keys(config.environment).join(", ")}`);
      await awsServices.createEnvironmentSecret({
        projectId: deploymentConfig.projectId,
        environment: config.environment,
        region: awsServices.getConfig().region,
        publishLog: logPublisher,
      });
    }

    // Initialize deployment handler
    const deploymentHandler = new DeploymentHandler(awsServices, deploymentConfig.projectId, logPublisher);
    
    await logPublisher("🚀 Starting deployment...");
    await apiCommunication.updateDeploymentStatus({ status: 'building' });

    // Deploy the application
    const deploymentResult = await deploymentHandler.deploy(
      outDirPath,
      config.framework,
      config.database,
      config.environment
    );

    await logPublisher("🎉 Deployment completed successfully!");
    await logPublisher(`🌐 Application URL: ${deploymentResult.url}`);

    await apiCommunication.updateDeploymentStatus({
      status: 'completed',
      url: deploymentResult.url,
      framework: config.framework,
      database: dbConfig ? config.database : null
    });

    await apiCommunication.updateProjectStatus({
      status: 'deployed',
      url: deploymentResult.url
    });

    await apiCommunication.sendHealthCheck();

    return {
      success: true,
      url: deploymentResult.url,
      projectId: deploymentConfig.projectId,
      deploymentId: deploymentConfig.deploymentId,
      framework: config.framework,
      database: dbConfig ? config.database : null,
      deploymentType: deploymentResult.type,
      ...deploymentResult
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