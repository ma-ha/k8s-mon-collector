/*  Copyright (c) 2022 Lean Cloud Services GmbH

    This work is licensed under 
    Creative Commons Attribution-NoDerivatives 4.0 International License.
    http://creativecommons.org/licenses/by-nd/4.0/ 
*/
const cfg     = require( 'config' )
const log     = require( 'npmlog' )
const stream  = require( 'stream' )
const accStat = require( './dta-acc-stats' )

exports: module.exports = {
  init,
  setConfig,
  pushLogs,
  needCollectLogs,
  subscribePodLogs
}

//-----------------------------------------------------------------------------
// collector may get config not send out logs (compliance...)
let collectLogs = true
let collectAllLogs = false
let dtaSender = null
let k8sLogs  = null
let collCfg = []

async function init( logApi, sender ) {
  accStat.init( sender )

  dtaSender = sender 
  k8sLogs   = logApi
  collectAllLogs = cfg.LOG_ALL_PODS

  setInterval( reSubscribeLogs, 1000 * 60 * cfg.LOG_RENEW_STREAM_MIN )
}

function setConfig( collectorCfg ) {
  accStat.setCfg( collectorCfg )
  if ( collectorCfg.ms) {
    collCfg = collectorCfg.ms
  }
  if ( collectorCfg.collectLogs) {
    if ( collectLogs != collectorCfg.collectLogs ) {
      collectLogs = collectorCfg.collectLogs
      reSubscribeLogs()  
    }
  }
  if ( collectorCfg.collectAllLogs ) {
    if ( collectLogs != collectorCfg.collectLogs ) {
      collectLogs = collectorCfg.collectLogs 
    }
  } 
}

function needCollectLogs( ns, ms ) {
  if ( collectAllLogs ) { return true }
  if ( collCfg.indexOf( ns+'/'+ms ) >= 0 ) { return true } // Pod is in scope !!
  return false
}

//-----------------------------------------------------------------------------
// https://nodejs.org/api/stream.html#readabledestroyerror
let logStreamMap = {}
let podLogs = []
let pushing = false

async function pushLogs() {
  await accStat.sendStats()

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
        let cid = l.ns + l.po
        if ( ! logs[ cid ] ) {
          logs[ cid ] = {
            ns   : l.ns,
            ms   : l.ms,
            pod  : l.po,
            logs : []
          }
        }
        logs[ cid ].logs.push({ ts: l.dt, log: l.log })  
      } catch ( exc ) { log.warn( 'pushLogs', l.ns, l.ms, l.po, l.c, exc.message ) }
      cnt --
    }
    // send out the logs
    await dtaSender.sendLogs( logs )

  } catch ( err ) { log.warn( 'pushLogs', err.message ) }
  pushing = false
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
  log.verbose( 'subscribePodLogs', ns, ms, podName )
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
      log.info( 'subscribeContainerLogs initial', streamId )
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
      let logStr =  chunk + ''
      podLogs.push({
        dt  : Date.now(),
        ns  : ns, 
        ms  : ms, 
        po  : podName, 
        c   : containerName,
        log : logStr
      })
      accStat.extractStats( ns, ms, logStr )

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
