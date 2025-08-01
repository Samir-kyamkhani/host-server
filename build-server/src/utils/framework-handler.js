import path from "path";
import fs from "fs";
import { runCommand } from "./utils.js";
import { getDatabaseCredentials } from "../aws/aws-secrets-manager.js";

// Framework-specific deployment handlers
export class FrameworkHandler {
  constructor(projectPath, framework, database, publishLog, projectId) {
    this.projectPath = projectPath;
    this.framework = framework;
    this.database = database;
    this.publishLog = publishLog;
    this.projectId = projectId;
  }

  // Helper method to get database URL from AWS Secrets Manager
  async getDatabaseUrl() {
    if (!this.database || !this.projectId) {
      return null;
    }

    try {
      await this.publishLog(`🔐 Retrieving database credentials for ${this.database}...`);
      const credentials = await getDatabaseCredentials({
        projectId: this.projectId,
        database: this.database,
        publishLog: this.publishLog
      });

      if (!credentials) {
        await this.publishLog(`⚠️ No database credentials found for ${this.database}`);
        return null;
      }

      // Construct DATABASE_URL based on database type
      let databaseUrl;
      if (this.database === 'mysql') {
        databaseUrl = `mysql://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.database}`;
      } else if (this.database === 'postgresql') {
        databaseUrl = `postgresql://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.database}`;
      } else {
        await this.publishLog(`⚠️ Unsupported database type: ${this.database}`);
        return null;
      }

      await this.publishLog(`✅ Database URL constructed for ${this.database}`);
      return databaseUrl;
    } catch (error) {
      await this.publishLog(`❌ Failed to retrieve database credentials: ${error.message}`);
      return null;
    }
  }

  // Laravel Fullstack Handler
  async handleLaravel() {
    await this.publishLog("🚀 Setting up Laravel Fullstack deployment...");
    
    // Install Composer dependencies
    await this.publishLog("📦 Installing Composer dependencies...");
    await runCommand({
      command: "composer install --no-dev --optimize-autoloader",
      cwd: this.projectPath,
      publishLog: this.publishLog,
    });

    // Copy .env.example to .env if it doesn't exist
    const envPath = path.join(this.projectPath, ".env");
    const envExamplePath = path.join(this.projectPath, ".env.example");
    
    if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
      await this.publishLog("📝 Creating .env file from .env.example...");
      await runCommand({
        command: "cp .env.example .env",
        cwd: this.projectPath,
        publishLog: this.publishLog,
      });
    }

    // Generate application key
    await this.publishLog("🔑 Generating Laravel application key...");
    await runCommand({
      command: "php artisan key:generate",
      cwd: this.projectPath,
      publishLog: this.publishLog,
    });

    // Run database migrations
    if (this.database) {
      await this.publishLog("🗄️ Running Laravel database migrations...");
      await runCommand({
        command: "php artisan migrate --force",
        cwd: this.projectPath,
        publishLog: this.publishLog,
      });
    }

    // Optimize for production
    await this.publishLog("⚡ Optimizing Laravel for production...");
    await runCommand({
      command: "php artisan config:cache && php artisan route:cache && php artisan view:cache",
      cwd: this.projectPath,
      publishLog: this.publishLog,
    });

