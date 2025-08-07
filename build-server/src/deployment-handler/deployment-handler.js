import { S3DeploymentHandler, ServerSideDeploymentHandler } from "../index.js";

export class DeploymentHandler {
  constructor(awsServices, projectId, publishLog) {
    this.awsServices = awsServices;
    this.projectId = projectId;
    this.publishLog = publishLog;
    this.serverSide = new ServerSideDeploymentHandler(
      awsServices,
      projectId,
      publishLog
    );
    this.s3Handler = new S3DeploymentHandler(
      awsServices,
      projectId,
      publishLog
    );
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
    await this.publishLog(`🎯 Starting deployment for framework: ${framework}`);

    if (this.isStaticFramework(framework)) {
      return await this.s3Handler.deploy(projectPath, framework, environment);
    } else {
      return await this.serverSide.deploy(
        projectPath,
        framework,
        database,
        environment,
        subnetIds,
        securityGroupIds,
        vpcId,
        repositoryUrl
      );
    }
  }

  isStaticFramework(framework) {
    return ["vite", "static", "html", "css", "js"].includes(framework);
  }
}
