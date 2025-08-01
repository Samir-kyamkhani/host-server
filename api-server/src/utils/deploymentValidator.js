import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const validateDeploymentRequest = (data) => {
  const errors = [];

  // Required fields
  if (!data.name || data.name.trim().length === 0) {
    errors.push('Project name is required');
  }

  if (!data.gitUrl || data.gitUrl.trim().length === 0) {
    errors.push('Git URL is required');
  }

  if (!data.framework || data.framework.trim().length === 0) {
    errors.push('Framework is required');
  }

  // Validate Git URL format
  const gitUrlRegex = /^https:\/\/github\.com\/[^\/]+\/[^\/]+\.git$/;
  if (!gitUrlRegex.test(data.gitUrl)) {
    errors.push('Invalid Git URL format. Must be a GitHub repository URL ending with .git');
  }

  // Validate framework
  const supportedFrameworks = ['node', 'vite', 'nextjs', 'nextjs-prisma', 'laravel', 'static'];
  if (!supportedFrameworks.includes(data.framework)) {
    errors.push(`Unsupported framework. Supported: ${supportedFrameworks.join(', ')}`);
  }

  // Validate database
  if (data.db) {
    const supportedDatabases = ['mysql', 'postgres'];
    if (!supportedDatabases.includes(data.db)) {
      errors.push(`Unsupported database. Supported: ${supportedDatabases.join(', ')}`);
    }
  }

  // Validate environment variables
  if (data.envVars && Array.isArray(data.envVars)) {
    data.envVars.forEach((envVar, index) => {
      if (!envVar.key || envVar.key.trim().length === 0) {
        errors.push(`Environment variable at index ${index} must have a key`);
      }
      if (envVar.value === undefined || envVar.value === null) {
        errors.push(`Environment variable ${envVar.key} must have a value`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const generateUniqueSubdomain = async (projectName) => {
  const baseSubdomain = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  let subdomain = baseSubdomain;
  let counter = 1;

  while (true) {
    const existingProject = await prisma.project.findUnique({
      where: { subdomain }
    });

    if (!existingProject) {
      break;
    }

    subdomain = `${baseSubdomain}-${counter}`;
    counter++;
  }

  return subdomain;
};

export { validateDeploymentRequest, generateUniqueSubdomain }; 