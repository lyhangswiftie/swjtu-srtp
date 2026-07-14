# SecureCodeAct: Sandbox Lifecycle Model

This document describes the lifecycle model of the OpenHands sandbox within the SecureCodeAct environment, particularly focusing on the startup grace period and UI synchronization.

## Lifecycle Phases

1. **Pre-Flight (Host)**: 
   - `install.sh` prepares the environment.
   - Environment variables (`AGENT_SERVER_STARTUP_GRACE_SECONDS`, `SCA_FORCE_RECREATE`, `SCA_UI_ONLY`) are evaluated.
   - Volume mounts are prepared (e.g., patching `docker_sandbox_service.py`).

2. **Container Initialization**:
   - Docker container `openhands-sca` is created or restarted.
   - Entrypoint script begins starting internal services (FastAPI server, Sandbox runtime).

3. **Startup Grace Period**:
   - The Agent Server requires time to initialize the local runtime (e.g., pulling the `ghcr.io/openhands/runtime` image, setting up internal networking).
   - Controlled by `AGENT_SERVER_STARTUP_GRACE_SECONDS` (default 90s).
   - If the runtime is not ready within this window, the Agent enters an `ERROR` state.

4. **API Readiness**:
   - `install.sh` polls `http://localhost:3000/api/options/config` until HTTP 200 is returned.
   - Frontend assets are injected via `docker cp`.
   - Initial settings (LLM config) and Provider Tokens (GitHub PAT) are injected via API.

5. **Agent Synchronization (UI)**:
   - The frontend connects via WebSocket.
   - Agent state transitions: `INIT` -> `RUNNING` -> `AWAITING_USER_INPUT`.
   - **Crucial Link**: The Repository Import State Machine cannot proceed until the Agent reaches `INIT` or `RUNNING`.

6. **Error State & Recovery**:
   - If the Agent enters `ERROR` state, the UI displays a diagnostic banner.
   - The user is provided with actionable steps (e.g., check LLM config, check Docker logs, restart container).

## Configuration Flags (v4.0)

- `SCA_FORCE_RECREATE=1`: Forces the deletion and recreation of the `openhands-sca` container during `install.sh`, ensuring a clean slate.
- `SCA_UI_ONLY=1`: Skips container restart and image pulling, only rebuilding the frontend and injecting it via `docker cp`. Ideal for rapid UI development.

## Diagnostic Tools

- `scripts/sca_doctor.sh` provides a comprehensive check of the lifecycle, including Docker status, API readiness, Agent grace period configuration, and recent logs.
