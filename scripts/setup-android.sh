#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/java-env.sh
export ANDROID_HOME="$PWD/.tools/android-sdk"
export ANDROID_USER_HOME="$PWD/.tools/android-user"
export GRADLE_USER_HOME="$PWD/.tools/gradle"
mkdir -p "$ANDROID_HOME" "$ANDROID_USER_HOME" "$GRADLE_USER_HOME" "$PWD/.tools/tool-home"
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Duser.home=$PWD/.tools/tool-home"
python3 - <<'PY'
import os
from pathlib import Path
from urllib.parse import urlsplit
url=os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
lines=['org.gradle.jvmargs=-Xmx2048m', 'org.gradle.workers.max=2']
if url:
    u=urlsplit(url)
    if u.scheme!='http' or not u.hostname or u.username or u.password: raise SystemExit('Unsupported proxy configuration')
    for protocol in ['http','https']:
        lines.extend([f'systemProp.{protocol}.proxyHost={u.hostname}', f'systemProp.{protocol}.proxyPort={u.port or 80}', f'systemProp.{protocol}.nonProxyHosts=localhost|127.0.0.1'])
Path(os.environ['GRADLE_USER_HOME'],'gradle.properties').write_text('\n'.join(lines)+'\n')
PY
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  curl --fail --silent --show-error --location --max-time 180 https://dl.google.com/android/repository/commandlinetools-linux-16111833_latest.zip -o .tools/android-commandline.zip
  printf '%s  %s\n' e025545c62a8e64c7559119566a569fb1dec5f60 .tools/android-commandline.zip | sha1sum --check --status
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  python3 - <<'PY'
import zipfile,os
with zipfile.ZipFile('.tools/android-commandline.zip') as z: z.extractall(os.environ['ANDROID_HOME']+'/cmdline-tools')
PY
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  chmod +x "$ANDROID_HOME/cmdline-tools/latest/bin/"*
  rm .tools/android-commandline.zip
fi
sdk_args=("--sdk_root=$ANDROID_HOME")
if [ -n "${HTTPS_PROXY:-${HTTP_PROXY:-}}" ]; then
  read -r proxy_host proxy_port < <(python3 - <<'PY'
import os
from urllib.parse import urlsplit
u=urlsplit(os.environ.get('HTTPS_PROXY') or os.environ['HTTP_PROXY'])
print(u.hostname, u.port or 80)
PY
  )
  sdk_args+=(--proxy=http "--proxy_host=$proxy_host" "--proxy_port=$proxy_port")
fi
# Accept Google's SDK licenses for this development SDK; no store agreements or signing keys.
set +o pipefail
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "${sdk_args[@]}" --licenses > .tools/android-licenses.log 2>&1
sdk_status=${PIPESTATUS[1]}
set -o pipefail
if [ "$sdk_status" -ne 0 ]; then cat .tools/android-licenses.log; exit "$sdk_status"; fi
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "${sdk_args[@]}" 'platforms;android-35' 'build-tools;35.0.0' 'platform-tools'
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > mobile/android/local.properties
