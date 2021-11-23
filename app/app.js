/*  Copyright (c) 2021 Lean Cloud Services GmbH  */

const pjson      = require( './package.json' )
const cfg        = require( 'config' )
const log        = require( 'npmlog' )
const kubernetes = require( './dta-collector' )
const dtaSender  = require( './dta-sender' )

log.info( `Starting ${pjson.name} v${pjson.version} NODE_ENV=${process.env.NODE_ENV}` )

if ( ! cfg.MONITORING_CENTRAL_URL ) {
  log.error( 'Configuration required!')
  process.exit( 1 )
}

let dtaInterval = cfg.DATA_INTERVAL
if ( process.env.DATA_INTERVAL ) {
  dtaInterval = process.env.DATA_INTERVAL
}

async function start() {
  await kubernetes.init()
  getDtaFromK8sAPI() // this will send basic data and returns scope: ns + ms
  getDtaFromK8sAPI() // this will send now all details in scope
  setInterval( getDtaFromK8sAPI, dtaInterval )
}

start()

let errCnt = 0 
async function getDtaFromK8sAPI() {
  log.verbose( 'gathering data ...')
  let dta = await kubernetes.getDta()
  if ( ! dta ) {
    log.error( 'Got no data to transfer!' )
    errCnt ++
    if ( errCnt > 10 ) { process.exit(1) }
    return
  }
  dta.collector = pjson.version
  dta.interval  = dtaInterval
  if ( dta ) {
    let collCfg = await dtaSender.sendDta( dta )
    kubernetes.setCfg( collCfg )
  }
}