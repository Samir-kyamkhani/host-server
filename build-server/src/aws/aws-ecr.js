import pkg from "@aws-sdk/client-ecr";
const { CreateRepositoryCommand } = pkg;
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

 