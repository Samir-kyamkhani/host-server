import dotenv from "dotenv";
import pkg from "@aws-sdk/client-s3";
const { S3Client } = pkg;
import pkg2 from "@aws-sdk/client-ecr";
const { ECRClient } = pkg2;
import pkg3 from "@aws-sdk/client-ecs";
const { ECSClient } = pkg3;
import pkg4 from "@aws-sdk/client-rds";
const { RDSClient } = pkg4;
import pkg5 from "@aws-sdk/client-elastic-load-balancing-v2";
const { ElasticLoadBalancingV2Client } = pkg5;
import pkg6 from "@aws-sdk/client-iam";
const { IAMClient } = pkg6;
import pkg7 from "@aws-sdk/client-ec2";
const { EC2Client } = pkg7;
import pkg8 from "@aws-sdk/client-cloudwatch-logs";
const { CloudWatchLogsClient } = pkg8;
import pkg9 from "@aws-sdk/client-secrets-manager";
const { SecretsManagerClient } = pkg9;

dotenv.config({ path: "../../.env" });

export const awsConfig = {
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  maxAttempts: 3,
  retryMode: 'adaptive',
};

let _s3Client = null;
let _ecrClient = null;
let _ecsClient = null;
let _rdsClient = null;
let _elbClient = null;
let _iamClient = null;
let _ec2Client = null;
let _logsClient = null;
let _secretsClient = null;

export const s3Client = () => {
  if (!_s3Client) _s3Client = new S3Client(awsConfig);
  return _s3Client;
};

export const ecrClient = () => {
  if (!_ecrClient) _ecrClient = new ECRClient(awsConfig);
  return _ecrClient;
};

export const ecsClient = () => {
  if (!_ecsClient) _ecsClient = new ECSClient(awsConfig);
  return _ecsClient;
};

export const rdsClient = () => {
  if (!_rdsClient) _rdsClient = new RDSClient(awsConfig);
  return _rdsClient;
};

export const elbClient = () => {
  if (!_elbClient) _elbClient = new ElasticLoadBalancingV2Client(awsConfig);
  return _elbClient;
};

export const iamClient = () => {
  if (!_iamClient) _iamClient = new IAMClient(awsConfig);
  return _iamClient;
};

export const ec2Client = () => {
  if (!_ec2Client) _ec2Client = new EC2Client(awsConfig);
  return _ec2Client;
};

export const logsClient = () => {
  if (!_logsClient) _logsClient = new CloudWatchLogsClient(awsConfig);
  return _logsClient;
};

export const secretsClient = () => {
  if (!_secretsClient) _secretsClient = new SecretsManagerClient(awsConfig);
  return _secretsClient;
};

export const getDeploymentConfig = (props) => ({
  projectId: props.projectId,
  deploymentId: props.deploymentId,
  subdomain: props.subdomain,
  region: awsConfig.region,
  vpcId: props.vpcId || process.env.VPC_ID,
  subnetIds: props.subnetIds || process.env.SUBNET_IDS?.split(",") || [],
  securityGroupIds: props.securityGroupIds || process.env.SECURITY_GROUP_IDS?.split(",") || [],
});

export const validateAWSConfig = () => {
  const errors = [];
  
  if (!process.env.AWS_ACCESS_KEY_ID) {
    errors.push("AWS_ACCESS_KEY_ID is required");
  }
  
  if (!process.env.AWS_SECRET_ACCESS_KEY) {
    errors.push("AWS_SECRET_ACCESS_KEY is required");
  }
  
  if (!process.env.VPC_ID) {
    errors.push("VPC_ID is required");
  }
  
  if (!process.env.SUBNET_IDS) {
    errors.push("SUBNET_IDS is required");
  }
  
  if (!process.env.SECURITY_GROUP_IDS) {
    errors.push("SECURITY_GROUP_IDS is required");
  }
  
  if (errors.length > 0) {
    throw new Error(`AWS Configuration errors: ${errors.join(", ")}`);
  }
  
  return true;
}; 