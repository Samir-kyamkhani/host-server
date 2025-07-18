import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime-types";
import axios from "axios";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const s3Client = new S3Client({
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3CLIENT_ACCESSKEYID,
    secretAccessKey: process.env.S3CLIENT_SECRETACCESSKEY,
  },
});

const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;
const subdomain = process.env.SUBDOMAIN;

async function publishLog(log) {
  try {
    await axios.post(`${process.env.API_BASE_URL}/logs`, {
      deploymentId: DEPLOYMENT_ID,
      message: log,
    });
  } catch (err) {
    console.error("❌ Failed to send log:", err.message);
  }
}

function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    const proc = exec(command, { cwd });

    proc.stdout.on("data", async (data) => {
      await publishLog(data.toString());
    });

    proc.stderr.on("data", async (data) => {
      await publishLog(`[stderr] ${data.toString()}`);
    });

    proc.on("close", async (code) => {
      if (code === 0) return resolve();
      const msg = `❌ Command failed: "${command}" with exit code ${code}`;
      await publishLog(msg);
      reject(msg);
    });
  });
}

function detectFramework(outDirPath) {
  const has = (file) => fs.existsSync(path.join(outDirPath, file));
  if (has("artisan")) return "laravel";
  if (has("next.config.js")) return "nextjs";
  if (has("vite.config.js") || has("vite.config.ts")) return "vite";
  if (has("package.json")) return "node";
  return "static";
}

function getOutputFolder(framework) {
  switch (framework) {
    case "vite":
    case "node":
      return "dist";
    case "nextjs":
      return ".next";
    case "laravel":
      return "public";
    case "static":
      return "output";
    default:
      return "dist";
  }
}

async function startNodeServer(outDirPath, startCmd, port) {
  await publishLog(`🚀 Starting Node.js server on port ${port}...`);

  const proc = exec(startCmd, { cwd: outDirPath });

  proc.stdout.on("data", async (data) => {
    await publishLog(data.toString());
  });

  proc.stderr.on("data", async (data) => {
    await publishLog(`[stderr] ${data.toString()}`);
  });

  proc.on("close", async (code) => {
    await publishLog(`🛑 Server exited with code ${code}`);
    process.exit(code);
  });
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

async function uploadToS3(folderPath) {
  await publishLog("⏫ Uploading files to S3...");
  const files = getAllFiles(folderPath);

  for (const filePath of files) {
    const relativePath = path.relative(folderPath, filePath);
    const fileStream = fs.createReadStream(filePath);
    const contentType = mime.lookup(filePath) || "application/octet-stream";

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: `__outputs/${subdomain}/${relativePath}`,
      Body: fileStream,
      ContentType: contentType,
    });

    await s3Client.send(command);
    await publishLog(
      `✅ Uploaded: ${relativePath} (${fs.statSync(filePath).size} bytes)`
    );
  }

  await publishLog("🎉 Upload complete");
}

// Write dynamic env vars into .env file inside outDirPath
function injectDynamicEnv(outDirPath) {
  const envLines = [];

  for (const key in process.env) {
    if (
      [
        "GIT_REPOSITORY__URL",
        "PROJECT_ID",
        "DEPLOYMENT_ID",
        "SUBDOMAIN",
      ].includes(key)
    )
      continue;

    if (key.startsWith("AWS_") || key.includes("NODE") || key === "PATH")
      continue;

    envLines.push(`${key}=${process.env[key]}`);
  }

  const envPath = path.join(outDirPath, ".env");
  fs.writeFileSync(envPath, envLines.join("\n"));
}

async function init() {
  await publishLog("🚀 Build Started...");

  const outDirPath = path.join(__dirname, "output");
  const configPath = path.join(outDirPath, ".host-server.json");

  let framework = detectFramework(outDirPath);
  let buildCmd = "";
  let startCmd = "";
  let outputDir = "";
  let port = 3000;

  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath));
    framework = config.framework || framework;
    buildCmd = config.build || "";
    startCmd = config.start || "";
    outputDir = config.output || "";
    port = config.port || 3000;
  }

  if (!buildCmd) {
    switch (framework) {
      case "vite":
      case "nextjs":
      case "node":
        buildCmd = "npm install && npm run build";
        break;
      case "laravel":
        buildCmd =
          "composer install && php artisan config:cache && php artisan route:cache";
        break;
      default:
        buildCmd = "echo 'No build needed'";
    }
  }

  outputDir = outputDir || getOutputFolder(framework);

  await publishLog(`🧠 Detected framework: ${framework}`);
  await publishLog(`🔧 Build command: ${buildCmd}`);

  // Inject dynamic env vars
  injectDynamicEnv(outDirPath);

  await runCommand(buildCmd, outDirPath);
  await publishLog("✅ Build successful");

  if (framework === "node") {
    if (!startCmd) {
      const pkgPath = path.join(outDirPath, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        startCmd = pkg.scripts?.start
          ? "npm start"
          : pkg.scripts?.dev
          ? "npm run dev"
          : "node index.js";
      } else {
        startCmd = "npm start";
      }
    }
    return await startNodeServer(outDirPath, startCmd, port);
  }

  const distPath =
    framework === "static" ? outDirPath : path.join(outDirPath, outputDir);

  if (!fs.existsSync(distPath)) {
    await publishLog(`❌ Output folder "${outputDir}" not found`);
    return process.exit(1);
  }

  await uploadToS3(distPath);
  process.exit(0);
}

init().catch(async (err) => {
  console.error(err);
  await publishLog(`❌ Build Error: ${err}`);
  process.exit(1);
});
