# Kubernetes Monitoring Collector

This "Kubernetes Monitoring Collector" should run in your Kubernetes cluster to read out information, logs, metrics.

By default data is sent to a [Kubernetes Monitor Service](https://www.kubernetes-monitor.com/) API. 
There you can configure a web dashboard and configure alarms (missing data, pod or container error status) and send notifications (E-Mail and/or Webhook per namespace) to your DevOps teams.

Find detailed docu: https://www.kubernetes-monitor.com/

![Web Dashboard](https://github.com/ma-ha/k8s-mon-collector/blob/main/img/dashoard.png)

# Usage

    const collector = require( 'kubernetes-monitoring-collector' )
    collector.start()

# Configuration

Set via environment or config package files variables:
- DATA_INTERVAL: in ms, default value is 30000
- LOG_INTERVAL: in ms, default value is 10000 


## Configure Logging

See https://www.npmjs.com/package/npmlog

# Install as Pod from Docker Hub

You need to generate credentials for a "Monitoring Dashboard" per cluster:

https://lcs.online-service.cloud/index.html?layout=product-nonav&id=613c6222be1a810011a01665

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

# License

<a rel="license" href="http://creativecommons.org/licenses/by-nd/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by-nd/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by-nd/4.0/">Creative Commons Attribution-NoDerivatives 4.0 International License</a>.

https://creativecommons.org/licenses/by-nd/4.0/