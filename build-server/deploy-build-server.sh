#!/bin/bash

set -e

echo "🚀 Deploying Build Server to ECR and ECS"
echo "=========================================="

# Configuration
AWS_REGION=${AWS_REGION:-"ap-south-1"}
AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID:-"$(aws sts get-caller-identity --query Account --output text)"}
BUILD_SERVER_IMAGE_NAME="build-server"
BUILD_SERVER_ECR_REPO="build-server-repo"
BUILD_SERVER_CLUSTER="build-server-cluster"
BUILD_SERVER_SERVICE="build-server-service"
API_BASE_URL="https://996klw59-9000.inc1.devtunnels.ms/api/v1"

# Default VPC and Subnet Configuration
VPC_ID=${VPC_ID:-"vpc-0637733f311690975"}
SUBNET_IDS=${SUBNET_IDS:-"subnet-042af30adaf377326,subnet-0862531b72118616b"}
SECURITY_GROUP_IDS=${SECURITY_GROUP_IDS:-"sg-03b6ea146fdf3523d"}

echo "📋 Configuration:"
echo "   AWS Region: $AWS_REGION"
echo "   AWS Account ID: $AWS_ACCOUNT_ID"
echo "   Image Name: $BUILD_SERVER_IMAGE_NAME"
echo "   ECR Repo: $BUILD_SERVER_ECR_REPO"
echo "   ECS Cluster: $BUILD_SERVER_CLUSTER"
echo "   ECS Service: $BUILD_SERVER_SERVICE"

# Step 1: Create ECR Repository
echo ""
echo "📦 Step 1: Creating ECR Repository..."
if timeout 30 aws ecr describe-repositories --repository-names $BUILD_SERVER_ECR_REPO --region $AWS_REGION >/dev/null 2>&1; then
    echo "✅ ECR Repository already exists"
else
    echo "📝 Creating new ECR Repository..."
    timeout 30 aws ecr create-repository --repository-name $BUILD_SERVER_ECR_REPO --region $AWS_REGION --no-cli-pager
fi

# Step 2: Login to ECR
echo ""
echo "🔐 Step 2: Logging into ECR..."
timeout 30 aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Step 3: Build Docker Image
echo ""
echo "🐳 Step 3: Building Docker Image..."
docker build -t $BUILD_SERVER_IMAGE_NAME .

# Step 4: Tag Image for ECR
echo ""
echo "🏷️ Step 4: Tagging Image for ECR..."
docker tag $BUILD_SERVER_IMAGE_NAME:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BUILD_SERVER_ECR_REPO:latest

# Step 5: Push to ECR
echo ""
echo "📤 Step 5: Pushing to ECR..."
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BUILD_SERVER_ECR_REPO:latest

