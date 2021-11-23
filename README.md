# IMPORTANT: This is work in progress!!!

# Kubernetes Monitoring Collector

Detailed docu: https://k8s-mon.online-service.cloud/

You need to get credentials for a "Monitoring Dashboaed" per cluster.

An unlimited "Free Trial" should be enough for Dev or small clusters:

https://lcs.online-service.cloud/index.html?layout=product-nonav&id=613c6222be1a810011a01665

"Free Trial" dashboard has all feature and no time limitation!


# TL;DR

    kubectl create namespace monitoring 
    kubectl apply -f mon-collector-rbac.yml -n monitoring 
    kubectl create secret generic monitoring-secret -n monitoring \
          --from-literal=id="$DASHBOARD_ID" \
          --from-literal=key="$DASHBOARD_KEY" 
    kubectl apply -f mon-collector.yml -n monitoring 


# Installation Process Explained

The original config files and here: https://github.com/ma-ha/k8s-mon-collector

## Step 1: Create a new namespace

    kubectl create namespace monitoring 

## Step 2: Setup RBAC 

The collector pod should only have read access to the Kubernetes API server:

    kubectl apply -f mon-collector-rbac.yml -n monitoring 

## Step 3: Configure Credentials

Copy/paste the command from the "Setup" tab in the Service Portal, 
should look like this:

    kubectl create secret generic monitoring-secret -n monitoring \
      --from-literal=id="XXXXXXXXXXXXXX" \
      --from-literal=key="YYYYYYYYYYYYYYYY" 

## Step 4: Deploy the Collector Pod

Only one pod is required:

    kubectl apply -f mon-collector.yml -n monitoring 

The deployment should be compliant to best practice security policies.

The Collector Service is open source, you're welcome to review the source code.

## Done :-)

Navigate to https://k8s-mon.online-service.cloud, 
login and configure the dashboard.

Don't forget to configure alarms (E-Mail or Webhook) in the Service Portal.
