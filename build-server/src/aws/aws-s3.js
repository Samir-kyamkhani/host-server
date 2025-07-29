import pkg from "@aws-sdk/client-s3";
const { PutObjectCommand, CreateBucketCommand } = pkg;
import { s3Client } from "./aws-config.js";

export async function createS3Bucket(props) {
  const { bucketName, region, publishLog } = props;
  
  await publishLog(`🏗️ Creating S3 bucket: ${bucketName}`);
  
  try {
    await s3Client().send(new CreateBucketCommand({
      Bucket: bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: region === "us-east-1" ? undefined : region,
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