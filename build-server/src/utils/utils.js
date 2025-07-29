import { v4 as uuidv4 } from "uuid";
import { generateSlug } from "random-word-slugs";
import axios from "axios";
import { exec } from "child_process";

export async function publishLog(props) {
  const { message, deploymentId, projectId, apiBaseUrl } = props;
  
  console.log(`[${new Date().toISOString()}] ${message}`);
  
  if (apiBaseUrl) {
    try {
      await axios.post(`${apiBaseUrl}/logs`, {
        deploymentId,
        projectId,
        message,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("❌ Failed to send log:", err.message);
    }
  }
}

export function detectFramework(props) {
  const { framework, db } = props;
  const frameworkLower = framework?.toLowerCase();
  
  switch (frameworkLower) {
    case "laravel":
      return "laravel";
    case "nextjs":
    case "next.js":
      return db ? "nextjs-prisma" : "nextjs";
    case "node":
    case "nodejs":
      return db ? "nodejs-prisma" : "nodejs";
    case "static":
      return "static";
    default:
      return "nodejs";
  }
}

export function readProjectConfig(props) {
  const { name, gitUrl, framework, db, envVars } = props;
  
  const detectedFramework = detectFramework({ framework, db });
  
  const environment = {};
  if (envVars && Array.isArray(envVars)) {
    envVars.forEach(envVar => {
      if (envVar.key && envVar.value !== undefined) {
        environment[envVar.key] = envVar.value;
      }
    });
  }
  
  return {
    name: name || "My App",
    gitUrl,
    framework: detectedFramework,
    database: db || "mysql",
    environment,
    port: 3000,
    buildCommand: "",
    startCommand: "",
    outputDir: "",
  };
}

export function generateDeploymentConfig(props) {
  const {
    deploymentId = uuidv4(),
    projectId = uuidv4(),
    subdomain = generateSlug(3, { format: "kebab" }),
    region = process.env.AWS_REGION || "us-east-1",
    vpcId = process.env.VPC_ID,
    subnetIds = process.env.SUBNET_IDS?.split(",") || [],
    securityGroupIds = process.env.SECURITY_GROUP_IDS?.split(",") || [],
  } = props;
  
  return {
    projectId,
    deploymentId,
    subdomain,
    region,
    vpcId,
    subnetIds,
    securityGroupIds,
  };
}

export async function updateDeploymentStatus(props) {
  const {
    status,
    deploymentId,
    projectId,
    apiBaseUrl,
    url,
    framework,
    database,
    error,
  } = props;
  
  if (!apiBaseUrl) return;
  
  try {
    const endpoint = status === "failed" 
      ? `${apiBaseUrl}/deployments/${deploymentId}/failed`
      : `${apiBaseUrl}/deployments/${deploymentId}/complete`;
    
    const payload = {
      status,
      projectId,
      ...(url && { url }),
      ...(framework && { framework }),
      ...(database && { database }),
      ...(error && { error }),
    };
    
    await axios.post(endpoint, payload);
  } catch (updateError) {
    console.error("Failed to update deployment status:", updateError.message);
  }
}

export function runCommand(props) {
  const { command, cwd, publishLog } = props;
  
  return new Promise((resolve, reject) => {
    const proc = exec(command, { cwd });

    proc.stdout.on("data", async (data) => {
      await publishLog(data.toString().trim());
    });

    proc.stderr.on("data", async (data) => {
      await publishLog(`[stderr] ${data.toString().trim()}`);
    });

    proc.on("close", async (code) => {
      if (code === 0) return resolve();
      const msg = `❌ Command failed: "${command}" with exit code ${code}`;
      await publishLog(msg);
      reject(msg);
    });
  });
} 