#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/java-env.sh
export ANDROID_HOME="$PWD/.tools/android-sdk"
export ANDROID_USER_HOME="$PWD/.tools/android-user"
export GRADLE_USER_HOME="$PWD/.tools/gradle"
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Duser.home=$PWD/.tools/tool-home"
if [ ! -d "$ANDROID_HOME/platforms/android-35" ]; then ./scripts/setup-android.sh; fi
cd mobile
npm run check
npm run sync
cd android
./gradlew --no-daemon --max-workers=2 assembleDebug
