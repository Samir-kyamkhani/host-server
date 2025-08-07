#!/bin/bash

set -eo pipefail

echo "🚀 AWS Builder Server Deployment Script"
echo "========================================"

# Required environment variables
REQUIRED_VARS=("PROJECT_ID" "DEPLOYMENT_ID" "SUBDOMAIN" "PROJECT_CONFIG")

# Validate required variables
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ $var environment variable is required" >&2
        exit 1
    fi
done

echo "📋 Project ID: $PROJECT_ID"
echo "🆔 Deployment ID: $DEPLOYMENT_ID"
echo "🌐 Subdomain: $SUBDOMAIN"
echo ""

# Parse environment variables safely
if [ -n "$PROJECT_CONFIG" ]; then
    echo "🔍 Parsing environment variables from PROJECT_CONFIG..."

    if ! ENV_VARS=$(echo "$PROJECT_CONFIG" | jq -r '.envVars[]? | "\(.key)=\(.value)"'); then
        echo "⚠️ Failed to parse PROJECT_CONFIG JSON"
        exit 1
    fi

    if [ -n "$ENV_VARS" ]; then
        while IFS= read -r line; do
            if [[ "$line" =~ ^[a-zA-Z_][a-zA-Z0-9_]*= ]]; then
                export "$line"
                echo "🔧 Exported $line"
            else
                echo "⚠️ Skipping invalid environment variable: $line"
            fi
        done <<<"$ENV_VARS"
    else
        echo "⚠️ No envVars found in PROJECT_CONFIG"
    fi
fi

# Start the builder server with error handling
echo ""
echo "🚀 Starting AWS Builder Server..."
if ! node src/main.js; then
    echo "❌ Builder server failed with exit code $?" >&2
    exit 1
fi

echo ""
echo "✅ Deployment completed successfully!"
