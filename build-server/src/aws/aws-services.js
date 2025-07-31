import {
  // ECR
  createECRRepository,
  
  // RDS
  createRDSInstance,
  
  // ECS
  createECSCluster,
  createECSTaskDefinition,
  createECSService,
  
  // Load Balancer
  createCompleteLoadBalancerSetup,
  
  // S3
  createS3Bucket,
  configureS3StaticHosting,
  uploadDirectoryToS3,
  
  // CloudWatch
  createECSLogGroup,
  
  // Secrets Manager
  createDatabaseSecret,
  createEnvironmentSecret,
  
  // CloudFront
  createCloudFrontDistribution,
  
  // Config
  awsConfig,
  validateAWSConfig
} from './index.js';

// AWS Services wrapper class
export class AWSServices {
  constructor() {
    this.config = awsConfig;
  }

  // ECR Methods
  async createECRRepository(props) {
    return await createECRRepository(props);
  }

  async getECRLoginCommand() {
    const { ecrClient } = await import('./aws-config.js');
    const { GetAuthorizationTokenCommand } = await import('@aws-sdk/client-ecr');
    
    try {
      const result = await ecrClient().send(new GetAuthorizationTokenCommand({}));
      const token = result.authorizationData[0].authorizationToken;
      const endpoint = result.authorizationData[0].proxyEndpoint;
      
      return `echo "${token}" | docker login --username AWS --password-stdin ${endpoint}`;
    } catch (error) {
      throw new Error(`Failed to get ECR login command: ${error.message}`);
    }
  }

  // RDS Methods
  async createRDSInstance(props) {
    return await createRDSInstance(props);
  }

  // ECS Methods
  async createECSCluster(props) {
    return await createECSCluster(props);
  }

  async createECSTaskDefinition(props) {
    return await createECSTaskDefinition(props);
  }

  async createECSService(props) {
    return await createECSService(props);
  }

  // Load Balancer Methods
  async createCompleteLoadBalancerSetup(props) {
    return await createCompleteLoadBalancerSetup(props);
  }

  // S3 Methods
  async createS3Bucket(props) {
    return await createS3Bucket(props);
  }

  async configureS3StaticHosting(props) {
    return await configureS3StaticHosting(props);
  }

  async uploadDirectoryToS3(props) {
    return await uploadDirectoryToS3(props);
  }

  // CloudWatch Methods
  async createECSLogGroup(props) {
    return await createECSLogGroup(props);
  }

  // Secrets Manager Methods
  async createDatabaseSecret(props) {
    return await createDatabaseSecret(props);
  }

  async createEnvironmentSecret(props) {
    return await createEnvironmentSecret(props);
  }

  // CloudFront Methods
  async createCloudFrontDistribution(props) {
    return await createCloudFrontDistribution(props);
  }

  // Configuration Methods
  getConfig() {
    return this.config;
  }

  validateConfig() {
    return validateAWSConfig();
  }
} 