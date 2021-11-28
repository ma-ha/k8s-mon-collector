

# Kubernetes Monitoring Collector

This is a monitoring "collector" pod running in your cluster and reading info from the Kubernetes API and metrics API. 

The data is sent to a [Monitoring SaaS](https://www.kubernetes-monitor.com/). 
There you can configure a web dashboard and configure alarms (missing data, pod or container error status) and send notifications (email and/or webhook per namespace) to your DevOps teams .

Detailed docu: https://www.kubernetes-monitor.com/


![Dashboard](/img/dashboard.png)

# TL;DR

You need to generate credentials for a "Monitoring Dashboard" per cluster:

https://lcs.online-service.cloud/index.html?layout=product-nonav&id=613c6222be1a810011a01665

("Free Trial" credentials unlock all feature and has no time limitation.)

Install the "collector" pod:

    kubectl create namespace monitoring 
    kubectl apply -f mon-collector-rbac.yml -n monitoring 
    kubectl create secret generic monitoring-secret -n monitoring \
          --from-literal=id="$MONITORING_ID" \
          --from-literal=key="$MONITORING_KEY" 
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

Navigate to https://www.kubernetes-monitor.com/, 
login and configure the dashboard.

Don't forget to configure alarms (E-Mail or Webhook) in the Service Portal.
