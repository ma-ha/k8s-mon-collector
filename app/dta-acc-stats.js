/*  Copyright (c) 2021 Lean Cloud Services GmbH

    This work is licensed under 
    Creative Commons Attribution-NoDerivatives 4.0 International License.
    http://creativecommons.org/licenses/by-nd/4.0/ 
*/

const cfg    = require( 'config' )
const log    = require( 'npmlog' )

exports: module.exports = {
  init,
  setCfg,
  extractStats,
  sendStats
}

let dtaSender = null

let logRegExp = new RegExp( cfg.ACCESS_LOG_REGEXP )
let collectStats = false
let stats = {}
let needSend = false

async function init( sender ) {
  dtaSender = sender 
}


function setCfg( collectorCfg ) {
  if ( collectorCfg.collectAccessLogs && ! collectStats ) {
    log.info( 'Feature Enabled', 'collectAccessLogs' )
  }
  collectStats = collectorCfg.collectAccessLogs
}

//-----------------------------------------------------------------------------

async function sendStats() {
  if ( collectStats && needSend ) {
    let sendStats = JSON.parse( JSON.stringify( stats ) )
    stats = {}
    await dtaSender.sendAccessStats( sendStats )
    needSend = false
  }
}
//-----------------------------------------------------------------------------

function extractStats( ns, ms, logStr ) {
  if ( collectStats &&  logStr.indexOf(' - - [') > 0 ) try {
    let logInfo = parseAccessInfo( logStr )
    // log.info( 'logInfo', logInfo )
    let msId = ns+'/'+ms
    chkStatsExists( msId )
    for ( let rec of logInfo ) {
      statTot( stats[ msId ].acc, rec.s )
      statURL( stats[ msId ].url, rec.u, rec.m )
      statClt( stats[ msId ].clt, rec.c )
      needSend = true
    }
  } catch ( exc ) { log.warn( 'extractStats', exc.message ) }
}

//-----------------------------------------------------------------------------

function statTot( accStat, httpStatus ) {
  accStat.s ++
  if ( ! accStat[ httpStatus ] ) {
    accStat[ httpStatus ] = 0
  }
  accStat[ httpStatus ] ++
}

//-----------------------------------------------------------------------------

function statURL( urlStat, url, method ) {
  if ( ! urlStat[ url ] ) {
    urlStat[ url ] = { s: 0 }
  }
  urlStat[ url ].s ++

  if ( ! urlStat[ url ][ method ] ) {
    urlStat[ url ][ method ] = 0 
  }
  urlStat[ url ][ method ] ++
}

//-----------------------------------------------------------------------------

function statClt( cltStat, clt ) {
  if ( ! cltStat[ clt ] ) {
    cltStat[ clt ] = 0
  }
  cltStat[ clt ] ++
}

//-----------------------------------------------------------------------------

function parseAccessInfo( logStr ) {
  let accInf = []
  let logLines = logStr.split( '\n' )
  for ( let line of logLines ) {
    let parsed = logRegExp.exec( line )
    if ( parsed && ! parsed[1].startsWith('10.') ) {
      log.verbose( 'logLines >>', parsed )
      let url  = parsed[ cfg.ACCESS_LOG_REGEXP_URL ]
      let urlQ = url.indexOf('?')
      if ( urlQ > 0 ) { url = url.substring( 0, urlQ ) }

      let status = parsed[8]
      if ( status[0] == '2' ) { status ='2xx' } else
      if ( status[0] == '3' ) { status ='3xx' } else 
      if ( status[0] == '4' ) { status ='4xx' } else 
      if ( status[0] == '5' ) { status ='5xx' } else { status ='2xx' }

      accInf.push({
        i: parsed[ cfg.ACCESS_LOG_REGEXP_IP ] ,
        m: parsed[ cfg.ACCESS_LOG_REGEXP_METHOD ],
        u: url,
        s: status,
        c: parsed[ cfg.ACCESS_LOG_REGEXP_CLT ],
      })
    } else {
      log.verbose( 'logLines XX', line )
    }
  }
  return accInf
}

//-----------------------------------------------------------------------------

function chkStatsExists( msId ) {
  if ( ! stats[ msId ] ) { 
    stats[ msId ] = { 
      acc: {
        s: 0
      },
      clt: {},
      url: {}
    } 
  }
}