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
  getSendErrCnt
}

async function sendDta( dta ) {
  return await send( dta, '/mon/dta' )
}

async function sendLogs( dta ) {
  return await send( dta, '/mon/logs' )
}

async function sendAccessStats( dta ) {
  return await send( dta, '/mon/access-stats' )
}

let errCnt = 0

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
          errCnt ++
        }
        log.verbose( 'send res', req.data  )
        resolve( req.data )
      }).catch( error => {
        log.warn( 'send', path, error.message )
        errCnt ++
        resolve({ error:error.message })
      })
    } catch ( exc ) {
      log.error( 'send', path, exc.message )
      errCnt ++
      resolve({ error:error.message })
    }
  })
}

function getSendErrCnt() {
  let result =0
  result += errCnt
  errCnt = 0
  return result
}