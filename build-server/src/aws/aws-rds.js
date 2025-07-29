import pkg from "@aws-sdk/client-rds";
const {
  CreateDBInstanceCommand,
  CreateDBSubnetGroupCommand,
  DescribeDBInstancesCommand,
} = pkg;
import { rdsClient } from "./aws-config.js";

export async function createRDSInstance(props) {
  const {
    projectId,
    database,
    subnetIds,
    securityGroupIds,
    publishLog,
  } = props;

  const dbInstanceIdentifier = `${projectId}-db`;
  const dbSubnetGroupName = `${projectId}-subnet-group`;

  await publishLog(`🏗️ Creating RDS subnet group: ${dbSubnetGroupName}`);

  try {
    await rdsClient().send(
      new CreateDBSubnetGroupCommand({
        DBSubnetGroupName: dbSubnetGroupName,
        DBSubnetGroupDescription: `Subnet group for ${projectId}`,
        SubnetIds: subnetIds,
      })
    );

    await publishLog(`✅ RDS subnet group created: ${dbSubnetGroupName}`);
  } catch (error) {
    if (error.name === "DBSubnetGroupAlreadyExistsFault") {
      await publishLog(
        `ℹ️ RDS subnet group already exists: ${dbSubnetGroupName}`
      );
    } else {
      throw error;
    }
  }

  await publishLog(`🏗️ Creating RDS instance: ${dbInstanceIdentifier}`);

  const dbConfig = {
    DBInstanceIdentifier: dbInstanceIdentifier,
    DBInstanceClass: "db.t3.micro",
    Engine: database === "mysql" ? "mysql" : "postgres",
    MasterUsername: "admin",
    MasterUserPassword: generatePassword(),
    AllocatedStorage: 20,
    StorageType: "gp2",
    DBSubnetGroupName: dbSubnetGroupName,
    VpcSecurityGroupIds: securityGroupIds,
    BackupRetentionPeriod: 7,
    MultiAZ: false,
    PubliclyAccessible: false,
    StorageEncrypted: true,
    DeletionProtection: false,
  };

  try {
    const result = await rdsClient().send(
      new CreateDBInstanceCommand(dbConfig)
    );

    await publishLog(`✅ RDS instance created: ${dbInstanceIdentifier}`);

    // Check if endpoint is available in response
    if (
      result.DBInstance &&
      result.DBInstance.Endpoint &&
      result.DBInstance.Endpoint.Address
    ) {
      await publishLog(
        `📊 Database endpoint: ${result.DBInstance.Endpoint.Address}`
      );

      return {
        endpoint: result.DBInstance.Endpoint.Address,
        port: result.DBInstance.Endpoint.Port,
        username: "admin",
        password: dbConfig.MasterUserPassword,
        database: database === "mysql" ? "app" : "postgres",
      };
    } else {
      // If endpoint not available, wait for instance to be ready
      await publishLog(`⏳ Waiting for RDS instance to be available...`);
      return await waitForRDSInstanceReady(
        dbInstanceIdentifier,
        dbConfig.MasterUserPassword,
        database,
        publishLog
      );
    }
  } catch (error) {
    if (error.name === "DBInstanceAlreadyExistsFault") {
      await publishLog(
        `ℹ️ RDS instance already exists: ${dbInstanceIdentifier}`
      );
      return await waitForRDSInstanceReady(
        dbInstanceIdentifier,
        "placeholder",
        database,
        publishLog
      );
    }
    throw error;
  }
}

// Add new function to wait for RDS instance to be ready
async function waitForRDSInstanceReady(
  instanceIdentifier,
  password,
  database,
  publishLog
) {
  const maxAttempts = 30; // 5 minutes max wait
  const delayMs = 10000; // 10 seconds between checks

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await publishLog(
        `⏳ Checking RDS instance status (attempt ${attempt}/${maxAttempts})...`
      );

      const result = await rdsClient().send(
        new DescribeDBInstancesCommand({
          DBInstanceIdentifier: instanceIdentifier,
        })
      );

      const dbInstance = result.DBInstances[0];

      if (dbInstance && dbInstance.Endpoint && dbInstance.Endpoint.Address) {
        await publishLog(`✅ RDS instance is ready!`);
        await publishLog(
          `📊 Database endpoint: ${dbInstance.Endpoint.Address}`
        );

        return {
          endpoint: dbInstance.Endpoint.Address,
          port: dbInstance.Endpoint.Port,
          username: "admin",
          password: password,
          database: database === "mysql" ? "app" : "postgres",
        };
      }

      if (dbInstance && dbInstance.DBInstanceStatus === "available") {
        // Instance is available but endpoint might not be ready yet
        await publishLog(
          `ℹ️ RDS instance status: ${dbInstance.DBInstanceStatus}`
        );
      } else if (dbInstance) {
        await publishLog(
          `ℹ️ RDS instance status: ${dbInstance.DBInstanceStatus}`
        );
      }
    } catch (error) {
      await publishLog(`⚠️ Error checking RDS status: ${error.message}`);
    }

    if (attempt < maxAttempts) {
      await publishLog(
        `⏳ Waiting ${delayMs / 1000} seconds before next check...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // If we reach here, instance is not ready after max attempts
  throw new Error(
    `RDS instance ${instanceIdentifier} did not become ready within ${
      (maxAttempts * delayMs) / 1000
    } seconds`
  );
}

export function getDatabaseEnvironmentVariables(props) {
  const { dbConfig, framework } = props;

  if (framework === "laravel") {
    return {
      DB_CONNECTION: dbConfig.database === "mysql" ? "mysql" : "pgsql",
      DB_HOST: dbConfig.endpoint,
      DB_PORT: dbConfig.port,
      DB_DATABASE: dbConfig.database,
      DB_USERNAME: dbConfig.username,
      DB_PASSWORD: dbConfig.password,
    };
  } else if (framework === "nodejs-prisma" || framework === "nextjs-prisma") {
    const protocol = dbConfig.database === "mysql" ? "mysql" : "postgresql";
    return {
      DATABASE_URL: `${protocol}://${dbConfig.username}:${dbConfig.password}@${dbConfig.endpoint}:${dbConfig.port}/${dbConfig.database}`,
    };
  }

  return {};
}

function generatePassword() {
  return (
    Math.random().toString(36).slice(-12) +
    Math.random().toString(36).slice(-12)
  );
}
