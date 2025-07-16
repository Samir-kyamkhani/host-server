#!/bin/bash

export GIT_REPOSITORY__URL="$GIT_REPOSITORY__URL"
export PROJECT_ID="$PROJECT_ID"
export DEPLOYMENT_ID="$DEPLOYMENT_ID"
export SUBDOMAIN="$SUBDOMAIN"

git clone "$GIT_REPOSITORY__URL" /home/app/output

exec node script.js