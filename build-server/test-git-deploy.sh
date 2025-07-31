#!/bin/bash

echo "🧪 Testing Complete Deployment Automation"
echo "=========================================="

# Function to test different frameworks
test_framework() {
    local framework=$1
    local git_url=$2
    local branch=$3
    local database=$4
    
    echo ""
    echo "🚀 Testing $framework deployment..."
    echo "=================================="
    
    export PROJECT_ID="test-${framework}-$(date +%s)"
    export DEPLOYMENT_ID="deploy-${framework}-$(date +%s)"
    export SUBDOMAIN="test-${framework}-$(date +%s)"
    
    # Create project config based on framework
    case $framework in
        "nextjs-prisma")
            export PROJECT_CONFIG="{
                \"name\": \"Test Next.js with Prisma\",
                \"gitUrl\": \"$git_url\",
                \"gitBranch\": \"$branch\",
                \"framework\": \"nextjs\",
                \"db\": \"postgresql\",
                \"envVars\": [
                    {\"key\": \"NODE_ENV\", \"value\": \"production\"},
                    {\"key\": \"DATABASE_URL\", \"value\": \"postgresql://user:pass@host:5432/db\"}
                ]
            }"
            ;;
        "laravel")
            export PROJECT_CONFIG="{
                \"name\": \"Test Laravel App\",
                \"gitUrl\": \"$git_url\",
                \"gitBranch\": \"$branch\",
                \"framework\": \"laravel\",
                \"db\": \"mysql\",
                \"envVars\": [
                    {\"key\": \"APP_ENV\", \"value\": \"production\"},
                    {\"key\": \"APP_DEBUG\", \"value\": \"false\"}
                ]
            }"
            ;;
        "vite")
            export PROJECT_CONFIG="{
                \"name\": \"Test Vite.js App\",
                \"gitUrl\": \"$git_url\",
                \"gitBranch\": \"$branch\",
                \"framework\": \"vite\",
                \"db\": null,
                \"envVars\": [
                    {\"key\": \"VITE_API_URL\", \"value\": \"https://api.example.com\"}
                ]
            }"
            ;;
        "nodejs-prisma")
            export PROJECT_CONFIG="{
                \"name\": \"Test Node.js with Prisma\",
                \"gitUrl\": \"$git_url\",
                \"gitBranch\": \"$branch\",
                \"framework\": \"nodejs\",
                \"db\": \"mysql\",
                \"envVars\": [
                    {\"key\": \"NODE_ENV\", \"value\": \"production\"},
                    {\"key\": \"PORT\", \"value\": \"3000\"}
                ]
            }"
            ;;
        "static")
            export PROJECT_CONFIG="{
                \"name\": \"Test Static Files\",
                \"gitUrl\": \"$git_url\",
                \"gitBranch\": \"$branch\",
                \"framework\": \"static\",
                \"db\": null,
                \"envVars\": [
                    {\"key\": \"SITE_TITLE\", \"value\": \"My Static Site\"}
                ]
            }"
            ;;
    esac
    
    echo "📋 Project ID: $PROJECT_ID"
    echo "🆔 Deployment ID: $DEPLOYMENT_ID"
    echo "🌐 Subdomain: $SUBDOMAIN"
    echo "📥 Git URL: $git_url"
    echo "🌿 Git Branch: $branch"
    echo "🗄️ Database: $database"
    
    # Run the deployment
    ./deploy.sh
    
    echo "✅ $framework test completed!"
    echo ""
}

# Test different frameworks
echo "🧪 Testing Next.js with Prisma..."
test_framework "nextjs-prisma" "https://github.com/prisma/prisma-examples.git" "main" "PostgreSQL"

echo "🧪 Testing Laravel..."
test_framework "laravel" "https://github.com/laravel/laravel.git" "main" "MySQL"

echo "🧪 Testing Vite.js..."
test_framework "vite" "https://github.com/vitejs/vite.git" "main" "None"

echo "🧪 Testing Node.js with Prisma..."
test_framework "nodejs-prisma" "https://github.com/prisma/prisma-examples.git" "main" "MySQL"

echo "🧪 Testing Static Files..."
test_framework "static" "https://github.com/user/static-website.git" "main" "None"

echo ""
echo "🎉 All framework tests completed!"
echo "==================================" 