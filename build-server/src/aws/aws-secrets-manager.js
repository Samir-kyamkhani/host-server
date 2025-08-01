import pkg from "@aws-sdk/client-secrets-manager";
const { CreateSecretCommand, GetSecretValueCommand } = pkg;
import { secretsClient } from "./aws-config.js";

export async function createDatabaseSecret(props) {
  const { projectId, database, dbConfig, region, publishLog } = props;
  
  const secretName = `${projectId}-${database}-credentials`;
  
  const secretValue = {
    host: dbConfig.endpoint,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
  };
  
  await publishLog(`🔐 Creating database secret: ${secretName}`);
  
  try {
    await secretsClient().send(new CreateSecretCommand({
      Name: secretName,
      SecretString: JSON.stringify(secretValue),
      Description: `Database credentials for ${projectId}`,
    }));
    
    await publishLog(`✅ Database secret created: ${secretName}`);
    return secretName;
  } catch (error) {
    if (error.name === "ResourceExistsException") {
      await publishLog(`ℹ️ Database secret already exists: ${secretName}`);
      return secretName;
    }
    throw error;
  }
}

export async function createEnvironmentSecret(props) {
  const { projectId, environment, region, publishLog } = props;
  
  const secretName = `${projectId}-environment-variables`;
  
  await publishLog(`🔐 Creating environment secret: ${secretName}`);
  
  try {
    await secretsClient().send(new CreateSecretCommand({
      Name: secretName,
      SecretString: JSON.stringify(environment),
      Description: `Environment variables for ${projectId}`,
    }));
    
    await publishLog(`✅ Environment secret created: ${secretName}`);
    return secretName;
  } catch (error) {
    if (error.name === "ResourceExistsException") {
      await publishLog(`ℹ️ Environment secret already exists: ${secretName}`);
      return secretName;
    }
    throw error;
  }
} 

export async function getDatabaseCredentials(props) {
  const { projectId, database, publishLog } = props;
  
  const secretName = `${projectId}-${database}-credentials`;
  
  await publishLog(`🔐 Retrieving database credentials from: ${secretName}`);
  
  try {
    const response = await secretsClient().send(new GetSecretValueCommand({
      SecretId: secretName,
    }));
    
    if (response.SecretString) {
      const credentials = JSON.parse(response.SecretString);
      await publishLog(`✅ Database credentials retrieved successfully`);
      return credentials;
    } else {
      await publishLog(`❌ No secret string found in: ${secretName}`);
      return null;
    }
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      await publishLog(`❌ Database secret not found: ${secretName}`);
    } else {
      await publishLog(`❌ Failed to retrieve database credentials: ${error.message}`);
    }
    return null;
  }
} 