# Step 6: Create ECS Cluster
echo ""
echo "🏗️ Step 6: Creating ECS Cluster..."
CLUSTER_STATUS=$(timeout 30 aws ecs describe-clusters --clusters $BUILD_SERVER_CLUSTER --region $AWS_REGION --query 'clusters[0].status' --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$CLUSTER_STATUS" = "ACTIVE" ]; then
    echo "✅ ECS Cluster already exists and is active"
elif [ "$CLUSTER_STATUS" = "INACTIVE" ]; then
    echo "⚠️ ECS Cluster exists but is inactive, recreating..."
    timeout 30 aws ecs delete-cluster --cluster $BUILD_SERVER_CLUSTER --region $AWS_REGION --no-cli-pager 2>/dev/null || echo "Cluster deletion in progress..."
    echo "⏳ Waiting 10 seconds for deletion to complete..."
    sleep 10
    echo "📝 Creating new ECS Cluster for Fargate..."
    timeout 30 aws ecs create-cluster \
      --cluster-name $BUILD_SERVER_CLUSTER \
      --capacity-providers FARGATE \
      --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1 \
      --region $AWS_REGION \
      --no-cli-pager
else
    echo "📝 Creating new ECS Cluster for Fargate..."
    timeout 30 aws ecs create-cluster \
      --cluster-name $BUILD_SERVER_CLUSTER \
      --capacity-providers FARGATE \
      --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1 \
      --region $AWS_REGION \
      --no-cli-pager
fi

# Step 6.1: Check if ECS Task Execution Role exists
echo ""
echo "🔑 Step 6.1: Checking ECS Task Execution Role..."
if timeout 30 aws iam get-role --role-name ecsTaskExecutionRole --region $AWS_REGION >/dev/null 2>&1; then
    echo "✅ ECS Task Execution Role exists"
else
    echo "❌ ECS Task Execution Role does not exist"
    echo "Please create the role manually in AWS IAM Console:"
    echo "1. Go to IAM Console"
    echo "2. Create Role: ecsTaskExecutionRole"
    echo "3. Trusted entity: ECS - Task"
    echo "4. Attach policies: AmazonECSTaskExecutionRolePolicy, SecretsManagerReadWrite"
    echo ""
    echo "Or run this script with a user that has IAM permissions"
    exit 1
fi

# Step 7: Create AWS credentials in Secrets Manager
echo ""
echo "🔐 Step 7: Creating AWS credentials in Secrets Manager..."

# Check if secret exists and its status
if timeout 30 aws secretsmanager describe-secret --secret-id "build-server-credentials" --region $AWS_REGION >/dev/null 2>&1; then
    SECRET_STATUS=$(timeout 30 aws secretsmanager describe-secret --secret-id "build-server-credentials" --region $AWS_REGION --query 'SecretStatus' --output text 2>/dev/null)
    
    if [ "$SECRET_STATUS" = "PendingDeletion" ]; then
        echo "⚠️ Secret is pending deletion, waiting for deletion to complete..."
        echo "⏳ Waiting 30 seconds for deletion to complete..."
        sleep 30
        echo "📝 Creating new secret after deletion..."
        timeout 30 aws secretsmanager create-secret \
          --name "build-server-credentials" \
          --description "AWS credentials for build server" \
          --secret-string "{\"AWS_ACCESS_KEY_ID\":\"$AWS_ACCESS_KEY_ID\",\"AWS_SECRET_ACCESS_KEY\":\"$AWS_SECRET_ACCESS_KEY\"}" \
          --region $AWS_REGION --no-cli-pager
    else
        echo "✅ Secret already exists, updating..."
        timeout 30 aws secretsmanager update-secret \
          --secret-id "build-server-credentials" \
          --secret-string "{\"AWS_ACCESS_KEY_ID\":\"$AWS_ACCESS_KEY_ID\",\"AWS_SECRET_ACCESS_KEY\":\"$AWS_SECRET_ACCESS_KEY\"}" \
          --region $AWS_REGION --no-cli-pager
    fi
else
    echo "📝 Creating new secret..."
    timeout 30 aws secretsmanager create-secret \
      --name "build-server-credentials" \
      --description "AWS credentials for build server" \
      --secret-string "{\"AWS_ACCESS_KEY_ID\":\"$AWS_ACCESS_KEY_ID\",\"AWS_SECRET_ACCESS_KEY\":\"$AWS_SECRET_ACCESS_KEY\"}" \
      --region $AWS_REGION --no-cli-pager
fi

# Step 8: Get VPC and Subnet information
echo ""
echo "🌐 Step 8: Getting VPC and Subnet information..."
VPC_ID=${VPC_ID:-"$(timeout 30 aws ec2 describe-vpcs --query 'Vpcs[0].VpcId' --output text --region $AWS_REGION)"}
SUBNET_IDS=${SUBNET_IDS:-"$(timeout 30 aws ec2 describe-subnets --query 'Subnets[0:2].SubnetId' --output text --region $AWS_REGION | tr '\t' ',')"}
SECURITY_GROUP_IDS=${SECURITY_GROUP_IDS:-"$(timeout 30 aws ec2 describe-security-groups --query 'SecurityGroups[0].GroupId' --output text --region $AWS_REGION)"}

echo "   VPC ID: $VPC_ID"
echo "   Subnet IDs: $SUBNET_IDS"
echo "   Security Group IDs: $SECURITY_GROUP_IDS"

# Step 9: Create Task Definition
echo ""
echo "📋 Step 9: Creating Task Definition..."

cat > task-definition.json << EOF
{
  "family": "$BUILD_SERVER_IMAGE_NAME",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "ecsTaskExecutionRole",
  "taskRoleArn": "ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "$BUILD_SERVER_IMAGE_NAME",
      "image": "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BUILD_SERVER_ECR_REPO:latest",
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/$BUILD_SERVER_IMAGE_NAME",
          "awslogs-region": "$AWS_REGION",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "environment": [
        {"name": "AWS_REGION", "value": "$AWS_REGION"},
        {"name": "API_BASE_URL", "value": "$API_BASE_URL"},
        {"name": "AWS_ACCOUNT_ID", "value": "$AWS_ACCOUNT_ID"},
        {"name": "VPC_ID", "value": "$VPC_ID"},
        {"name": "SUBNET_IDS", "value": "$SUBNET_IDS"},
        {"name": "SECURITY_GROUP_IDS", "value": "$SECURITY_GROUP_IDS"}
      ],
      "secrets": [
        {"name": "AWS_ACCESS_KEY_ID", "valueFrom": "arn:aws:secretsmanager:$AWS_REGION:$AWS_ACCOUNT_ID:secret:build-server-credentials:AWS_ACCESS_KEY_ID::"},
        {"name": "AWS_SECRET_ACCESS_KEY", "valueFrom": "arn:aws:secretsmanager:$AWS_REGION:$AWS_ACCOUNT_ID:secret:build-server-credentials:AWS_SECRET_ACCESS_KEY::"}
      ]
    }
  ]
}
EOF

