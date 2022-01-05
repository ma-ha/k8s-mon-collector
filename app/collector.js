/*  Copyright (c) 2021 Lean Cloud Services GmbH

    This work is licensed under 
    Creative Commons Attribution-NoDerivatives 4.0 International License.
    http://creativecommons.org/licenses/by-nd/4.0/ 
*/
const cfg        = require( 'config' )
const log        = require( 'npmlog' )
const kubernetes = require( './dta-collector' )
const dtaSender  = require( './dta-sender' )
const pjson      = require( './package.json' )

exports: module.exports = {
  start
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
  if ( ! cfg.MONITORING_CENTRAL_URL ) {
    throw  "MONITORING_CENTRAL_URL missing in config"
  }
  await kubernetes.init( dtaSender )
  await getDtaFromK8sAPI() // this will send basic data and returns scope: ns + ms
  await getDtaFromK8sAPI() // this will send now all details in scope
  setInterval( getDtaFromK8sAPI, dtaInterval )
  log.info( 'Sending logs every '+logInterval+' ms ... and on demand')
  setInterval( processLogs, logInterval )
  setInterval( printStatistics, 1000*60*60 )
}

// ----------------------------------------------------------------------------

let errCnt = 0 
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
    }
  }
}

async function processLogs() {
  await kubernetes.pushLogs()
}

function printStatistics() {
  let dtaStat = dtaSender.getStats()
  log.info( (new Date()).toISOString(), 
    'MetricsSent:',     dtaStat.sentDtaCnt,
    'LogsSent:',        dtaStat.sentLogsCnt,
    'AccessStatsSent:', dtaStat.sentAStsCnt,
    'Errors:',          errCnt,
    'SendErrors:',      dtaStat.errCnt
  )
  errCnt = 0
}