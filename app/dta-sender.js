/*  Copyright (c) 2021 Lean Cloud Services GmbH  */

const axios = require( 'axios' )
const cfg   = require( 'config' )
const log   = require( 'npmlog' )

exports: module.exports = {
  sendDta
}

async function sendDta( dta ) {
  return new Promise( ( resolve, reject ) => {
    log.verbose( 'forward data ...',  cfg.MONITORING_CENTRAL_URL )
    try {
      axios.post( 
        cfg.MONITORING_CENTRAL_URL, 
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
        log.verbose( 'sendDta res', req.data  )
        resolve( req.data )
      }).catch( error => {
        log.warn( error )
        resolve()
      })
    } catch ( exc ) {
      log.error( 'postWebhook', exc.message )
      resolve()
    }
  })
}
