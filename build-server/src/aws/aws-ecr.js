import pkg from "@aws-sdk/client-ecr";
const { CreateRepositoryCommand, PutImageCommand } = pkg;
import { ecrClient } from "./aws-config.js";

export async function createECRRepository(props) {
  const { repositoryName, publishLog } = props;
  
  await publishLog(`🏗️ Creating ECR repository: ${repositoryName}`);
  
  try {
    await ecrClient().send(new CreateRepositoryCommand({
      repositoryName,
      imageScanningConfiguration: {
        scanOnPush: true,
      },
    }));
    
    await publishLog(`✅ ECR repository created: ${repositoryName}`);
    return repositoryName;
  } catch (error) {
    if (error.name === "RepositoryAlreadyExistsException") {
      await publishLog(`ℹ️ ECR repository already exists: ${repositoryName}`);
      return repositoryName;
    }
    throw error;
  }
}

export async function pushImageToECR(props) {
  const { imageTag, repositoryUri, publishLog } = props;
  
  await publishLog(`📦 Pushing image to ECR: ${imageTag}`);
  
  try {
    await ecrClient().send(new PutImageCommand({
      repositoryName: repositoryUri.split('/')[1],
      imageTag: imageTag,
    }));
    
    await publishLog(`✅ Image pushed to ECR: ${repositoryUri}:${imageTag}`);
    return `${repositoryUri}:${imageTag}`;
  } catch (error) {
    await publishLog(`❌ Failed to push image: ${error.message}`);
    throw error;
  }
}

export function getECRRepositoryUri(props) {
  const { repositoryName, region } = props;
  const accountId = process.env.AWS_ACCOUNT_ID || "123456789012";
  return `${accountId}.dkr.ecr.${region}.amazonaws.com/${repositoryName}`;
} 