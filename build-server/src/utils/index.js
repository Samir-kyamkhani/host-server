export { 
  publishLog, 
  detectFramework, 
  readProjectConfig, 
  generateDeploymentConfig, 
  updateDeploymentStatus, 
  runCommand 
} from './utils.js';

export { 
  generateDockerfile, 
  buildDockerImage, 
  pushDockerImageToECR, 
  buildAndPushDockerImage 
} from './docker-builder.js';

export {
  APIServerCommunication,
  createAPIServerCommunication,
  extractAPIServerConfig
} from './api-communication.js'; 