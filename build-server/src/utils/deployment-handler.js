import path from "path";
import fs from "fs";
import { runCommand } from "./utils.js";
import { FrameworkHandler } from "./framework-handler.js";
import { SimpleDeploymentHandler } from "./simple-deployment-handler.js";

// Removed ECSDeploymentHandler - using SimpleDeploymentHandler instead

// S3 + CloudFront Deployment Handler for static sites
export class S3DeploymentHandler {
  constructor(awsServices, projectId, publishLog) {
    this.awsServices = awsServices;
    this.projectId = projectId;
    this.publishLog = publishLog;
  }

  async deploy(projectPath, framework, environment) {
    await this.publishLog("🚀 Starting S3 + CloudFront deployment for static site...");
    
    // Set environment variables for the framework handler
    if (environment && Object.keys(environment).length > 0) {
      // Convert environment object back to envVars array
      const envVars = Object.entries(environment).map(([key, value]) => ({ key, value }));
      process.env.ENV_VARS = JSON.stringify(envVars);
      await this.publishLog(`🔧 Setting up ${envVars.length} environment variables for build...`);
    }
    
    // Handle framework-specific setup
    const frameworkHandler = new FrameworkHandler(projectPath, framework, null, this.publishLog, this.projectId);
    const frameworkConfig = await frameworkHandler.handle();
    
    // Create S3 bucket
    await this.publishLog("📦 Creating S3 bucket...");
    const bucketName = `${this.projectId}-static-hosting`;
    await this.awsServices.createS3Bucket({
      bucketName,
      publishLog: this.publishLog,
    });
    
    // Configure bucket for static website hosting
    await this.publishLog("🌐 Configuring S3 for static website hosting...");
    await this.awsServices.configureS3StaticHosting({
      bucketName,
      publishLog: this.publishLog,
    });
    
    // Upload static files to S3
    await this.publishLog("📤 Uploading static files to S3...");
    await this.awsServices.uploadDirectoryToS3({
      bucketName,
      sourcePath: frameworkConfig.buildOutput,
      publishLog: this.publishLog,
    });
    
    // Create CloudFront distribution
    await this.publishLog("🌍 Creating CloudFront CDN distribution...");
    const cloudfrontConfig = await this.awsServices.createCloudFrontDistribution({
      bucketName,
      projectId: this.projectId,
      publishLog: this.publishLog,
    });
    
    // Update S3 bucket policy for CloudFront access
    await this.publishLog("🔐 Updating S3 bucket policy for CloudFront access...");
    await this.awsServices.addBucketPolicy({
      bucketName,
      publishLog: this.publishLog,
    });
    
    return {
      type: "s3",
      url: cloudfrontConfig.domainName,
      s3Url: `http://${bucketName}.s3-website.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com`,
      bucketName,
      distributionId: cloudfrontConfig.distributionId,
    };
  }
}

// Main Deployment Handler
export class DeploymentHandler {
  constructor(awsServices, projectId, publishLog) {
    this.awsServices = awsServices;
    this.projectId = projectId;
    this.publishLog = publishLog;
    this.simpleHandler = new SimpleDeploymentHandler(awsServices, projectId, publishLog);
    this.s3Handler = new S3DeploymentHandler(awsServices, projectId, publishLog);
  }

  async deploy(projectPath, framework, database, environment, subnetIds, securityGroupIds, vpcId, repositoryUrl) {
    await this.publishLog(`🎯 Starting deployment for framework: ${framework}`);
    
    // Determine deployment type
    const isStatic = this.isStaticFramework(framework);
    
    if (isStatic) {
      return await this.s3Handler.deploy(projectPath, framework, environment);
    } else {
      return await this.simpleHandler.deploy(projectPath, framework, database, environment, subnetIds, securityGroupIds, vpcId, repositoryUrl);
    }
  }
  
  isStaticFramework(framework) {
    const staticFrameworks = ["vite", "static", "html", "css", "js"];
    return staticFrameworks.includes(framework);
  }
} 