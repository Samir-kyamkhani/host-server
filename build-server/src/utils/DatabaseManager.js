const SUPPORTED_DATABASES = new Set(["mysql", "postgresql"]);

export class DatabaseManager {
  constructor(awsServices, logger) {
    this.awsServices = awsServices;
    this.logger = logger;
  }

  async setupDatabase(projectId, database, subnetIds, securityGroupIds) {
    if (!SUPPORTED_DATABASES.has(database)) {
      await this.logger.log(`⚠️ Unsupported database type: ${database}`);
      return null;
    }

    try {
      await this.logger.log(`🗄️ Creating ${database} database...`);

      const dbConfig = await this.awsServices.createRDSInstance({
        projectId,
        database,
        subnetIds,
        securityGroupIds,
        publishLog: this.logger.log.bind(this.logger),
      });

      await this.awsServices.createDatabaseSecret({
        projectId,
        database,
        dbConfig,
        region: this.awsServices.getConfig().region,
        publishLog: this.logger.log.bind(this.logger),
      });

      await this.logger.log(`✅ ${database} database created successfully`);
      return dbConfig;
    } catch (error) {
      await this.logger.log(
        `❌ Database creation failed: ${error.message}`,
        "error"
      );
      throw error;
    }
  }
}
