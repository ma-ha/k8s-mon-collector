/*  Copyright (c) 2021 Lean Cloud Services GmbH

    This work is licensed under 
    Creative Commons Attribution-NoDerivatives 4.0 International License.
    http://creativecommons.org/licenses/by-nd/4.0/ 
*/

const pjson      = require( './package.json' )
const cfg        = require( 'config' )
const log        = require( 'npmlog' )
const collector  = require( './collector' )

log.info( (new Date()).toISOString(),
  `Starting ${pjson.name} v${pjson.version}`,
  `NODE_ENV=${process.env.NODE_ENV}` )

if ( ! cfg.MONITORING_CENTRAL_URL ) {
  log.error( 'Configuration required!')
  process.exit( 1 )
}

if ( process.env.SKIP_METRICS ) {
  log.warn( 'SKIP_METRICS is set ... really?' )
}

collector.start()