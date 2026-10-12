#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/java-env.sh
if [ ! -f target/golf-caddie-0.1.0.jar ]; then ./mvnw -B package; fi
mkdir -p .runtime
golf_run_jar=$(mktemp "$PWD/.runtime/server-XXXXXX.jar")
cp target/golf-caddie-0.1.0.jar "$golf_run_jar"
# Keep the running classpath immutable while developers rebuild target/.
exec java -jar "$golf_run_jar"
