import pkg from "@aws-sdk/client-s3";
const { 
  PutObjectCommand, 
  CreateBucketCommand, 
  PutBucketWebsiteCommand,
  PutBucketPolicyCommand,
  PutPublicAccessBlockCommand,
  GetPublicAccessBlockCommand
} = pkg;
import { s3Client } from "./aws-config.js";
import fs from "fs";
import path from "path";

export async function createS3Bucket(props) {
  const { bucketName, region, publishLog } = props;
  
  await publishLog(`🏗️ Creating S3 bucket: ${bucketName}`);
  
  try {
    await s3Client().send(new CreateBucketCommand({
      Bucket: bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: region === "ap-south-1" ? undefined : region,
      },
    }));
    
    await publishLog(`✅ S3 bucket created: ${bucketName}`);
    return bucketName;
  } catch (error) {
    if (error.name === "BucketAlreadyExists") {
      await publishLog(`ℹ️ S3 bucket already exists: ${bucketName}`);
      return bucketName;
    }
    throw error;
  }
}

export async function disableBlockPublicAccess(props) {
  const { bucketName, publishLog } = props;
  
  await publishLog(`🔓 Disabling block public access for bucket: ${bucketName}`);
  
  try {
    await s3Client().send(new PutPublicAccessBlockCommand({
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        IgnorePublicAcls: false,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false
      }
    }));
    
    await publishLog(`✅ Block public access disabled for: ${bucketName}`);
  } catch (error) {
    await publishLog(`❌ Failed to disable block public access: ${error.message}`);
    throw error;
  }
}

export async function addBucketPolicy(props) {
  const { bucketName, publishLog } = props;
  
  await publishLog(`📋 Adding bucket policy for public read access: ${bucketName}`);
  
  const bucketPolicy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicReadGetObject",
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: `arn:aws:s3:::${bucketName}/*`
      }
    ]
  };
  
  try {
    await s3Client().send(new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify(bucketPolicy)
    }));
    
    await publishLog(`✅ Bucket policy added for: ${bucketName}`);
  } catch (error) {
    await publishLog(`❌ Failed to add bucket policy: ${error.message}`);
    throw error;
  }
}

export async function configureS3StaticHosting(props) {
  const { bucketName, region, publishLog } = props;
  
  await publishLog(`🌐 Configuring S3 bucket for static website hosting: ${bucketName}`);
  
  try {
    // First disable block public access
    await disableBlockPublicAccess({ bucketName, publishLog });
    
    // Add bucket policy for public read access
    await addBucketPolicy({ bucketName, publishLog });
    
    // Configure website hosting
    await s3Client().send(new PutBucketWebsiteCommand({
      Bucket: bucketName,
      WebsiteConfiguration: {
        IndexDocument: {
          Suffix: "index.html"
        },
        ErrorDocument: {
          Key: "index.html"
        }
      }
    }));
    
    await publishLog(`✅ S3 bucket configured for static hosting: ${bucketName}`);
    return bucketName;
  } catch (error) {
    await publishLog(`❌ Failed to configure static hosting: ${error.message}`);
    throw error;
  }
}

export async function uploadToS3(props) {
  const { bucketName, key, data, contentType, publishLog } = props;
  
  await publishLog(`📤 Uploading to S3: ${bucketName}/${key}`);
  
  try {
    await s3Client().send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: data,
      ContentType: contentType,
    }));
    
    await publishLog(`✅ Uploaded to S3: ${bucketName}/${key}`);
    return `https://${bucketName}.s3.amazonaws.com/${key}`;
  } catch (error) {
    await publishLog(`❌ Failed to upload to S3: ${error.message}`);
    throw error;
  }
}

export async function uploadDirectoryToS3(props) {
  const { bucketName, sourcePath, region, publishLog } = props;
  
  await publishLog(`📁 Uploading directory to S3: ${sourcePath} -> ${bucketName}`);
  
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source directory does not exist: ${sourcePath}`);
  }
  
  const uploadFile = async (filePath, relativePath) => {
    const fileContent = fs.readFileSync(filePath);
    const contentType = getContentType(filePath);
    
    await uploadToS3({
      bucketName,
      key: relativePath,
      data: fileContent,
      contentType,
      publishLog,
    });
  };
  
  const uploadDirectory = async (dirPath, relativePath = "") => {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const relativeItemPath = relativePath ? path.join(relativePath, item) : item;
      
      if (fs.statSync(fullPath).isDirectory()) {
        await uploadDirectory(fullPath, relativeItemPath);
      } else {
        await uploadFile(fullPath, relativeItemPath);
      }
    }
  };
  
  await uploadDirectory(sourcePath);
  await publishLog(`✅ Directory uploaded to S3: ${bucketName}`);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}

export async function uploadStaticFiles(props) {
  const { bucketName, files, publishLog } = props;
  
  await publishLog(`📁 Uploading static files to S3: ${bucketName}`);
  
  const uploadPromises = files.map(file => 
    uploadToS3({
      bucketName,
      key: file.key,
      data: file.data,
      contentType: file.contentType,
      publishLog,
    })
  );
  
  const results = await Promise.all(uploadPromises);
  
  await publishLog(`✅ Uploaded ${files.length} files to S3`);
  return results;
}

export async function configureStaticWebsiteHosting(props) {
  const { bucketName, indexDocument, errorDocument, publishLog } = props;
  
  await publishLog(`🌐 Configuring static website hosting for: ${bucketName}`);
  
  try {
    await s3Client().send(new PutObjectCommand({
      Bucket: bucketName,
      Key: "index.html",
      Body: indexDocument,
      ContentType: "text/html",
    }));
    
    if (errorDocument) {
      await s3Client().send(new PutObjectCommand({
        Bucket: bucketName,
        Key: "error.html",
        Body: errorDocument,
        ContentType: "text/html",
      }));
    }
    
    await publishLog(`✅ Static website configured: ${bucketName}`);
    return `http://${bucketName}.s3-website-${process.env.AWS_REGION}.amazonaws.com`;
  } catch (error) {
    await publishLog(`❌ Failed to configure static website: ${error.message}`);
    throw error;
  }
} 