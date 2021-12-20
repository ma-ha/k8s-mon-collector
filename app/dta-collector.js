/*  Copyright (c) 2021 Lean Cloud Services GmbH

    This work is licensed under 
    Creative Commons Attribution-NoDerivatives 4.0 International License.
    http://creativecommons.org/licenses/by-nd/4.0/ 
*/

const cfg    = require( 'config' )
const log    = require( 'npmlog' )
const k8s    = require( '@kubernetes/client-node' )
const stream = require( 'stream' )

exports: module.exports = {
  init,
  setCfg,
  getDta,
  pushLogs,
  getLogStat,
  resetLogStat,
  getErrState
}

const kindMap ={
  ReplicaSet  : 'r',
  DaemonSet   : 'd',
  StatefulSet : 's',
  Job         : 'j'
}

let k8sApi  = null
let k8sApps = null
let k8sJobs = null
let k8sJobB = null
let k8sNetw = null
let k8sLogs = null
let k8sMetrics = null 
let collCfg = []
let plan = null
// collector may get config not send out logs (compliance...)
let collectLogs = true

let dtaSender = null

//-----------------------------------------------------------------------------

async function init( sender ) {
  try {
    dtaSender = sender 
    const kc = new k8s.KubeConfig()
    
    if ( process.env.KUBERNETES_SERVICE_HOST ) { 
      log.info( 'KubeConfig loadFromCluster...' )
      kc.loadFromCluster()
    } else if ( cfg.CTX ) { 
      log.info( 'KubeConfig from cfg.CTX' )
      kc.loadFromOptions( cfg.CTX )
    } else if ( process.env.CTX_SERVER ) { 
      log.info( 'KubeConfig from env, server=', process.env.CTX_SERVER  )
      kc.loadFromDefault()
      kc.clusters[0].server = process.env.CTX_SERVER
    } else{
      log.info( 'KubeConfig loadFromDefault...' )
      kc.loadFromDefault()
    }
    log.verbose( 'kc', kc )

    k8sApi  = kc.makeApiClient( k8s.CoreV1Api )
    k8sApps = kc.makeApiClient( k8s.AppsV1Api )
    k8sJobs = kc.makeApiClient( k8s.BatchV1Api )
    k8sJobB = kc.makeApiClient( k8s.BatchV1beta1Api )
    k8sNetw = kc.makeApiClient( k8s.NetworkingV1Api )
    k8sMetrics = new k8s.Metrics( kc )
    k8sLogs    = new k8s.Log(kc);

    setInterval( reSubscribeLogs, 1000 * 60 * cfg.LOG_RENEW_STREAM_MIN )

  } catch ( exc ) {
    console.error( exc )
    log.error( exc )
    process.exit( 1 )
  }
}

//-----------------------------------------------------------------------------

function setCfg( collectorCfg ) {
  log.verbose( 'setCfg', collectorCfg )
  if ( ! collectorCfg ) { return }
  if ( collectorCfg.restart === true ) {
    log.info( 'Restart requested by Monitoring Central' )
    log.info( 'Reason: ', collectorCfg.restartReason )
    process.exit( 0 )
  }
  if ( collectorCfg.plan ) {
    plan =  collectorCfg.plan
  }
  if ( collectorCfg.ms) {
    collCfg = collectorCfg.ms
  }
  if ( collectorCfg.collectLogs) {
    if ( collectLogs != collectorCfg.collectLogs ) {
      collectLogs = collectorCfg.collectLogs
      reSubscribeLogs()  
    }
  }
}

//-----------------------------------------------------------------------------
let errorState = false

function getErrState() {
  let result = errorState 
  errorState = false
  return result
}

//-----------------------------------------------------------------------------
// https://nodejs.org/api/stream.html#readabledestroyerror
let logStreamMap = {}
let podLogs = []
let pushing = false
let logCntTot = 0

async function pushLogs() {
  if ( pushing ) { return }
  pushing = true
  let cnt = podLogs.length
  log.verbose( 'push logs', cnt )
  if ( cnt > cfg.LOG_SND_MAX_CNT ) { cnt = cfg.LOG_SND_MAX_CNT }
  if ( cnt > 0 ) try {
    let logs = {}
    while ( cnt != 0 ) {
      let l = podLogs.shift()
      if ( l ) try { // prevent problems if pushLogs() runs multiple times
        let cid = l.ns + l.ms
        if ( ! logs[ cid ] ) {
          logs[ cid ] = {
            ns   : l.ns,
            ms   : l.ms,
            pod  : l.po,
            logs : []
          }
        }
        logs[ cid ].logs.push({ ts: l.dt, log: l.log })  
        logCntTot ++
      } catch ( exc ) { log.warn( 'pushLogs', l.ns, l.ms, l.po, l.c, exc.message ) }
      cnt --
    }
    // send out the logs
    await dtaSender.sendLogs( logs )

  } catch ( err ) { log.warn( 'pushLogs', err.message ) }
  pushing = false
}

