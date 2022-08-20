# 1.4.8
- Send status if something is wrong

# 1.4.7
- Fix pod name in logs
- SKIP_METRICS env var 

# 1.4.5
- detect potential IPs to ban
- retry for logs and stats send
- log output refined pod stat 

# 1.4.4
- add missing RegExp config

# 1.4.3 (broken)
- send ingress statistics (option)

# 1.4.2
- send logs on demand (to avoid "Payload too large" errors)

# 1.4.1
- handle ingresses more flexible

# 1.4.0
- send logs separately

# 1.3.0
- merge minion ingress rules

# 1.2.1
- less noisy exception log

# 1.2.0
- logs: toggle to swtich off collection and transfer, by server request
- transfer CPU/mem limits
- fix CPU x10 bug
- added debug logs

# 1.1.0
- Log stream: re-subscribe after LOG_RENEW_STREAM_MIN interval 
- Error State: After Exception, log.info, if data could be sent successfully again

# 1.0.6
- 1st full working feature-set: Nodes, Pods, Logs, Metrics