import pkg from "@aws-sdk/client-secrets-manager";
const { CreateSecretCommand, GetSecretValueCommand } = pkg;
import { secretsClient } from "./aws-config.js";

export async function createSecret(props) {
  const { secretName, secretValue, description, publishLog } = props;
  
  await publishLog(`🔐 Creating secret: ${secretName}`);
  
  try {
    await secretsClient().send(new CreateSecretCommand({
      Name: secretName,
      SecretString: JSON.stringify(secretValue),
      Description: description,
    }));
    
    await publishLog(`✅ Secret created: ${secretName}`);
    return secretName;
  } catch (error) {
    if (error.name === "ResourceExistsException") {
      await publishLog(`ℹ️ Secret already exists: ${secretName}`);
      return secretName;
    }
    throw error;
  }
}

export async function createDatabaseSecret(props) {
  const { projectId, dbConfig, publishLog } = props;
  
  const secretName = `${projectId}-db-secret`;
  
  const secretValue = {
    host: dbConfig.endpoint,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
  };
  
  return await createSecret({
    secretName,
    secretValue,
    description: `Database credentials for ${projectId}`,
    publishLog,
  });
}

export async function getSecretValue(props) {
  const { secretName, publishLog } = props;
  
  await publishLog(`🔍 Retrieving secret: ${secretName}`);
  
  try {
    const result = await secretsClient().send(new GetSecretValueCommand({
      SecretId: secretName,
    }));
    
    await publishLog(`✅ Secret retrieved: ${secretName}`);
    return JSON.parse(result.SecretString);
  } catch (error) {
    await publishLog(`❌ Failed to retrieve secret: ${error.message}`);
    throw error;
  }
}

export async function createEnvironmentSecret(props) {
  const { projectId, environmentVars, publishLog } = props;
  
  const secretName = `${projectId}-env-secret`;
  
  return await createSecret({
    secretName,
    secretValue: environmentVars,
    description: `Environment variables for ${projectId}`,
    publishLog,
  });
} 