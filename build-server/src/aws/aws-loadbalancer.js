import pkg from "@aws-sdk/client-elastic-load-balancing-v2";
const { CreateLoadBalancerCommand, CreateTargetGroupCommand, CreateListenerCommand } = pkg;
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
  
  await publishLog(`🏗️ Creating target group: ${targetGroupName}`);
  
  try {
    const tgResult = await elbClient().send(new CreateTargetGroupCommand({
      Name: targetGroupName,
      Protocol: "HTTP",
      Port: port,
      VpcId: vpcId,
      TargetType: "ip",
      HealthCheckProtocol: "HTTP",
      HealthCheckPath: "/",
      HealthCheckIntervalSeconds: 30,
      HealthCheckTimeoutSeconds: 5,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 2,
      Matcher: {
        HttpCode: "200",
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
  
  await publishLog(`🏗️ Creating listener on port ${port}`);
  
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
  
  await publishLog(`🌐 Setting up complete load balancer configuration`);
  
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
    port,
    publishLog,
  });
  
  await publishLog(`✅ Complete load balancer setup finished`);
  
  return {
    loadBalancerArn: lbConfig.loadBalancerArn,
    targetGroupArn,
    dnsName: lbConfig.dnsName,
  };
} 