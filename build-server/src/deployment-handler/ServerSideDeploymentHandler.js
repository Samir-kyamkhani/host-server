import { FrameworkHandler, getDatabaseCredentials } from "../index.js";

export class ServerSideDeploymentHandler {
  constructor(awsServices, projectId, publishLog) {
    this.awsServices = awsServices;
    this.projectId = projectId;
    this.publishLog = publishLog;
  }

  async deploy(
    projectPath,
    framework,
    database,
    environment,
    subnetIds,
    securityGroupIds,
    vpcId,
    repositoryUrl
  ) {
    await this.publishLog(
      "🚀 Starting simple deployment for dynamic application..."
    );

    const frameworkHandler = new FrameworkHandler(
      environment,
      projectPath,
      framework,
      database,
      this.publishLog,
      this.projectId
    );
    const frameworkConfig = await frameworkHandler.handle();

    let runtimeEnvironment = { ...environment };
    if (database && this.projectId) {
      try {
        await this.publishLog(
          "🔐 Retrieving database credentials for runtime environment..."
        );
        const credentials = await getDatabaseCredentials({
          projectId: this.projectId,
          database: database,
          publishLog: this.publishLog,
        });

        if (credentials) {
          let databaseUrl;
          if (database === "mysql") {
            databaseUrl = `mysql://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.database}`;
          } else if (database === "postgresql") {
            databaseUrl = `postgresql://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.database}`;
          }

          if (databaseUrl) {
            runtimeEnvironment.DATABASE_URL = databaseUrl;
            await this.publishLog(
              "✅ DATABASE_URL added to runtime environment"
            );
          }
        } else {
          await this.publishLog(
            "⚠️ No database credentials found, DATABASE_URL not added to runtime environment"
          );
        }
      } catch (error) {
        await this.publishLog(
          `❌ Failed to retrieve database credentials for runtime: ${error.message}`
        );
      }
    }

    // Create ECS cluster
    await this.publishLog("🏗️ Creating ECS cluster...");
    const clusterName = `${this.projectId}-cluster`;
    await this.awsServices.createECSCluster({
      clusterName,
      publishLog: this.publishLog,
    });

    // Create CloudWatch log group
    await this.publishLog("📊 Creating CloudWatch log group...");
    await this.awsServices.createECSLogGroup({
      projectId: this.projectId,
      taskDefinitionName: `${this.projectId}-task`,
      publishLog: this.publishLog,
    });

    // Build and push Docker image to ECR
    await this.publishLog("🐳 Building and pushing Docker image...");
    const imageUri = await this.awsServices.buildAndPushDockerImage({
      projectId: this.projectId,
      projectPath,
      framework,
      region: process.env.AWS_REGION,
      publishLog: this.publishLog,
    });

    // Create ECS task definition using the custom image
    await this.publishLog("⚡ Creating ECS task definition...");
    const taskDefinitionArn = await this.awsServices.createECSTaskDefinition({
      projectId: this.projectId,
      imageUri,
      port: frameworkConfig.port,
      environment: runtimeEnvironment,
      region: process.env.AWS_REGION,
      publishLog: this.publishLog,
      repositoryUrl,
    });

    // Create load balancer
    await this.publishLog("🌐 Creating load balancer...");
    const lbConfig = await this.awsServices.createCompleteLoadBalancerSetup({
      projectId: this.projectId,
      subnetIds,
      securityGroupIds,
      vpcId,
      port: frameworkConfig.port,
      publishLog: this.publishLog,
    });

    // Create ECS service
    await this.publishLog("⚡ Creating ECS service...");
    await this.awsServices.createECSService({
      projectId: this.projectId,
      clusterName,
      taskDefinitionArn,
      targetGroupArn: lbConfig.targetGroupArn,
      subnetIds,
      securityGroupIds,
      port: frameworkConfig.port,
      publishLog: this.publishLog,
    });

    // Wait for targets to become healthy
    await this.publishLog("🔍 Waiting for targets to become healthy...");
    await this.awsServices.waitForHealthyTargets(
      lbConfig.targetGroupArn,
      this.publishLog,
      10
    );

    return {
      type: "ecs",
      url: `http://${lbConfig.dnsName}`,
      clusterName,
      serviceName: `${this.projectId}-service`,
      loadBalancerArn: lbConfig.loadBalancerArn,
    };
  }
}
