import pkg from "@aws-sdk/client-cloudfront";
const { CreateDistributionCommand } = pkg;
import { cloudfrontClient } from "./aws-config.js";

export async function createCloudFrontDistribution(props) {
  const { 
    bucketName, 
    projectId, 
    publishLog 
  } = props;
  
  await publishLog(`🌐 Creating CloudFront distribution for: ${bucketName}`);
  
  const distributionConfig = {
    CallerReference: `${projectId}-${Date.now()}`,
    Comment: `Static website distribution for ${projectId}`,
    DefaultCacheBehavior: {
      TargetOriginId: bucketName,
      ViewerProtocolPolicy: "redirect-to-https",
      AllowedMethods: {
        Quantity: 7,
        Items: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
        CachedMethods: {
          Quantity: 2,
          Items: ["GET", "HEAD"],
        },
      },
      ForwardedValues: {
        QueryString: false,
        Cookies: {
          Forward: "none",
        },
      },
      MinTTL: 0,
      DefaultTTL: 86400,
      MaxTTL: 31536000,
    },
    Enabled: true,
    Origins: {
      Quantity: 1,
      Items: [
        {
          Id: bucketName,
          DomainName: `${bucketName}.s3-website.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com`,
          CustomOriginConfig: {
            HTTPPort: 80,
            HTTPSPort: 443,
            OriginProtocolPolicy: "http-only",
          },
        },
      ],
    },
    DefaultRootObject: "index.html",
    CustomErrorResponses: {
      Quantity: 1,
      Items: [
        {
          ErrorCode: 404,
          ResponsePagePath: "/error.html",
          ResponseCode: "200",
        },
      ],
    },
  };
  
  try {
    const result = await cloudfrontClient().send(new CreateDistributionCommand({
      DistributionConfig: distributionConfig,
    }));
    
    const distributionUrl = `https://${result.Distribution.DomainName}`;
    
    await publishLog(`✅ CloudFront distribution created: ${distributionUrl}`);
    await publishLog(`⏳ Distribution is being deployed (may take 10-15 minutes)...`);
    
    return {
      distributionId: result.Distribution.Id,
      domainName: result.Distribution.DomainName,
      url: distributionUrl,
    };
  } catch (error) {
    await publishLog(`❌ Failed to create CloudFront distribution: ${error.message}`);
    throw error;
  }
}

 