    return {
      type: "laravel",
      port: 80,
      startCommand: "php artisan serve --host=0.0.0.0 --port=80",
      needsDatabase: true,
      buildOutput: this.projectPath,
    };
  }

  // Next.js Fullstack Handler
  async handleNextJS() {
    await this.publishLog("🚀 Setting up Next.js Fullstack deployment...");
    
    // Install npm dependencies
    await this.publishLog("📦 Installing npm dependencies...");
    await runCommand({
      command: "npm install",
      cwd: this.projectPath,
      publishLog: this.publishLog,
    });

    // Create .env.local file for Next.js if environment variables exist
    const envPath = path.join(this.projectPath, ".env.local");
    if (!fs.existsSync(envPath)) {
      await this.publishLog("📝 Creating .env.local file for Next.js...");
      fs.writeFileSync(envPath, "# Environment variables for Next.js\n");
    }

    // Handle Prisma if database is configured
    if (this.database && this.usesPrisma()) {
      await this.publishLog("🗄️ Setting up Prisma database...");
      
      // Get database URL from AWS Secrets Manager
      const databaseUrl = await this.getDatabaseUrl();
      
      if (databaseUrl) {
        // Set DATABASE_URL environment variable for Prisma commands
        process.env.DATABASE_URL = databaseUrl;
        await this.publishLog("🔗 DATABASE_URL environment variable set for Prisma");
      } else {
        await this.publishLog("⚠️ No DATABASE_URL available, skipping Prisma setup");
        return {
          type: "nextjs",
          port: 3000,
          startCommand: "npm start",
          needsDatabase: false,
          buildOutput: this.projectPath,
        };
      }
      
      await runCommand({
        command: "npx prisma generate",
        cwd: this.projectPath,
        publishLog: this.publishLog,
        env: { ...process.env, DATABASE_URL: databaseUrl }
      });
      
      // Check if migrations directory exists
      const migrationsDir = path.join(this.projectPath, "prisma", "migrations");
      if (fs.existsSync(migrationsDir)) {
        await this.publishLog("📋 Found migrations directory, running migrations...");
        await runCommand({
          command: "npx prisma migrate deploy",
          cwd: this.projectPath,
          publishLog: this.publishLog,
          env: { ...process.env, DATABASE_URL: databaseUrl }
        });
      } else {
        await this.publishLog("📋 No migrations found, creating initial schema...");
        await runCommand({
          command: "npx prisma db push",
          cwd: this.projectPath,
          publishLog: this.publishLog,
          env: { ...process.env, DATABASE_URL: databaseUrl }
        });
      }
    }

    // Build Next.js application
    await this.publishLog("🔨 Building Next.js application...");
    await runCommand({
      command: "npm run build",
      cwd: this.projectPath,
      publishLog: this.publishLog,
    });

    // Check if this is a Prisma-specific Next.js app
    const isPrismaApp = this.framework === "nextjs-prisma" || this.usesPrisma();

    return {
      type: isPrismaApp ? "nextjs-prisma" : "nextjs",
      port: 3000,
      startCommand: "npm start",
      needsDatabase: !!this.database,
      buildOutput: this.projectPath,
    };
  }

  // Node.js REST API Handler
  async handleNodeJS() {
    await this.publishLog("🚀 Setting up Node.js REST API deployment...");
    
    // Install npm dependencies
    await this.publishLog("📦 Installing npm dependencies...");
    await runCommand({
      command: "npm install",
      cwd: this.projectPath,
      publishLog: this.publishLog,
    });

    // Handle Prisma if database is configured
    if (this.database && this.usesPrisma()) {
      await this.publishLog("🗄️ Setting up Prisma database...");
      
      // Get database URL from AWS Secrets Manager
      const databaseUrl = await this.getDatabaseUrl();
      
      if (databaseUrl) {
        // Set DATABASE_URL environment variable for Prisma commands
        process.env.DATABASE_URL = databaseUrl;
        await this.publishLog("🔗 DATABASE_URL environment variable set for Prisma");
      } else {
        await this.publishLog("⚠️ No DATABASE_URL available, skipping Prisma setup");
        return {
          type: "nodejs",
          port: 3000,
          startCommand: "npm start",
          needsDatabase: false,
          buildOutput: this.projectPath,
        };
      }
      
      await runCommand({
        command: "npx prisma generate",
        cwd: this.projectPath,
        publishLog: this.publishLog,
        env: { ...process.env, DATABASE_URL: databaseUrl }
      });
      
      // Check if migrations directory exists
      const migrationsDir = path.join(this.projectPath, "prisma", "migrations");
      if (fs.existsSync(migrationsDir)) {
        await this.publishLog("📋 Found migrations directory, running migrations...");
        await runCommand({
          command: "npx prisma migrate deploy",
          cwd: this.projectPath,
          publishLog: this.publishLog,
          env: { ...process.env, DATABASE_URL: databaseUrl }
        });
      } else {
        await this.publishLog("📋 No migrations found, creating initial schema...");
        await runCommand({
          command: "npx prisma db push",
          cwd: this.projectPath,
          publishLog: this.publishLog,
          env: { ...process.env, DATABASE_URL: databaseUrl }
        });
      }
    }

    // Check if this is a Prisma-specific Node.js app
    const isPrismaApp = this.framework === "nodejs-prisma" || this.usesPrisma();
    
    // Determine start command based on package.json
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
      // Default to node index.js if no start script
      startCommand = "node index.js";
    }

    return {
      type: isPrismaApp ? "nodejs-prisma" : "nodejs",
      port: 3000,
      startCommand,
      needsDatabase: !!this.database,
      buildOutput: this.projectPath,
    };
  }

  // Vite Frontend Handler
  async handleVite() {
    await this.publishLog("🚀 Setting up Vite Frontend deployment...");
    
    // Install npm dependencies
    await this.publishLog("📦 Installing npm dependencies...");
    await runCommand({
      command: "npm install",
      cwd: this.projectPath,
      publishLog: this.publishLog,
    });

    // Create .env file for Vite with environment variables
    const envPath = path.join(this.projectPath, ".env");
    await this.publishLog("📝 Creating .env file for Vite with environment variables...");
    
    // Get environment variables from the deployment
    const envVars = process.env.ENV_VARS ? JSON.parse(process.env.ENV_VARS) : [];
    let envContent = "# Environment variables for Vite build\n";
    
    if (envVars && envVars.length > 0) {
      await this.publishLog(`🔧 Injecting ${envVars.length} environment variables...`);
      for (const envVar of envVars) {
        envContent += `${envVar.key}=${envVar.value}\n`;
        await this.publishLog(`  - ${envVar.key}=${envVar.value}`);
      }
    }
    
    fs.writeFileSync(envPath, envContent);

    // Build Vite application with environment variables
    await this.publishLog("🔨 Building Vite application with environment variables...");
    await runCommand({
      command: "npm run build",
      cwd: this.projectPath,
      publishLog: this.publishLog,
    });

    // Check if dist directory exists
    const distPath = path.join(this.projectPath, "dist");
    if (!fs.existsSync(distPath)) {
      throw new Error("Vite build failed: dist directory not found");
    }

    return {
      type: "vite",
      port: 3000,
      startCommand: "npm run preview -- --host 0.0.0.0 --port 3000",
      needsDatabase: false,
      buildOutput: distPath,
      isStatic: true,
    };
  }

  // Static Site Handler
  async handleStatic() {
    await this.publishLog("🚀 Setting up Static Site deployment...");
    
    // Check for package.json and run build if exists
    const packageJsonPath = path.join(this.projectPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      await this.publishLog("📦 Installing dependencies and building...");
      await runCommand({
        command: "npm install",
        cwd: this.projectPath,
        publishLog: this.publishLog,
      });
      
      // Try to run build command
      try {
        await runCommand({
          command: "npm run build",
          cwd: this.projectPath,
          publishLog: this.publishLog,
        });
      } catch (error) {
        await this.publishLog("ℹ️ No build command found, using static files as-is");
      }
    }

    // Determine static files directory
    let staticDir = this.projectPath;
    const possibleDirs = ["dist", "build", "public", "out"];
    
    for (const dir of possibleDirs) {
      const dirPath = path.join(this.projectPath, dir);
      if (fs.existsSync(dirPath)) {
        staticDir = dirPath;
        await this.publishLog(`📁 Using static files from: ${dir}`);
        break;
      }
    }

    return {
      type: "static",
      port: 80,
      startCommand: "",
      needsDatabase: false,
      buildOutput: staticDir,
      isStatic: true,
    };
  }

  // Check if project uses Prisma
  usesPrisma() {
    const prismaSchemaPath = path.join(this.projectPath, "prisma/schema.prisma");
    const schemaPath = path.join(this.projectPath, "schema.prisma");
    return fs.existsSync(prismaSchemaPath) || fs.existsSync(schemaPath);
  }

  // Main handler method
  async handle() {
    await this.publishLog(`🔧 Processing framework: ${this.framework}`);
    
    switch (this.framework) {
      case "laravel":
        return await this.handleLaravel();
      
      case "nextjs":
      case "nextjs-prisma":
        return await this.handleNextJS();
      
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

// Framework detection helper
export function detectFrameworkFromFiles(projectPath) {
  const files = fs.readdirSync(projectPath);
  
  // Check for Laravel
  if (files.includes("artisan") || files.includes("composer.json")) {
    return "laravel";
  }
  
  // Check for Next.js
  if (files.includes("next.config.js") || files.includes("next.config.mjs")) {
    return "nextjs";
  }
  
  // Check for Vite
  if (files.includes("vite.config.js") || files.includes("vite.config.ts")) {
    return "vite";
  }
  
  // Check for Node.js
  if (files.includes("package.json")) {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf8"));
    const scripts = packageJson.scripts || {};
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    // Check for Next.js
    if (scripts.start && scripts.start.includes("next")) {
      return "nextjs";
    }
    
    if (dependencies.next || dependencies["@next/font"]) {
      return "nextjs";
    }
    
    // Check for Vite
    if (scripts.dev && scripts.dev.includes("vite")) {
      return "vite";
    }
    
    if (dependencies.vite || dependencies["@vitejs/plugin-react"]) {
      return "vite";
    }
    
    // Check for Express.js or other Node.js frameworks
    if (dependencies.express || dependencies.koa || dependencies.fastify) {
      return "nodejs";
    }
    
    // Check for Prisma
    if (dependencies.prisma || files.includes("prisma/schema.prisma") || files.includes("schema.prisma")) {
      return "nodejs-prisma";
    }
    
    // Default Node.js app
    return "nodejs";
  }
  
  // Default to static
  return "static";
}

// Environment setup helper
export async function setupEnvironment(projectPath, framework, database, publishLog) {
  await publishLog("🔧 Setting up environment configuration...");
  
  const envFiles = {
    laravel: ".env",
    nextjs: ".env.local",
    nodejs: ".env",
    vite: ".env",
    static: ".env"
  };
  
  const envFile = envFiles[framework] || ".env";
  const envPath = path.join(projectPath, envFile);
  
  // Create .env file if it doesn't exist
  if (!fs.existsSync(envPath)) {
    await publishLog(`📝 Creating ${envFile} file...`);
    fs.writeFileSync(envPath, "# Environment variables will be injected by the deployment system\n");
  }
  
  return envPath;
} 