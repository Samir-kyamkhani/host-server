import path from "path";
import fs from "fs";
import { getDatabaseCredentials, runCommand } from "../index.js";

export class FrameworkHandler {
  constructor(
    environment,
    projectPath,
    framework,
    database,
    publishLog,
    projectId
  ) {
    this.environment = environment;
    this.projectPath = projectPath;
    this.framework = framework;
    this.database = database;
    this.publishLog = publishLog;
    this.projectId = projectId;
  }

  async getDatabaseUrl() {
    if (!this.database || !this.projectId) return null;

    try {
      await this.publishLog(
        `🔐 Retrieving database credentials for ${this.database}...`
      );
      const credentials = await getDatabaseCredentials({
        projectId: this.projectId,
        database: this.database,
        publishLog: this.publishLog,
      });

      if (!credentials) {
        await this.publishLog(
          `⚠️ No database credentials found for ${this.database}`
        );
        return null;
      }

      let databaseUrl;
      switch (this.database) {
        case "mysql":
          databaseUrl = `mysql://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.database}`;
          break;
        case "postgresql":
          databaseUrl = `postgresql://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.database}`;
          break;
        default:
          await this.publishLog(
            `⚠️ Unsupported database type: ${this.database}`
          );
          return null;
      }

      await this.publishLog(`✅ Database URL constructed for ${this.database}`);
      return databaseUrl;
    } catch (error) {
      await this.publishLog(
        `❌ Failed to retrieve database credentials: ${error.message}`
      );
      return null;
    }
  }

  async handlePrismaSetup() {
    await this.publishLog("🗄️ Setting up Prisma database...");

    const databaseUrl = await this.getDatabaseUrl();
    if (!databaseUrl) {
      await this.publishLog(
        "⚠️ No DATABASE_URL available, skipping Prisma setup"
      );
      return false;
    }

    process.env.DATABASE_URL = databaseUrl;
    await this.publishLog(
      "🔗 DATABASE_URL environment variable set for Prisma"
    );

    await runCommand({
      command: "npx prisma generate",
      cwd: this.projectPath,
      publishLog: this.publishLog,
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });

    const migrationsDir = path.join(this.projectPath, "prisma", "migrations");
    if (fs.existsSync(migrationsDir)) {
      await this.publishLog(
        "📋 Found migrations directory, running migrations..."
      );
      await runCommand({
        command: "npx prisma migrate deploy",
        cwd: this.projectPath,
        publishLog: this.publishLog,
        env: { ...process.env, DATABASE_URL: databaseUrl },
      });
    } else {
      await this.publishLog(
        "📋 No migrations found, creating initial schema..."
      );
      await runCommand({
        command: "npx prisma db push",
        cwd: this.projectPath,
        publishLog: this.publishLog,
        env: { ...process.env, DATABASE_URL: databaseUrl },
      });
    }

    return true;
  }

