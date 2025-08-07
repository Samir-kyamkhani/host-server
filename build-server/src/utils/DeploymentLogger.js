import { publishLog } from "../index.js";

export class DeploymentLogger {
  constructor(deploymentConfig, apiCommunication) {
    this.deploymentConfig = deploymentConfig;
    this.apiCommunication = apiCommunication;
  }

  async log(message, level = "info") {
    const logEntry = {
      message,
      deploymentId: this.deploymentConfig.deploymentId,
      projectId: this.deploymentConfig.projectId,
      apiBaseUrl: process.env.API_BASE_URL,
    };

    try {
      await publishLog(logEntry);
      if (this.apiCommunication) {
        await this.apiCommunication.sendLog({ message, level });
      }
    } catch (error) {
      console.error("Failed to send log:", error);
    }
  }
}
