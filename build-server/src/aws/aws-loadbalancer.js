import pkg from "@aws-sdk/client-elastic-load-balancing-v2";
const { CreateLoadBalancerCommand, CreateTargetGroupCommand, CreateListenerCommand, DescribeTargetHealthCommand, DescribeLoadBalancersCommand } = pkg;
import { elbClient } from "./aws-config.js";

export async function createLoadBalancer(props) {
  const { projectId, subnetIds, securityGroupIds, publishLog } = props;
  const lbName = `${projectId}-alb`;
  
  await publishLog(`🏗️ Creating Application Load Balancer: ${lbName}`);
  
  try {
    const lbResult = await elbClient().send(new CreateLoadBalancerCommand({
      Name: lbName,
      Subnets: subnetIds,
      SecurityGroups: securityGroupIds,
      Scheme: "internet-facing",
      Type: "application",
      IpAddressType: "ipv4",
    }));
    
    const lbArn = lbResult.LoadBalancers[0].LoadBalancerArn;
    const lbDnsName = lbResult.LoadBalancers[0].DNSName;
    
    await publishLog(`✅ Load Balancer created: ${lbName}`);
    
    return {
      loadBalancerArn: lbArn,
      dnsName: lbDnsName,
      name: lbName,
    };
  } catch (error) {
    await publishLog(`❌ Failed to create load balancer: ${error.message}`);
    throw error;
  }
}

export async function createTargetGroup(props) {
  const { projectId, port, vpcId, publishLog } = props;
  const targetGroupName = `${projectId}-tg`;
  
  await publishLog(`🏗️ Creating target group: ${targetGroupName} on port ${port}`);
  
  try {
    const tgResult = await elbClient().send(new CreateTargetGroupCommand({
      Name: targetGroupName,
      Protocol: "HTTP",
      Port: port,
      VpcId: vpcId,
      TargetType: "ip",
      HealthCheckProtocol: "HTTP",
      HealthCheckPath: "/",
      HealthCheckPort: port.toString(),
      HealthCheckEnabled: true,
      HealthCheckIntervalSeconds: 30,
      HealthCheckTimeoutSeconds: 5,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 2,
      Matcher: {
        HttpCode: "200,302,404", // Accept 200, 302 (redirect), and 404 (at least the server is responding)
      },
    }));
    
    const tgArn = tgResult.TargetGroups[0].TargetGroupArn;
    
    await publishLog(`✅ Target group created: ${targetGroupName}`);
    
    return tgArn;
  } catch (error) {
    await publishLog(`❌ Failed to create target group: ${error.message}`);
    throw error;
  }
}

export async function createListener(props) {
  const { 
    loadBalancerArn, 
    targetGroupArn, 
    port = 80, 
    protocol = "HTTP", 
    publishLog 
  } = props;
  
  await publishLog(`🏗️ Creating listener on port ${port} forwarding to target group`);
  
  try {
    const listenerResult = await elbClient().send(new CreateListenerCommand({
      LoadBalancerArn: loadBalancerArn,
      Protocol: protocol,
      Port: port,
      DefaultActions: [
        {
          Type: "forward",
          TargetGroupArn: targetGroupArn,
        },
      ],
    }));
    
    const listenerArn = listenerResult.Listeners[0].ListenerArn;
    
    await publishLog(`✅ Listener created on port ${port}`);
    
    return listenerArn;
  } catch (error) {
    await publishLog(`❌ Failed to create listener: ${error.message}`);
    throw error;
  }
}

export async function createCompleteLoadBalancerSetup(props) {
  const { 
    projectId, 
    subnetIds, 
    securityGroupIds, 
    vpcId, 
    port, 
    publishLog 
  } = props;
  
  await publishLog(`🌐 Setting up complete load balancer configuration (ALB:80 -> Target:${port})`);
  
  const lbConfig = await createLoadBalancer({
    projectId,
    subnetIds,
    securityGroupIds,
    publishLog,
  });
  
  const targetGroupArn = await createTargetGroup({
    projectId,
    port,
    vpcId,
    publishLog,
  });
  
  await createListener({
    loadBalancerArn: lbConfig.loadBalancerArn,
    targetGroupArn,
    port: 80, // ALB listens on port 80, forwards to target group on port 3000
    publishLog,
  });
  
  await publishLog(`✅ Complete load balancer setup finished`);
  
  // Check initial status
  await checkLoadBalancerStatus(lbConfig.loadBalancerArn, publishLog);
  
  return {
    loadBalancerArn: lbConfig.loadBalancerArn,
    targetGroupArn,
    dnsName: lbConfig.dnsName,
  };
} 

export async function checkTargetGroupHealth(targetGroupArn, publishLog) {
  try {
    await publishLog(`🔍 Checking target group health status...`);
    
    const result = await elbClient().send(new DescribeTargetHealthCommand({
      TargetGroupArn: targetGroupArn,
    }));
    
    const targets = result.TargetHealthDescriptions || [];
    await publishLog(`📊 Target group has ${targets.length} registered targets`);
    
    for (const target of targets) {
      const health = target.TargetHealth?.State || 'unknown';
      const reason = target.TargetHealth?.Reason || 'none';
      const port = target.Target?.Port || 'unknown';
      const ip = target.Target?.Id || 'unknown';
      
      await publishLog(`🎯 Target ${ip}:${port} - Health: ${health} (${reason})`);
    }
    
    return targets;
  } catch (error) {
    await publishLog(`❌ Failed to check target group health: ${error.message}`);
    throw error;
  }
}

export async function waitForHealthyTargets(targetGroupArn, publishLog, maxAttempts = 10) {
  await publishLog(`⏳ Waiting for targets to become healthy (max ${maxAttempts} attempts)...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await publishLog(`🔄 Health check attempt ${attempt}/${maxAttempts}...`);
    
    try {
      const targets = await checkTargetGroupHealth(targetGroupArn, publishLog);
      
      if (targets.length === 0) {
        await publishLog(`⚠️ No targets registered yet, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
        continue;
      }
      
      const healthyTargets = targets.filter(target => 
        target.TargetHealth?.State === 'healthy'
      );
      
      if (healthyTargets.length > 0) {
        await publishLog(`✅ Found ${healthyTargets.length} healthy target(s)!`);
        return healthyTargets;
      } else {
        await publishLog(`⚠️ No healthy targets yet, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
      }
    } catch (error) {
      await publishLog(`❌ Health check failed: ${error.message}`);
      if (attempt === maxAttempts) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
    }
  }
  
  throw new Error(`Targets did not become healthy after ${maxAttempts} attempts`);
}

export async function checkLoadBalancerStatus(loadBalancerArn, publishLog) {
  try {
    await publishLog(`🔍 Checking load balancer status...`);
    
    const result = await elbClient().send(new DescribeLoadBalancersCommand({
      LoadBalancerArns: [loadBalancerArn],
    }));
    
    if (result.LoadBalancers && result.LoadBalancers.length > 0) {
      const lb = result.LoadBalancers[0];
      const state = lb.State?.Code || 'unknown';
      const dnsName = lb.DNSName || 'unknown';
      
      await publishLog(`🌐 Load Balancer Status: ${state}`);
      await publishLog(`🌐 Load Balancer DNS: ${dnsName}`);
      
      return lb;
    } else {
      await publishLog(`❌ Load balancer not found`);
      return null;
    }
  } catch (error) {
    await publishLog(`❌ Failed to check load balancer status: ${error.message}`);
    throw error;
  }
} 