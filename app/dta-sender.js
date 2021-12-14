/*  Copyright (c) 2021 Lean Cloud Services GmbH  */

const axios = require( 'axios' )
const cfg   = require( 'config' )
const log   = require( 'npmlog' )

exports: module.exports = {
  sendDta,
  sendLogs
}

async function sendDta( dta ) {
  return await send( dta, '/mon/dta' )
}

async function sendLogs( dta ) {
  return await send( dta, '/mon/logs' )
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
        }
        log.verbose( 'send res', req.data  )
        resolve( req.data )
      }).catch( error => {
        log.warn( 'send', path, error.message )
        resolve()
      })
    } catch ( exc ) {
      log.error( 'send', path, exc.message )
      resolve()
    }
  })
}
