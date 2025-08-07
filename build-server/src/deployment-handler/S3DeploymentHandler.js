import { FrameworkHandler } from "../index.js";

export class S3DeploymentHandler {
  constructor(awsServices, projectId, publishLog) {
    this.awsServices = awsServices;
    this.projectId = projectId;
    this.publishLog = publishLog;
  }

  async deploy(projectPath, framework, environment) {
    await this.publishLog(
      "🚀 Starting S3 + CloudFront deployment for static site..."
    );

    // Set environment variables for the framework handler
    if (environment && Object.keys(environment).length > 0) {
      const envVars = Object.entries(environment).map(([key, value]) => ({
        key,
        value,
      }));
      process.env.ENV_VARS = JSON.stringify(envVars);
      await this.publishLog(
        `🔧 Setting up ${envVars.length} environment variables for build...`
      );
    }

    const frameworkHandler = new FrameworkHandler(
      environment,
      projectPath,
      framework,
      null,
      this.publishLog,
      this.projectId
    );

    const frameworkConfig = await frameworkHandler.handle();

    // Create and configure S3 bucket
    const bucketName = `${this.projectId}-static-hosting`;
    await this.awsServices.createS3Bucket({
      bucketName,
      publishLog: this.publishLog,
    });
    await this.awsServices.configureS3StaticHosting({
      bucketName,
      publishLog: this.publishLog,
    });

    // Upload files and setup CDN
    await this.awsServices.uploadDirectoryToS3({
      bucketName,
      sourcePath: frameworkConfig.buildOutput,
      publishLog: this.publishLog,
    });

    const cloudfrontConfig =
      await this.awsServices.createCloudFrontDistribution({
        bucketName,
        projectId: this.projectId,
        publishLog: this.publishLog,
      });

    await this.awsServices.addBucketPolicy({
      bucketName,
      publishLog: this.publishLog,
    });

    return {
      type: "s3",
      url: cloudfrontConfig.domainName,
      s3Url: `http://${bucketName}.s3-website.${
        process.env.AWS_REGION || "ap-south-1"
      }.amazonaws.com`,
      bucketName,
      distributionId: cloudfrontConfig.distributionId,
    };
  }
}
