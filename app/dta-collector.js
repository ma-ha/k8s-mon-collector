/*  Copyright (c) 2021 Lean Cloud Services GmbH  */

const cfg    = require( 'config' )
const log    = require( 'npmlog' )
const k8s    = require( '@kubernetes/client-node' )
const stream = require( 'stream' )

exports: module.exports = {
  init,
  setCfg,
  getDta
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

//-----------------------------------------------------------------------------

async function init( ) {
  try {
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

  } catch ( exc ) {
    console.error( exc )
    log.error( exc )
    process.exit( 1 )
  }
}

//-----------------------------------------------------------------------------

function setCfg( collectorCfg ) {
  if ( ! collectorCfg ) { return }
  if ( collectorCfg.restart === true ) {
    log.inf( 'Restart requested by Monitoring Central' )
    process.exit( 0 )
  }
  if ( collectorCfg.plan ) {
    plan =  collectorCfg.plan
  }
  if ( collectorCfg.ms) {
    collCfg = collectorCfg.ms
  }
}

let logStreams = {}
let podLogs = []

async function subscribePodLogs( ns, ms, podName, pod ) {
  try {
    for ( let containerName in pod.c ) {
      // let containerName = pod.c[ cId ].n 
      if ( ! logStreams[ ns+'/'+podName ]  ) {

        const logStream = new stream.PassThrough();

        logStream.on('data', (chunk) => {
          podLogs.push({
            dt  : Date.now(),
            ns  : ns, 
            ms  : ms, 
            po  : podName, 
            c   : containerName,
            log : chunk + ''
          })
          //log.info( podName, chunk+'' )
        })

        logStreams[ ns+'/'+podName ] = logStream

        k8sLogs.log( ns, podName, containerName, logStream, 
          { follow: true, tailLines: 50, pretty: false, timestamps: false } )
        .catch( err => { log.error( 'k8sLogs',  ns, podName, containerName, err.message ) } )
        .then( req => {} )
      }
    }  
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
    let cnt = podLogs.length
    while ( cnt != 0 ) {
      let l = podLogs.shift() 
      let container = cluster.namespace[ l.ns ][ l.ms ][ l.po ].c[ l.c ]
      container.log.push({ ts: l.dt, log: l.log })
      cnt --
    }
    // log.info( 'cluster', cluster )
  } catch ( exc ) {
    log.error( 'getDta', exc )
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

async function loadMS( ns ) {
  let obj = {
    'ReplicaSet': {},
    'DaemonSet': {},
    'StatefulSet':{},
    'Job':{},
    'Ingress':{}
  }

  try {
    let lst = await k8sNetw.listNamespacedIngress( ns )
    for ( let d of lst.body.items ) {
      // log.info( d.metadata.name, d.status.loadBalancer )
      // log.info( d.metadata.name, JSON.stringify( d.spec.rules ) )
      // log.info( d.metadata.name, d.metadata )
      obj['Ingress'][ d.metadata.name ] = d.spec.rules
    }
  } catch ( e ) { log.warn( 'listNamespacedIngress', e.message ) } 

  try {
    let lst = await k8sApps.listNamespacedDeployment( ns )
    for ( let d of lst.body.items ) {
      // log.info( d.metadata.name,  d.spec.selector )
      obj['ReplicaSet'][ d.metadata.name ] = d.spec.selector
      if ( d.spec.selector.matchLabels['app.kubernetes.io/part-of'] ){ 
        let p = d.spec.selector.matchLabels['app.kubernetes.io/part-of']
        if ( obj.Ingress[ p ] ) {
          obj['ReplicaSet'][ d.metadata.name ].ingressRules = obj.Ingress[ p ]
          // log.info(  d.metadata.name, obj['ReplicaSet'][ d.metadata.name ] )
        }
      }
    }
  } catch ( e ) { log.warn( 'listNamespacedDeployment',  e.message ) } 
  try {
    let lst = await k8sApps.listNamespacedDaemonSet( ns )
    for ( let d of lst.body.items ) {
      // log.info( d.metadata.name,  d.spec.selector )
      obj['DaemonSet'][ d.metadata.name ] = d.spec.selector
    }
  } catch ( e ) { log.warn( 'listNamespacedDaemonSet',  e.message ) } 
  try {
    let lst = await k8sApps.listNamespacedStatefulSet( ns )
    for ( let d of lst.body.items ) {
      // log.info( d.metadata.name, d.spec.selector )
      obj['StatefulSet'][ d.metadata.name ] = d.spec.selector
    }
  } catch ( e ) { log.warn( 'listNamespacedStatefulSet',  e.message ) } 
  try {
    let lst = await k8sJobs.listNamespacedCronJob( ns )
    for ( let d of lst.body.items ) {
      // log.info( d.metadata.name, d )
      obj['Job'][ d.metadata.name ] = {}
    }  
  } catch ( e ) { log.verbose( 'listNamespacedCronJob',  e.message ) } 
  
  try {
    let lst = await k8sJobB.listNamespacedCronJob( ns )
    for ( let d of lst.body.items ) {
      // log.info( d.metadata.name, d.spec )
      obj['Job'][ d.metadata.name ] = {}
    }
  } catch ( e ) { log.warn( 'listNamespacedCronJob', e.message ) } 

  return obj
}

//-----------------------------------------------------------------------------

function getMsName( aPod, obj ) {
  let mgr = obj[ aPod.metadata.ownerReferences[0].kind ]
  let labels = aPod.metadata.labels
  // log.info( aPod.metadata.name, labels )
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
        if ( mgr[ x ].ingressRules ) {
          return { 
            msName : x,
            ingressRules : mgr[ x ].ingressRules
          }
        }
        return { msName : x }
      }
    }
  }
  return  { msName : aPod.metadata.name }
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
    for ( let pod of topPods ) {
      // log.info( pod.Pod.metadata.name, pod.CPU , pod.Memory )
      let memMB  = getMemMB( pod.Memory.CurrentUsage )
      podMetrics[ pod.Pod.metadata.name ] = {
        cpu : pod.CPU.CurrentUsage,
        mem : memMB
      }
    }
  } catch ( e ) { log.warn( 'getPodMetrics', ns, e.message ) }
  return podMetrics
}

