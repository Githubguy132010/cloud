#!/bin/bash
# Startup script for OpenClaw on Fly.io Machines
#
# All bootstrap logic (env decryption, onboard/doctor, config patching,
# feature flags, GitHub config) has moved into the controller's TypeScript
# bootstrap module (controller/src/bootstrap.ts). The controller starts its
# HTTP server first (so /_kilo/health is always reachable), then runs
# bootstrap internally with phase-by-phase progress reporting.
#
# This shell script is now a thin wrapper that guards against duplicate
# processes and exec's the controller.

set -e

if pgrep -f "kiloclaw-controller" > /dev/null 2>&1; then
    echo "Controller is already running, exiting."
    exit 0
fi

exec node /usr/local/bin/kiloclaw-controller.js