timeout 60 aws ecs register-task-definition --cli-input-json file://task-definition.json --region $AWS_REGION --no-cli-pager

# Step 10: Create CloudWatch Log Group
echo ""
echo "📊 Step 10: Creating CloudWatch Log Group..."

# Create log group directly (required for ECS task to start)
echo "📝 Creating CloudWatch Log Group..."
aws logs create-log-group --log-group-name "/ecs/build-server" --region $AWS_REGION --no-cli-pager 2>/dev/null && echo "✅ CloudWatch Log Group created successfully" || echo "✅ CloudWatch Log Group already exists"

# Step 11: Create ECS Service
echo ""
echo "⚡ Step 11: Creating ECS Service..."

cat > service-definition.json << EOF
{
  "cluster": "$BUILD_SERVER_CLUSTER",
  "serviceName": "$BUILD_SERVER_SERVICE",
  "taskDefinition": "$BUILD_SERVER_IMAGE_NAME",
  "desiredCount": 1,
  "launchType": "FARGATE",
  "networkConfiguration": {
    "awsvpcConfiguration": {
      "subnets": ["${SUBNET_IDS//,/\",\""}"],
      "securityGroups": ["$SECURITY_GROUP_IDS"],
      "assignPublicIp": "ENABLED"
    }
  }
}
EOF

if timeout 30 aws ecs describe-services --cluster $BUILD_SERVER_CLUSTER --services $BUILD_SERVER_SERVICE --region $AWS_REGION --query 'services[0].status' --output text >/dev/null 2>&1; then
    echo "✅ ECS Service already exists"
else
    echo "📝 Creating new ECS Service..."
    timeout 60 aws ecs create-service --cli-input-json file://service-definition.json --region $AWS_REGION --no-cli-pager
fi

# Step 12: Cleanup
echo ""
echo "🧹 Step 12: Cleaning up temporary files..."
rm -f task-definition.json service-definition.json

echo ""
echo "✅ Build Server Deployment Complete!"
echo "====================================="
echo "🌐 ECR Repository: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BUILD_SERVER_ECR_REPO"
echo "🏗️ ECS Cluster: $BUILD_SERVER_CLUSTER"
echo "⚡ ECS Service: $BUILD_SERVER_SERVICE"
echo ""
echo "📋 To check service status:"
echo "   aws ecs describe-services --cluster $BUILD_SERVER_CLUSTER --services $BUILD_SERVER_SERVICE --region $AWS_REGION"
echo ""
echo "📊 To view logs:"
echo "   aws logs tail /ecs/$BUILD_SERVER_IMAGE_NAME --region $AWS_REGION --follow"
echo ""
echo "🚀 To run a deployment:"
echo "   aws ecs run-task --cluster $BUILD_SERVER_CLUSTER --task-definition $BUILD_SERVER_IMAGE_NAME --region $AWS_REGION" 