  async handleNodeJS() {
    await this.publishLog("🚀 Setting up Node.js REST API deployment...");

    await this.publishLog("📦 Installing npm dependencies...");
    await runCommand({
      command: "npm install",
      cwd: this.projectPath,
      publishLog: this.publishLog,
    });

    if (this.database && this.usesPrisma()) {
      await this.handlePrismaSetup();
    }

    const isPrismaApp = this.framework === "nodejs-prisma" || this.usesPrisma();

    const packageJsonPath = path.join(this.projectPath, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const scripts = packageJson.scripts || {};

    let startCommand = "npm start";
    if (scripts.dev && !scripts.start) {
      startCommand = "npm run dev";
    } else if (scripts.prod) {
      startCommand = "npm run prod";
    } else if (scripts.start) {
      startCommand = "npm start";
    } else {
      startCommand = "node index.js";
    }

    const port = this.environment?.PORT
      ? parseInt(this.environment.PORT)
      : 3000;

    return {
      type: isPrismaApp ? "nodejs-prisma" : "nodejs",
      port: port,
      startCommand,
      needsDatabase: !!this.database,
      buildOutput: this.projectPath,
    };
  }

  async handleVite() {
    await this.publishLog("🚀 Setting up Vite Frontend deployment...");

    await this.publishLog("📦 Installing npm dependencies...");
    await runCommand({
      command: "npm install",
      cwd: this.projectPath,
      publishLog: this.publishLog,
    });

    const envPath = path.join(this.projectPath, ".env");
    let envContent = "# Environment variables for Vite build\n";

    if (this.environment && Object.keys(this.environment).length > 0) {
      await this.publishLog(
        `🔧 Injecting ${
          Object.keys(this.environment).length
        } environment variables...`
      );
      for (const [key, value] of Object.entries(this.environment)) {
        envContent += `${key}=${value}\n`;
      }
    }

    fs.writeFileSync(envPath, envContent);

    await this.publishLog("🔨 Building Vite application...");
    await runCommand({
      command: "npm run build",
      cwd: this.projectPath,
      publishLog: this.publishLog,
    });

    const distPath = path.join(this.projectPath, "dist");
    if (!fs.existsSync(distPath)) {
      throw new Error("Vite build failed: dist directory not found");
    }

    return {
      type: "vite",
      port: 5000,
      startCommand: "npm run preview -- --host 0.0.0.0 --port 5000",
      needsDatabase: false,
      buildOutput: distPath,
      isStatic: true,
    };
  }

  async handleStatic() {
    await this.publishLog("🚀 Setting up Static Site deployment...");

    const packageJsonPath = path.join(this.projectPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      await this.publishLog("📦 Installing dependencies and building...");
      await runCommand({
        command: "npm install",
        cwd: this.projectPath,
        publishLog: this.publishLog,
      });

      try {
        await runCommand({
          command: "npm run build",
          cwd: this.projectPath,
          publishLog: this.publishLog,
        });
      } catch (error) {
        await this.publishLog(
          "ℹ️ No build command found, using static files as-is"
        );
      }
    }

    let staticDir = this.projectPath;
    const possibleDirs = ["dist", "build", "public", "out"];

    for (const dir of possibleDirs) {
      const dirPath = path.join(this.projectPath, dir);
      if (fs.existsSync(dirPath)) {
        staticDir = dirPath;
        break;
      }
    }

    return {
      type: "static",
      port: 5000,
      startCommand: "",
      needsDatabase: false,
      buildOutput: staticDir,
      isStatic: true,
    };
  }

  usesPrisma() {
    const prismaSchemaPath = path.join(
      this.projectPath,
      "prisma/schema.prisma"
    );
    const schemaPath = path.join(this.projectPath, "schema.prisma");
    return fs.existsSync(prismaSchemaPath) || fs.existsSync(schemaPath);
  }

  async handle() {
    await this.publishLog(`🔧 Processing framework: ${this.framework}`);

    switch (this.framework) {
      case "nodejs":
      case "nodejs-prisma":
        return await this.handleNodeJS();
      case "vite":
        return await this.handleVite();
      case "static":
        return await this.handleStatic();
      default:
        throw new Error(`Unsupported framework: ${this.framework}`);
    }
  }
}

// Environment setup helper
export async function setupEnvironment(
  projectPath,
  framework,
  database,
  publishLog
) {
  await publishLog("🔧 Setting up environment configuration...");

  const envFiles = {
    nodejs: ".env",
    vite: ".env",
    static: ".env",
  };

  const envFile = envFiles[framework] || ".env";
  const envPath = path.join(projectPath, envFile);

  // Create .env file if it doesn't exist
  if (!fs.existsSync(envPath)) {
    await publishLog(`📝 Creating ${envFile} file...`);
    fs.writeFileSync(
      envPath,
      "# Environment variables will be injected by the deployment system\n"
    );
  }

  return envPath;
}
