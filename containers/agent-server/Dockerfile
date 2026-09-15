# Custom agent server image based on the official OpenHands agent server.
# Adds git API endpoints (/api/git/changes, /api/git/diff) required by
# the V1 app server's git proxy routes.
FROM ghcr.io/openhands/agent-server:1.47.0-python

# Override the action execution server with our modified version
# that includes /api/git/changes and /api/git/diff routes
COPY openhands/runtime/action_execution_server.py /openhands/code/openhands/runtime/action_execution_server.py
