# Build the Docker Image

    export VERSION=$(cat app/package.json | jq -r .version)
    export REPO=leancloudservices
    docker build -t $REPO/k8s-mon-collector:$VERSION .
    docker login -u $REPO
    docker push $REPO/k8s-mon-collector:$VERSION