function getLogStat() {
  return logCntTot
}

function resetLogStat() {
  logCntTot = 0
}


function reSubscribeLogs() {
  //log.info( 'reSubscribeLogs <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<')
  for ( let streamId in logStreamMap ) {
    let oldStream = logStreamMap[ streamId ].logStream
    log.verbose( 'subscribePodLogs, destroy old stream', streamId )
    oldStream.destroy()
    logStreamMap[ streamId ].logStream = null
    if ( collectLogs ) {
      subscribeContainerLogs( 
        logStreamMap[ streamId ].ns, 
        logStreamMap[ streamId ].ms, 
        logStreamMap[ streamId ].pod, 
        logStreamMap[ streamId ].container 
      )
    }
  }
}
async function subscribePodLogs( ns, ms, podName, pod ) {
  if ( collectLogs ) {
    for ( let containerName in pod.c ) {
      subscribeContainerLogs( ns, ms, podName, containerName )
    }
  }
}

async function subscribeContainerLogs( ns, ms, podName, containerName ) {
  try {
    let streamId =ns+'/'+podName+'/'+containerName
    let tailLines = 50
    if ( ! logStreamMap[ streamId ]  ) { // first time
      log.verbose( 'subscribeContainerLogs initial', streamId )
      logStreamMap[ streamId ] = {
        ns        : ns, 
        ms        : ms,
        pod       : podName, 
        container : containerName,
        logStream : null
      }
    } else { 
      if ( logStreamMap[ streamId ].logStream ) {
        return // nothing to do
      } else { // strea was destroyed to resubscribe
        log.verbose( 'subscribeContainerLogs resubscribe', streamId )
        tailLines = 0
      }
    }

    const logStream = new stream.PassThrough();

    logStream.on( 'data', async (chunk) => {
      podLogs.push({
        dt  : Date.now(),
        ns  : ns, 
        ms  : ms, 
        po  : podName, 
        c   : containerName,
        log : chunk + ''
      })
      if ( podLogs.length >= cfg.LOG_SND_MAX_CNT ) {
        await pushLogs()
      }
      // log.info( 'Log...', podName, containerName, chunk+'' )
    })

    logStreamMap[ streamId ].logStream = logStream

    k8sLogs.log( ns, podName, containerName, logStream, 
      { follow: true, tailLines: tailLines, pretty: false, timestamps: false } )
    .catch( err => { log.error( 'k8sLogs',  ns, podName, containerName, err.message ) } )
    .then( req => {} )
    
  } catch ( exc ) {
    log.warn( 'getLogs' , exc.message )
  }
}

//-----------------------------------------------------------------------------

//https://kubernetes-client.github.io/javascript/modules.html
async function getDta() {
  log.verbose( 'gather data ...' )
  let cluster = {}
  try {
    cluster.node = await getNode()
    cluster.namespace =  await getNamespaceArr()

    for ( let ns in cluster.namespace ) {
      let pods = await getPods( ns, cluster.node )
      for ( let p in pods ) {
        let pod = pods[ p ]
        cluster.namespace[ ns ][ p ] = pod
      }
    }
   
    log.verbose( 'cluster', cluster.node  )
    log.verbose( 'cluster', cluster  )

  } catch ( exc ) {
    log.error( 'getDta', exc.message )
    errorState = true
    return null
  }
  return cluster
}

//-----------------------------------------------------------------------------

// https://kubernetes-client.github.io/javascript/classes/corev1api.corev1api-1.html
async function getNamespaceArr() {
  let nsMap = {}
  let ns = await k8sApi.listNamespace()
  if ( ns.body && ns.body.items ) {
    for ( let aNS of ns.body.items ) {
      nsMap[ aNS.metadata.name ] = {}
    }
  }
  return nsMap
}

//-----------------------------------------------------------------------------

function noDefaultBackend( name ) {
  if ( name.indexOf( 'backend' ) >= 0 ) { return false }
  if ( name.indexOf( 'error' ) >= 0 ) { return false }
  return true
}

