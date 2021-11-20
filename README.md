# Kubernetes Monitoring Collector

Detailed docu: https://k8s-mon.online-service.cloud/

# TL;DR

## Step 1: Get credentials

https://lcs.online-service.cloud/index.html?layout=product-nonav&id=613c6222be1a810011a01665

Get "Free Trial" Dashboard: All feature / no time limitation!

## Step2: Create a new namespace

    kubectl create namespace monitoring 

## Step3: Setup RBAC 

    kubectl apply -f mon-collector-rbac.yml -n monitoring 

## Step 4: Configure Credentials


    kubectl create secret generic monitoring-secret -n monitoring \
      --from-literal=id="XXXXXXXXXXXXXX" \
      --from-literal=key="YYYYYYYYYYYYYYYY" 

## Step 5: Deploy the Collector Pod

    kubectl apply -f mon-collector.yml -n monitoring 

## Done :-)

Navigate to https://k8s-mon.online-service.cloud, 
login and configure the dashboard.
