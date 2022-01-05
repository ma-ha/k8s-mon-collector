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
let errIPs = {}

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
    addErrIPtoStat( sendStats )
    await dtaSender.sendAccessStats( sendStats )
    needSend = false
  }
}

//-----------------------------------------------------------------------------

function extractStats( ns, ms, logStr ) {
  if ( collectStats &&  logStr.indexOf(' - - [') > 0 ) try {
    let msId = ns+'/'+ms
    chkStatsExists( msId )
    let logInfo = parseAccessInfo( msId, logStr )
    // log.info( 'logInfo', logInfo )
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

function parseAccessInfo( msId, logStr ) {
  let accInf = []
  let logLines = logStr.split( '\n' )
  for ( let line of logLines ) {
    let parsed = logRegExp.exec( line )
    if ( parsed && parsed[1] && ! parsed[1].startsWith('10.') ) {
      log.verbose( 'logLines >>', parsed )
      let httpMethod = parsed[ cfg.ACCESS_LOG_REGEXP_METHOD ]
      let url  = parsed[ cfg.ACCESS_LOG_REGEXP_URL ]
      let clt  = parsed[ cfg.ACCESS_LOG_REGEXP_CLT ]
      let urlQ = url.indexOf('?')
      if ( urlQ > 0 ) { url = url.substring( 0, urlQ ) }

      let status = parsed[8]
      let ipAdd  = parsed[ cfg.ACCESS_LOG_REGEXP_IP ]
      if ( status[0] == '2' ) { status ='2xx' } else
      if ( status[0] == '3' ) { status ='3xx' } 
      else {
        if ( status[0] == '4' ) { status ='4xx' } else 
        if ( status[0] == '5' ) { status ='5xx' } else { status ='2xx' }
        addErrIP( msId, ipAdd, httpMethod+' '+url, clt )
      }

      accInf.push({
        i: ipAdd,
        m: httpMethod,
        u: url,
        s: status,
        c: clt,
      })
    } else {
      log.verbose( 'logLines XX', line )
    }
  }
  return accInf
}

//-----------------------------------------------------------------------------
// detect potential IPs to ban

function addErrIP( msId, ipAdd, url, clt ) {
  log.info( 'addErrIP', ipAdd, url, clt )
  if ( ! errIPs[ msId ] ) { errIPs[ msId ] = {} }
  if ( ! errIPs[ msId ][ ipAdd ] ) {
    stats[ msId ].errIPs[ ipAdd ] = {
      cnt  : 1,
      last : Date.now(),
      clt  : clt
    }
  } else { 
    errIPs[ msId ][ ipAdd ].cnt ++ 
    errIPs[ msId ][ ipAdd ].last = Date.now()
  }
}

function addErrIPtoStat( stat ) {
  try {
    let now = Date.now()
    for ( let msId in stat ) {
      for ( let ip in errIPs[ msId ] ) {
        if ( ( now - errIPs[ msId ][ ip ].last ) < cfg.DATA_INTERVAL ) {
          if ( errIPs[ msId ][ ip ].cnt > cfg.ACCESS_IP_ERR_ANOMALY ) {
            stat[ msId ].errIPs[ ip ] = errIPs[ ip ].cnt
          }
        }
      }
      reduceErrIpsCnts( msId )
    }
  } catch ( exc ) { log.info( 'addErrIPtoStat', exc ) }
}

function reduceErrIpsCnts( msId ) {
  let now = Date.now()
  for ( ip in errIPs[ msId ] ) {
    // too new errors?
    if ( ( now - errIPs[ msId ][ ip ].last ) < cfg.DATA_INTERVAL ) continue
    // reduce
    if ( errIPs[ msId ][ ip ].cnt < 5 ) {
      delete  errIPs[ msId ][ ip ]
    } else {
      errIPs[ msId ][ ip ].cnt -= 5
    }
  }
}

//-----------------------------------------------------------------------------

function chkStatsExists( msId ) {
  if ( ! stats[ msId ] ) { 
    stats[ msId ] = { 
      acc: {
        s: 0
      },
      clt: {},
      url: {},
      errIPs : {}
    } 
  }
}