async function loadMS( ns ) {
  let obj = {
    'ReplicaSet': {},
    'DaemonSet': {},
    'StatefulSet':{},
    'Job':{},
    'MinionIngress':{},
    'Ingress':{},
    '_ing': {}
  }

  try {
    let lst = await k8sNetw.listNamespacedIngress( ns )
    for ( let d of lst.body.items ) {
      log.verbose( d.metadata.name, JSON.stringify( d, null, '  ' ) )
      obj[ '_ing' ][ d.metadata.name ] = {
        a : d.metadata.annotations,
        r : d.spec.rules
      }
    }
  } catch ( e ) { log.warn( 'list Ingress', ns, e.message ); errorState = true } 

  try {
    let lst = await k8sApps.listNamespacedDeployment( ns )
    for ( let d of lst.body.items ) {
      // log.info( d.metadata.name,  d.spec.selector )
      obj['ReplicaSet'][ d.metadata.name ] = d.spec.selector
    }
  } catch ( e ) { log.warn( 'list Deployment', ns, e.message ); errorState = true } 
  
  try {
    let lst = await k8sApps.listNamespacedDaemonSet( ns )
    for ( let d of lst.body.items ) {
      log.verbose( d.metadata.name,  d.spec.selector )
      obj['DaemonSet'][ d.metadata.name ] = d.spec.selector
    }
  } catch ( e ) { log.warn( 'list DaemonSet', ns, e.message ); errorState = true } 
  try {
    let lst = await k8sApps.listNamespacedStatefulSet( ns )
    for ( let d of lst.body.items ) {
      log.verbose( d.metadata.name, d.spec.selector )
      obj['StatefulSet'][ d.metadata.name ] = d.spec.selector
    }
  } catch ( e ) { log.warn( 'list StatefulSet', ns, e.message ); errorState = true } 
  try {
    let lst = await k8sJobs.listNamespacedCronJob( ns )
    for ( let d of lst.body.items ) {
      // log.info( d.metadata.name, d )
      obj['Job'][ d.metadata.name ] = {}
    }  
  } catch ( e ) { log.verbose( 'list CronJob', ns, e.message ); } 
  
  try {
    let lst = await k8sJobB.listNamespacedCronJob( ns )
    for ( let d of lst.body.items ) {
      // log.info( d.metadata.name, d.spec )
      obj['Job'][ d.metadata.name ] = {}
    }
  } catch ( e ) { log.warn( 'list CronJob.b', ns, e.message ); errorState = true } 

  return obj
}

//-----------------------------------------------------------------------------

function getMsName( aPod, obj ) {
  let mgr = obj[ aPod.metadata.ownerReferences[0].kind ]
  let labels = aPod.metadata.labels
  log.verbose( aPod.metadata.name, labels )
  if ( aPod.metadata.ownerReferences[0].kind == 'Job' ) {
    for ( let x in mgr ) {
      if ( aPod.metadata.name.indexOf( x ) == 0 ) {
        return { msName : x }
      }
    }
  } else if ( mgr ) {
    for ( let x in mgr ) {
      let sel = mgr[ x ].matchLabels
      let match = true
      for ( let s in sel ) {
        if ( labels[ s ]  &&  labels[ s ] == sel[ s ] ) {
          // ok
        } else {
          match = false
        }
      }
      if ( match ) {
        return { msName : x }
      }
    }
  }
}

function getMemMB( mem ) {
  let memStr = mem +''
  let memMB =  Number.parseInt( memStr.substring( 0, memStr.length - 6 ), 10 )
  if ( isNaN( memMB ) ) { memMB = 0 }
  return memMB
}


async function getPodMetrics( ns ) {
  let podMetrics = {}
  try {
    let topPods = await k8s.topPods( k8sApi, k8sMetrics, ns )
    for ( let pod of topPods ) try {
      // log.verbose( pod.Pod.metadata.name, pod.cpu )
      // let memMB  = getMemMB( pod.Memory.CurrentUsage )
      log.verbose( pod.Pod.metadata.name, pod.CPU.CurrentUsage, pod.Memory.CurrentUsage  )
      podMetrics[ pod.Pod.metadata.name ] = {
        cpu  : pod.CPU.CurrentUsage / 10, // TODO:investigate why we need that ??
        cpuL : pod.CPU.LimitTotal,
        mem  : getMemMB( pod.Memory.CurrentUsage ),
        memL : getMemMB( pod.Memory.LimitTotal )
      } 
    } catch ( exc) { log.warn( 'getPodMetrics', ns, pod.Pod.metadata.name, exc.message )  }
  } catch ( e ) { 
    log.warn( 'getPodMetrics', ns, e.message ) 
    errorState = true
  }
  return podMetrics
}

//-----------------------------------------------------------------------------

