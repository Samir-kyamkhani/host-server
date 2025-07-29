import axios from "axios";

export class APIServerCommunication {
  constructor(props) {
    const { apiServerUrl, apiKey, deploymentId, projectId } = props;
    this.apiServerUrl = apiServerUrl;
    this.apiKey = apiKey;
    this.deploymentId = deploymentId;
    this.projectId = projectId;
    this.axiosInstance = axios.create({
      baseURL: apiServerUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  async sendLog(props) {
    const { message, level = 'info' } = props;
    
    try {
      await this.axiosInstance.post('/api/logs', {
        deploymentId: this.deploymentId,
        projectId: this.projectId,
        message,
        level,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Failed to send log to API server: ${error.message}`);
      if (error.response) {
        console.error(`Status: ${error.response.status}, Data:`, error.response.data);
      }
    }
  }

  async updateDeploymentStatus(props) {
    const { status, url = null, error = null, framework = null, database = null } = props;
    
    try {
      await this.axiosInstance.post(`/api/deployments/${this.deploymentId}/status`, {
        status,
        url,
        error,
        framework,
        database,
        projectId: this.projectId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Failed to update deployment status: ${error.message}`);
      if (error.response) {
        console.error(`Status: ${error.response.status}, Data:`, error.response.data);
      }
    }
  }

  async getProjectConfig() {
    try {
      const response = await this.axiosInstance.get(`/api/projects/${this.projectId}/config`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get project config: ${error.message}`);
    }
  }

  async updateProjectStatus(props) {
    const { status, url = null, error = null } = props;
    
    try {
      await this.axiosInstance.put(`/api/projects/${this.projectId}`, {
        status,
        url,
        error,
        lastDeployment: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Failed to update project status: ${error.message}`);
      if (error.response) {
        console.error(`Status: ${error.response.status}, Data:`, error.response.data);
      }
    }
  }

  async sendHealthCheck() {
    try {
      await this.axiosInstance.post('/api/health', {
        deploymentId: this.deploymentId,
        projectId: this.projectId,
        status: 'healthy',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Failed to send health check: ${error.message}`);
      if (error.response) {
        console.error(`Status: ${error.response.status}, Data:`, error.response.data);
      }
    }
  }
}

export function createAPIServerCommunication(props) {
  const { 
    apiServerUrl, 
    apiKey, 
    deploymentId, 
    projectId 
  } = props;

  if (!apiServerUrl || !apiKey) {
    console.warn(`⚠️ API Server URL: ${apiServerUrl} or API Key: ${apiKey} not provided. Using local logging only.`);
    return {
      sendLog: async ({ message }) => {
        console.log(`[${new Date().toISOString()}] ${message}`);
      },
      updateDeploymentStatus: async (props) => {
        console.log('Deployment Status:', props);
      },
      getProjectConfig: async () => {
        throw new Error('API Server communication not configured');
      },
      updateProjectStatus: async (props) => {
        console.log('Project Status:', props);
      },
      sendHealthCheck: async () => {
        console.log('Health check sent');
      }
    };
  }

  return new APIServerCommunication({
    apiServerUrl,
    apiKey,
    deploymentId,
    projectId
  });
}

export function extractAPIServerConfig(envVars) {
  const apiServerUrl = envVars.find(v => v.key === 'API_SERVER_URL')?.value;
  const apiKey = envVars.find(v => v.key === 'API_KEY')?.value;
  
  return { apiServerUrl, apiKey };
} 