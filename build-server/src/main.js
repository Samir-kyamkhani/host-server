import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import {
  AWSServices,
  createAPIServerCommunication,
  extractAPIServerConfig,
  DeploymentHandler,
  readProjectConfig,
  generateDeploymentConfig,
  DeploymentLogger,
  DatabaseManager,
  RepositoryManager,
} from "./index.js";

dotenv.config({ path: "../.env" });
dotenv.config({ path: "../../.env" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REQUIRED_ENV_VARS = ["DEPLOYMENT_ID", "PROJECT_ID", "SUBDOMAIN"];
const OUTPUT_DIR = path.join(__dirname, "../output");
const SUPPORTED_DATABASES = new Set(["mysql", "postgresql"]);

function validateEnvironment() {
  const missingVars = REQUIRED_ENV_VARS.filter(
    (varName) => !process.env[varName]
  );
  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
  }
}

// Main Deployment Function
async function builderServer(projectConfig) {
  validateEnvironment();

  const deploymentConfig = generateDeploymentConfig({
    deploymentId: process.env.DEPLOYMENT_ID,
    projectId: process.env.PROJECT_ID,
    subdomain: process.env.SUBDOMAIN,
  });

  if (!deploymentConfig.projectId) {
    throw new Error("Project ID is required but not provided");
  }

  const config = readProjectConfig(projectConfig);
  const { apiServerUrl, apiKey } = extractAPIServerConfig(config.envVars || []);

  const apiCommunication = createAPIServerCommunication({
    apiServerUrl,
    apiKey,
    deploymentId: deploymentConfig.deploymentId,
    projectId: deploymentConfig.projectId,
  });

  const logger = new DeploymentLogger(deploymentConfig, apiCommunication);

  try {
    // Log initial deployment info
    await logger.log("🚀 Builder Server Started");
    await logger.log(`📋 Project: ${projectConfig.name}`);
    await logger.log(`🆔 Project ID: ${deploymentConfig.projectId}`);
    await logger.log(`🆔 Deployment ID: ${deploymentConfig.deploymentId}`);
    await logger.log(`🌐 Subdomain: ${deploymentConfig.subdomain}`);
    await logger.log(`🔧 Framework: ${config.framework}`);
    await logger.log(`🗄️ Database: ${config.database || "None"}`);

    if (apiServerUrl) {
      await logger.log(`🔗 API Server: ${apiServerUrl}`);
    }

    await apiCommunication.updateDeploymentStatus({
      status: "started",
      framework: config.framework,
      database: config.database,
    });

    // Initialize AWS Services
    const awsServices = new AWSServices();
    awsServices.validateConfig();

    // Clone repository
    const repoManager = new RepositoryManager(logger, OUTPUT_DIR);
    await repoManager.cloneRepository(config.gitUrl, config.gitBranch);
    
    // Validate framework
    if (!config.framework) {
      throw new Error("Framework is required in project configuration.");
    }

    await logger.log("☁️ Starting deployment process...");
    await apiCommunication.updateDeploymentStatus({ status: "provisioning" });

    // Database setup
    const dbManager = new DatabaseManager(awsServices, logger);
    let dbConfig = null;

    if (config.needsDatabase && config.database) {
      if (SUPPORTED_DATABASES.has(config.database)) {
        dbConfig = await dbManager.setupDatabase(
          deploymentConfig.projectId,
          config.database,
          deploymentConfig.subnetIds,
          deploymentConfig.securityGroupIds
        );
      } else {
        await logger.log(
          `⚠️ ${config.framework} requires database but unsupported type provided`
        );
        throw new Error(
          `${config.framework} requires supported database configuration`
        );
      }
    } else if (config.needsDatabase && !config.database) {
      await logger.log(
        `⚠️ ${config.framework} requires database but none provided`
      );
      throw new Error(`${config.framework} requires database configuration`);
    } else {
      await logger.log(
        `ℹ️ ${config.framework} doesn't require database, skipping database creation`
      );
    }

    // Environment variables setup
    if (Object.keys(config.environment || {}).length > 0) {
      await logger.log("🔐 Creating environment variables secret...");
      await logger.log(
        `📋 Environment variables: ${Object.keys(config.environment).join(
          ", "
        )}`
      );

      await awsServices.createEnvironmentSecret({
        projectId: deploymentConfig.projectId,
        environment: config.environment,
        region: awsServices.getConfig().region,
        publishLog: logger.log.bind(logger),
      });
    }

    // Deploy application
    await logger.log("🚀 Starting deployment...");
    await apiCommunication.updateDeploymentStatus({ status: "building" });

    const deploymentHandler = new DeploymentHandler(
      awsServices,
      deploymentConfig.projectId,
      logger.log.bind(logger)
    );

    const deploymentResult = await deploymentHandler.deploy(
      OUTPUT_DIR,
      config.framework,
      config.database,
      config.environment,
      deploymentConfig.subnetIds,
      deploymentConfig.securityGroupIds,
      deploymentConfig.vpcId,
      config.gitUrl
    );

    await logger.log("🎉 Deployment completed successfully!");
    await logger.log(`🌐 Application URL: ${deploymentResult.url}`);

    await apiCommunication.updateDeploymentStatus({
      status: "completed",
      url: deploymentResult.url,
      framework: config.framework,
      database: dbConfig ? config.database : null,
    });

    await apiCommunication.updateProjectStatus({
      status: "deployed",
      url: deploymentResult.url,
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
      ...deploymentResult,
    };
  } catch (error) {
    await logger.log(`❌ Builder Server Error: ${error.message}`, "error");
    console.error(error);

    if (apiCommunication) {
      await apiCommunication.updateDeploymentStatus({
        status: "failed",
        error: error.message,
      });

      await apiCommunication.updateProjectStatus({
        status: "failed",
        error: error.message,
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

// Main execution if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      let projectConfig;

      if (process.env.PROJECT_CONFIG) {
        projectConfig = JSON.parse(process.env.PROJECT_CONFIG);
      } else {
        const data = await new Promise((resolve) => {
          process.stdin.setEncoding("utf8");
          let input = "";
          process.stdin.on("data", (chunk) => (input += chunk));
          process.stdin.on("end", () => resolve(input));
        });
        projectConfig = JSON.parse(data);
      }

      const result = await builderServer(projectConfig);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error("Failed to execute builder server:", error);
      process.exit(1);
    }
  })();
}
