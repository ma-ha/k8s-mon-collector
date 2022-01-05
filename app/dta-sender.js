/*  Copyright (c) 2021 Lean Cloud Services GmbH

    This work is licensed under 
    Creative Commons Attribution-NoDerivatives 4.0 International License.
    http://creativecommons.org/licenses/by-nd/4.0/ 
*/

const axios = require( 'axios' )
const cfg   = require( 'config' )
const log   = require( 'npmlog' )

exports: module.exports = {
  sendDta,
  sendLogs,
  sendAccessStats,
  getStats
}

let sndStats = {
  sentDtaCnt: 0,
  sentLogsCnt: 0,
  sentAStsCnt: 0,
  errCnt: 0
}
async function sendDta( dta ) {
  sndStats.sentDtaCnt ++
  return await send( dta, '/mon/dta' )
}

let resendLogs = []
async function sendLogs( dta ) {
  while ( resendLogs.length > 0 ) {
    let snd = await send( resendLogs[0], '/mon/logs' )
    if ( snd.error ) { return }
    log.info( '... resend logs: OK' )
    resendLogs.shift()
  }
  let snd = await send( dta, '/mon/logs' )
  if ( snd.error ) {
    resendLogs.push( dta )
  } else {
    sndStats.sentLogsCnt ++
  }
  return snd
}


let resendStats = []
async function sendAccessStats( dta ) {
  while ( resendStats.length > 0 ) {
    let snd = await send( resendStats[0], '/mon/access-stats' )
    if ( snd.error ) { return }
    log.info( '... resend ingress stats: OK' )
    resendStats.shift()
  }
  let snd = await send( dta, '/mon/access-stats' )
  if ( snd.error ) {
    resendStats.push( dta )
  } else {
    sndStats.sentAStsCnt ++
  }
  return snd
}


async function send( dta, path ) {
  return new Promise( ( resolve, reject ) => {
    log.verbose( 'forward data ...', cfg.MONITORING_CENTRAL_URL, path )
    try {
      axios.post( 
        cfg.MONITORING_CENTRAL_URL + path, 
        dta,
        { headers: {
            monid : process.env['EKOSYS_ID'],
            key   : process.env['EKOSYS_KEY'],
          } 
        }
      ).then( req => {
        if ( req.request.res.statusCode != 200 ) {
          log.warn( sendDta, req.request.res.statusMessage )
          sndStats.errCnt ++
        }
        log.verbose( 'send res', req.data  )
        resolve( req.data )
      }).catch( error => {
        log.warn( 'send', path, error.message )
        sndStats.errCnt ++
        resolve({ error:error.message })
      })
    } catch ( exc ) {
      log.error( 'send', path, exc.message )
      sndStats.errCnt ++
      resolve({ error:error.message })
    }
  })
}

function getStats() {
  let result = JSON.parse( JSON.stringify( sndStats ) )
  for ( let key in sndStats ) { sndStats[ key ] = 0 }
  return result
}