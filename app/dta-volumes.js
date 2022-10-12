/*  Copyright (c) 2022 Lean Cloud Services GmbH

    This work is licensed under 
    Creative Commons Attribution-NoDerivatives 4.0 International License.
    http://creativecommons.org/licenses/by-nd/4.0/ 
*/
const log    = require( 'npmlog' )

exports: module.exports = {
  init,
  loadPvcArr,
  addPodVolumes
}

//-----------------------------------------------------------------------------

let k8sApi = null
let pvc = {}

async function init( api ) {
  k8sApi = api
}

//-----------------------------------------------------------------------------

async function loadPvcArr() {
  try {
    let pvcRes = await k8sApi.listPersistentVolumeClaimForAllNamespaces()
    // let xs = await k8sSto.listVolumeAttachment( ) 
    // log.info( JSON.stringify( xs.body, null, '  ' ))
    for ( p of pvcRes.body.items ) try {
      let newPVC = {
        name : p.metadata.name,
        ns   : p.metadata.namespace,
        cap  : p.status.capacity.storage,
        spec : p.spec,
        status : p.status
      }
      pvc[ p.metadata.name ] = newPVC
      log.verbose( JSON.stringify( newPVC, null, '  ' ))
    } catch (exc) { log.error( 'loadPvcArr', exc.message ) } 
  } catch (exc) { log.error( 'loadPvcArr', exc.message ) }
}

//-----------------------------------------------------------------------------

function addPodVolumes( pod, aPod ) {
  pod.v = {}
  if ( aPod.spec.volumes ) {
    for ( v of aPod.spec.volumes ) {
      if (  v.persistentVolumeClaim ) {
        let p = pvc[v.persistentVolumeClaim.claimName ]
        pod.v[ v.name ] = {
          pvc  : v.persistentVolumeClaim.claimName,
          cap  : p.cap,
          acc  : p.spec.accessModes,
          sc   : p.spec.storageClassName,
          mode : p.spec.volumeMode,
          vol  : p.spec.volumeName,
          status  : p.status.phase
        }
      }
    }
  }  
}