async function getPods( ns, nodes ) {
  let pods = {}
  let po = await k8sApi.listNamespacedPod( ns )

  let obj = await loadMS( ns )
  pods[ '_ing' ] = obj[ '_ing' ]

  let podMetrics = await getPodMetrics( ns )

  if ( po.body && po.body.items ) {
    for ( let aPod of po.body.items ) {
      try {
        // log.info(  aPod.metadata.name, aPod.metadata.ownerReferences[0].kind )  
        let svc  = getMsName( aPod, obj )
        let ms   = svc.msName
        let kind = aPod.metadata.ownerReferences[0].kind
        let podName = aPod.metadata.name
        //log.info( podName, svc )  

        let pod = { }
        
        if ( collCfg.indexOf( ns+'/'+ms ) >= 0 ) { // Pod is in scope !!
          // log.info( 'collCfg', ns+'/'+ms, collCfg  )
          pod = getPodWithAllDetails( pod, aPod )
          if ( podMetrics[ podName ] ) {
            pod.cpu  =  podMetrics[ podName ].cpu
            pod.mem  =  podMetrics[ podName ].mem 
            pod.cpuL =  podMetrics[ podName ].cpuL
            pod.memL =  podMetrics[ podName ].memL
          }
          subscribePodLogs( ns, ms, podName, pod )
        }
        
        if ( podMetrics[ podName ] ) {
          // log.info( aPod.spec.nodeName+'<'+podName, nodes[ aPod.spec.nodeName ].cpu,  podMetrics[ podName ].cpu  )
          nodes[ aPod.spec.nodeName ].cpu += podMetrics[ podName ].cpu
          nodes[ aPod.spec.nodeName ].mem += podMetrics[ podName ].mem
          // log.info( aPod.spec.nodeName+'<'+podName, nodes[ aPod.spec.nodeName ].cpu )
        }
        // log.info( aPod.spec.nodeName, podMetrics[ podName ].cpu, podMetrics[ podName ].mem)
        
        pod.n = nodes[ aPod.spec.nodeName ].no
        pod.k = ( kindMap[ kind ] ? kindMap[ kind ] : kind )
        pod.s = aPod.status.phase
        
        if ( ! pods[ ms ] ) { 
          pods[ ms ] = {}
        }
        pods[ ms ][ podName ] = pod
          
      } catch ( exc ) {
        log.warn( 'getPods', exc.message )
        errorState = true
      }
    }
  }
  // log.info( 'pods', pods )
  return pods
}

//-----------------------------------------------------------------------------

function getPodWithAllDetails( pod, aPod ) {
  try {
    pod = { 
      ct : (new Date( aPod.metadata.creationTimestamp )).getTime(),
      st : (new Date( aPod.status.startTime )).getTime(),
      c  : {},
      ip : aPod.status.podIP,
      rc : 0,
      lt : Date.now()
    }

    if ( aPod.status.containerStatuses ) {
      for ( let c of aPod.status.containerStatuses ) {
        pod.c[ c.name ] = {
          s  : ( c.started ? 'running' :'terminated' ),
          sr : c.reason,
          rc : c.restartCount,
          ci : c.image,
          lt : Date.now()
        }
        if ( c.restartCount > pod.PodRestartCount ) (
          pod.rc = c.restartCount 
        )
      }
    }
  } catch ( e ) { 
    log.warn( 'getPodWithAllDetails', e.message, aPod )
    errorState = true
   }
  return pod
}

//-----------------------------------------------------------------------------

async function getNode() {
  let nodeMap = {}
  let nodeNo = 0
  let no = await k8sApi.listNode()
  if ( no.body && no.body.items ) {
    for ( let aNode of no.body.items ) {
      nodeMap[ aNode.metadata.name ] = {
        no       : nodeNo,
        lastSeen : Date.now()
      }
      nodeNo ++
    }
  }
  try {
    let top = await k8s.topNodes( k8sApi )
    for ( let topNo of top ) {
      let nodeName = topNo.Node.metadata.name
      // log.info( 'cpu', topNo.CPU, topNo.Memory )
      nodeMap[ nodeName ].cpu     = 0
      nodeMap[ nodeName ].cpuCapa = topNo.CPU.Capacity
      nodeMap[ nodeName ].cpuReq  = topNo.CPU.RequestTotal
      nodeMap[ nodeName ].cpuLim  = topNo.CPU.LimitTotal
      nodeMap[ nodeName ].mem     = 0
      nodeMap[ nodeName ].memCap  = getMemMB( topNo.Memory.Capacity )
      nodeMap[ nodeName ].memReq  = getMemMB( topNo.Memory.RequestTotal )
      nodeMap[ nodeName ].memLim  = getMemMB( topNo.Memory.LimitTotal )
    }
  } catch ( e ) { log.warn( 'getNode topNodes', e.message ) }
  log.verbose( 'top', nodeMap )
  return nodeMap
}