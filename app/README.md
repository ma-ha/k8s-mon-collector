# Kubernetes Monitoring Collector

This "Kubernetes Monitoring Collector" should run in your Kubernetes cluster to read out information, logs, metrics.

By default data is sent to a [Kubernetes Monitor](https://www.kubernetes-monitor.com/) service API. 
There you can configure a web dashboard and configure alarms (missing data, pod or container error status) and send notifications (E-Mail and/or Webhook per namespace) to your DevOps teams.

![Web Dashboard](https://github.com/ma-ha/k8s-mon-collector/blob/main/img/dashoard.png)

# Usage

    const collector = require( 'kubernetes-monitoring-collector' )
    collector.start()

# Configuration

Set via environment or config package files variables:
- DATA_INTERVAL: in ms, default value is 30000
- LOG_INTERVAL: in ms, default value is 10000 
- SKIP_METRICS: set this, if you don't want to read out CPU/memory usage from metric server

## Configure Logging

See https://www.npmjs.com/package/npmlog

# Install as Pod from Docker Hub

You need to generate credentials for a "Monitoring Dashboard" per cluster:
https://www.kubernetes-monitor.com/

Install the "collector" pod:

    kubectl create namespace monitoring 
    kubectl apply -f mon-collector-rbac.yml -n monitoring 
    kubectl create secret generic monitoring-secret -n monitoring \
          --from-literal=id="$MONITORING_ID" \
          --from-literal=key="$MONITORING_KEY" 
    kubectl apply -f mon-collector.yml -n monitoring 

# Set Up Own API Server

Data is posted in JSON format to the following endpoints:
- `/mon/dta`
  - response should return e.g. 
  - `{ "ms":[ <array od service names, which logs should be send> ] }`
- `/mon/logs`
- `/mon/access-stats`

HTTP Header contain `monid` and `key` (from env vars "EKOSYS_ID" and "EKOSYS_KEY") 
to identify the clusters in a multi-tenant environment.