#!/bin/bash

set -e

echo "🚀 AWS Builder Server Deployment Script"
echo "========================================"

# Check if required environment variables are set
if [ -z "$PROJECT_ID" ]; then
    echo "❌ PROJECT_ID is required"
    exit 1
fi

if [ -z "$DEPLOYMENT_ID" ]; then
    echo "❌ DEPLOYMENT_ID is required"
    exit 1
fi

if [ -z "$SUBDOMAIN" ]; then
    echo "❌ SUBDOMAIN is required"
    exit 1
fi

if [ -z "$PROJECT_CONFIG" ]; then
    echo "❌ PROJECT_CONFIG is required"
    exit 1
fi

echo "📋 Project ID: $PROJECT_ID"
echo "🆔 Deployment ID: $DEPLOYMENT_ID"
echo "🌐 Subdomain: $SUBDOMAIN"

# Set deployment environment variables
export PROJECT_ID="$PROJECT_ID"
export DEPLOYMENT_ID="$DEPLOYMENT_ID"
export SUBDOMAIN="$SUBDOMAIN"
export PROJECT_CONFIG="$PROJECT_CONFIG"

echo ""
echo "🔧 Starting deployment process..."
echo "=================================="

# Run the main.sh script
./main.sh

echo ""
echo "✅ Deployment script completed!" 