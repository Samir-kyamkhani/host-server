import pkg from "@aws-sdk/client-cloudwatch-logs";
const { CreateLogGroupCommand, PutLogEventsCommand } = pkg;
import { logsClient } from "./aws-config.js";

export async function createLogGroup(props) {
  const { logGroupName, publishLog } = props;
  
  await publishLog(`🏗️ Creating CloudWatch log group: ${logGroupName}`);
  
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

export async function createECSLogGroup(props) {
  const { projectId, publishLog } = props;
  
  const logGroupName = `/ecs/${projectId}-task`;
  
  return await createLogGroup({
    logGroupName,
    publishLog,
  });
}

export async function putLogEvents(props) {
  const { logGroupName, logStreamName, logEvents, publishLog } = props;
  
  await publishLog(`📝 Putting log events to: ${logGroupName}/${logStreamName}`);
  
  try {
    await logsClient().send(new PutLogEventsCommand({
      logGroupName,
      logStreamName,
      logEvents: logEvents.map(event => ({
        timestamp: event.timestamp || Date.now(),
        message: event.message,
      })),
    }));
    
    await publishLog(`✅ Log events sent to CloudWatch`);
  } catch (error) {
    await publishLog(`❌ Failed to send log events: ${error.message}`);
    throw error;
  }
}

export async function createApplicationLogGroup(props) {
  const { projectId, publishLog } = props;
  
  const logGroupName = `/applications/${projectId}`;
  
  return await createLogGroup({
    logGroupName,
    publishLog,
  });
} 