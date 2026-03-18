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

# Guard against an orphaned gateway from a previous controller that died.
# The controller supervises the gateway, but if the controller is replaced
# while the gateway briefly survives, the new controller would fail to bind
# port 3001. Exit early so Fly's process manager can clean up first.
if pgrep -f "openclaw gateway" > /dev/null 2>&1; then
    echo "OpenClaw gateway is already running, exiting."
    exit 0
fi

exec node /usr/local/bin/kiloclaw-controller.js
