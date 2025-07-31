export { 
  publishLog, 
  readProjectConfig, 
  generateDeploymentConfig, 
  updateDeploymentStatus, 
  runCommand 
} from './utils.js';

export {
  APIServerCommunication,
  createAPIServerCommunication,
  extractAPIServerConfig
} from './api-communication.js';

export { FrameworkHandler, detectFrameworkFromFiles } from './framework-handler.js';
export { DeploymentHandler, ECSDeploymentHandler, S3DeploymentHandler } from './deployment-handler.js'; 