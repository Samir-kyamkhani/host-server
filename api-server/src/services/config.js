import { ECSClient } from "@aws-sdk/client-ecs";
import { S3Client } from "@aws-sdk/client-s3";

const ecsClient = new ECSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.S3CLIENT_ACCESSKEYID,
    secretAccessKey: process.env.S3CLIENT_SECRETACCESSKEY,
  },
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.S3CLIENT_ACCESSKEYID,
    secretAccessKey: process.env.S3CLIENT_SECRETACCESSKEY,
  },
});

const config = {
  CLUSTER: process.env.ECS_CLUSTER,
  TASK: process.env.ECS_TASK,
  SUBNETS: process.env.ECS_SUBNETS?.split(",") || [],
  SECURITY_GROUPS: process.env.ECS_SECURITY_GROUPS?.split(",") || [],
  BUCKET_NAME: process.env.S3_BUCKET_NAME,
};


export { ecsClient, s3Client, config };
