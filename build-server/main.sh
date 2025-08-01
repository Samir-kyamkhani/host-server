#!/bin/bash

set -e

echo "🚀 Starting AWS Builder Server..."

if [ -z "$PROJECT_CONFIG" ]; then
    echo "❌ PROJECT_CONFIG environment variable is required"
    exit 1
fi

if [ -z "$PROJECT_ID" ]; then
    echo "❌ PROJECT_ID environment variable is required"
    exit 1
fi

if [ -z "$DEPLOYMENT_ID" ]; then
    echo "❌ DEPLOYMENT_ID environment variable is required"
    exit 1
fi

if [ -z "$SUBDOMAIN" ]; then
    echo "❌ SUBDOMAIN environment variable is required"
    exit 1
fi

echo "📋 Project ID: $PROJECT_ID"
echo "🆔 Deployment ID: $DEPLOYMENT_ID"
echo "🌐 Subdomain: $SUBDOMAIN"

# Use daemon-less approach with buildx
echo "🐳 Using daemon-less buildx approach..."
mkdir -p /var/run/docker
echo "✅ Buildx environment ready"

echo "🔧 Running builder server..."
node src/script.js 