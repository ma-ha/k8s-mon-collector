

# Kubernetes Monitoring Collector

This is a monitoring "collector" pod running in your cluster and reading info from the Kubernetes API and metrics API. 

The data is sent to a [Monitoring SaaS](https://www.kubernetes-monitor.com/). 
There you can configure a web dashboard and configure alarms (missing data, pod or container error status) and send notifications (email and/or webhook per namespace) to your DevOps teams .

Detailed docu: https://www.kubernetes-monitor.com/


![Web Dashboard](https://github.com/ma-ha/k8s-mon-collector/blob/main/img/dashoard.png)

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

# Build Private Registry Image

To build a collector docker image an upload it to your private registry,
please follow the instructions in [README-BUILD.md](README-BUILD.md).

Don't forget to change the container image in [mon-collector.yml](mon-collector.yml).

# License

<a rel="license" href="http://creativecommons.org/licenses/by-nd/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by-nd/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by-nd/4.0/">Creative Commons Attribution-NoDerivatives 4.0 International License</a>.

https://creativecommons.org/licenses/by-nd/4.0/