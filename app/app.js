/*  Copyright (c) 2021 Lean Cloud Services GmbH

    This work is licensed under 
    Creative Commons Attribution-NoDerivatives 4.0 International License.
    http://creativecommons.org/licenses/by-nd/4.0/ 
*/

const pjson      = require( './package.json' )
const cfg        = require( 'config' )
const log        = require( 'npmlog' )
const kubernetes = require( './dta-collector' )
const dtaSender  = require( './dta-sender' )

log.info( `Starting ${pjson.name} v${pjson.version}`, `NODE_ENV=${process.env.NODE_ENV}` )

if ( ! cfg.MONITORING_CENTRAL_URL ) {
  log.error( 'Configuration required!')
  process.exit( 1 )
}

let dtaInterval = cfg.DATA_INTERVAL
if ( process.env.DATA_INTERVAL ) {
  dtaInterval = process.env.DATA_INTERVAL
}

let logInterval = cfg.LOG_INTERVAL
if ( process.env.LOG_INTERVAL ) {
  logInterval = process.env.LOG_INTERVAL
}

async function start() {
  await kubernetes.init( dtaSender )
  await getDtaFromK8sAPI() // this will send basic data and returns scope: ns + ms
  await getDtaFromK8sAPI() // this will send now all details in scope
  setInterval( getDtaFromK8sAPI, dtaInterval )
  log.info( 'Sending logs every '+logInterval+' ms ... and on demand')
  setInterval( processLogs, logInterval )
  setInterval( printStatistics, 1000*60*60 )
}
logInterval
start()


let errCnt = 0 
let sndDtaCnt = 0
let errorState = false

async function getDtaFromK8sAPI() {
  log.verbose( 'gathering data ...')
  let dta = await kubernetes.getDta()
  if ( ! dta ) {
    log.error( 'Got no data to transfer!' )
    errCnt ++
    if ( errCnt > 10 ) { process.exit(1) } // otherwise no one might see the problem 
    errorState = true
    return
  }
  if ( dta ) {
    dta.collector = pjson.version
    dta.interval  = dtaInterval
    let collCfg = await dtaSender.sendDta( dta )
    if ( collCfg.error ) {
      errorState = true
    } else if (  collCfg ) {
      kubernetes.setCfg( collCfg )
      if ( errorState  || kubernetes.getErrState() ) {
        errorState = false
        log.info( 'OK, back to normal operation :-)')
      }
      sndDtaCnt++
    }
  }
}

async function processLogs() {
  await kubernetes.pushLogs()
}

function printStatistics() {
  let logStat = kubernetes.getLogStat()
  log.info( (new Date()).toISOString(), 
    'Metrics sent:', sndDtaCnt,
    'Logs sent:', logStat,
    'Errors:', errCnt,
  )
  kubernetes.resetLogStat()
  sndDtaCnt = 0
  errCnt = 0
}