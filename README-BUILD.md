# Build the Docker Image

To use your private image registry, just change the REPO value.
Maybe a different login command is required.

    export VERSION=$(cat app/package.json | jq -r .version)
    export REPO=leancloudservices
    docker build -t $REPO/k8s-mon-collector:$VERSION .
    docker login -u $REPO
    docker push $REPO/k8s-mon-collector:$VERSION