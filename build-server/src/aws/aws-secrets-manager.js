import pkg from "@aws-sdk/client-secrets-manager";
const { CreateSecretCommand } = pkg;
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