//-----------------------------------------------------------------------------

async function getPods( ns, nodes ) {
  let pods = {}
  let po = await k8sApi.listNamespacedPod( ns )

  let obj = await loadMS( ns )
  let podMetrics = await getPodMetrics( ns )

  if ( po.body && po.body.items ) {
    for ( let aPod of po.body.items ) {
      try {
        // log.info(  aPod.metadata.name, aPod.metadata.ownerReferences[0].kind )  
        let svc  = getMsName( aPod, obj )
        let ms   = svc.msName
        let kind = aPod.metadata.ownerReferences[0].kind
        let podName = aPod.metadata.name

        let pod = { }
        
        if ( collCfg.indexOf( ns+'/'+ms ) >= 0 ) { // Pod is in scope !!
          // log.info( 'collCfg', ns+'/'+ms, collCfg  )
          pod = getPodWithAllDetails( pod, aPod, svc )
          if ( podMetrics[ podName ] ) {
            pod.cpu =  podMetrics[ podName ].cpu
            pod.mem =  podMetrics[ podName ].mem 
          }
          subscribePodLogs( ns, ms, podName, pod )
        }
        
        if ( podMetrics[ podName ] ) {
          nodes[ aPod.spec.nodeName ].cpu += podMetrics[ podName ].cpu
          nodes[ aPod.spec.nodeName ].mem += podMetrics[ podName ].mem
        }
        // log.info( aPod.spec.nodeName, podMetrics[ podName ].cpu, podMetrics[ podName ].mem)
        
        pod.n = nodes[ aPod.spec.nodeName ].no
        pod.k = ( kindMap[ kind ] ? kindMap[ kind ] : kind )
        pod.s = aPod.status.phase
        
        if ( ! pods[ ms ] ) { pods[ ms ] = {} }
        pods[ ms ][ podName ] = pod
          
      } catch ( exc ) {
        log.warn( 'getPods', exc )
      }
    }
  }
  // log.info( 'pods', pods )
  return pods
}

//-----------------------------------------------------------------------------

function getPodWithAllDetails( pod, aPod, svc ) {
  try {
    pod = { 
      ct : (new Date( aPod.metadata.creationTimestamp )).getTime(),
      st : (new Date( aPod.status.startTime )).getTime(),
      c  : {},
      ip : aPod.status.podIP,
      rc : 0,
      lt : Date.now()
    }        
    if ( svc.ingressRules ) {
      pod.in = svc.ingressRules
    }
    if ( aPod.status.containerStatuses ) {
      for ( let c of aPod.status.containerStatuses ) {
        pod.c[ c.name ] = {
          s  : ( c.started ? 'running' :'terminated' ),
          sr : c.reason,
          rc : c.restartCount,
          ci : c.image,
          lt : Date.now(),
          log : []
        }
        if ( c.restartCount > pod.PodRestartCount ) (
          pod.rc = c.restartCount 
        )
      }
    }
  } catch ( e ) { log.warn( 'getPodWithAllDetails', e.message, aPod ) }
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