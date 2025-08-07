import pkg from "@aws-sdk/client-cloudwatch-logs";
const { CreateLogGroupCommand } = pkg;
import { logsClient } from "../config/aws-config.js";

export async function createECSLogGroup(props) {
  const { projectId, taskDefinitionName, region, publishLog } = props;
  
  const logGroupName = `/ecs/${taskDefinitionName}`;
  
  await publishLog(`📊 Creating CloudWatch log group: ${logGroupName}`);
  
  try {
    await logsClient().send(new CreateLogGroupCommand({
      logGroupName,
    }));
    
    await publishLog(`✅ CloudWatch log group created: ${logGroupName}`);
    return logGroupName;
  } catch (error) {
    if (error.name === "ResourceAlreadyExistsException") {
      await publishLog(`ℹ️ CloudWatch log group already exists: ${logGroupName}`);
      return logGroupName;
    }
    throw error;
  }
} 