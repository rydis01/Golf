#!/usr/bin/env bash
# Source from the repository root to activate a complete Java 21 JDK.
golf_jdk_dir="$PWD/.tools/jdk-21.0.12.1+1"
if [ -x "$golf_jdk_dir/bin/javac" ]; then
  export JAVA_HOME="$golf_jdk_dir"
elif [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/javac" ]; then
  :
elif command -v javac >/dev/null 2>&1; then
  export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"
else
  mkdir -p .tools
  curl --fail --silent --show-error --location --max-time 180 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_linux_hotspot_21.0.12.1_1.tar.gz' -o .tools/jdk.tar.gz
  printf '%s  %s\n' ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94 .tools/jdk.tar.gz | sha256sum --check --status
  tar -xzf .tools/jdk.tar.gz -C .tools
  rm .tools/jdk.tar.gz
  export JAVA_HOME="$golf_jdk_dir"
fi
export PATH="$JAVA_HOME/bin:$PATH"
# Reuse the managed machine's trusted CA store, including the cloud HTTPS proxy CA.
if [ -r /etc/ssl/certs/java/cacerts ] && [[ "${JAVA_TOOL_OPTIONS:-}" != *javax.net.ssl.trustStore=* ]]; then
  export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts"
fi
unset golf_jdk_dir
