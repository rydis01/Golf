#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source scripts/java-env.sh
version=3.9.11
archive="apache-maven-$version-bin.tar.gz"
checksum=bcfe4fe305c962ace56ac7b5fc7a08b87d5abd8b7e89027ab251069faebee516b0ded8961445d6d91ec1985dfe30f8153268843c89aa392733d1a3ec956c9978
if [ ! -x ".tools/apache-maven-$version/bin/mvn" ]; then
  mkdir -p .tools
  curl --fail --silent --show-error --location --max-time 120 "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$version/$archive" -o ".tools/$archive"
  printf '%s  %s\n' "$checksum" ".tools/$archive" | sha512sum --check --status
  tar -xzf ".tools/$archive" -C .tools
  rm ".tools/$archive"
fi
python3 scripts/maven-proxy.py
exec ".tools/apache-maven-$version/bin/mvn" -s "$PWD/.tools/maven-settings.xml" "-Dmaven.repo.local=$PWD/.tools/m2" "$@"
