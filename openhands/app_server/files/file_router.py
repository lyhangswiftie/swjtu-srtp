"""File listing router for OpenHands App Server.

Lists files in a conversation's sandbox workspace by running a lightweight
shell command inside the sandbox via the remote workspace API, avoiding
dependency on agent-server REST endpoints that may not be available.
"""

import logging
import shlex
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from starlette import status

from openhands.app_server.config import (
    depends_app_conversation_service,
    depends_sandbox_service,
    depends_sandbox_spec_service,
)
from openhands.app_server.sandbox.sandbox_models import (
    AGENT_SERVER,
    SandboxInfo,
    SandboxStatus,
)
from openhands.app_server.sandbox.sandbox_service import SandboxService
from openhands.app_server.sandbox.sandbox_spec_service import SandboxSpecService
from openhands.app_server.utils.docker_utils import (
    replace_localhost_hostname_for_docker,
)
from openhands.sdk.workspace.remote.async_remote_workspace import AsyncRemoteWorkspace
from openhands.server.dependencies import get_dependencies

_logger = logging.getLogger(__name__)

# Sandbox system directories that should never be shown to users.
_SYSTEM_DIRS = frozenset({
    'bash_events/',
    'conversations/',
})

router = APIRouter(
    prefix='/app-conversations', tags=['Files'], dependencies=get_dependencies()
)

app_conversation_service_dependency = depends_app_conversation_service()
sandbox_service_dependency = depends_sandbox_service()
sandbox_spec_service_dependency = depends_sandbox_spec_service()


async def _resolve_workspace(
    conversation_id: UUID,
    app_conversation_service,
    sandbox_service: SandboxService,
    sandbox_spec_service: SandboxSpecService,
) -> tuple[AsyncRemoteWorkspace, str] | tuple[None, JSONResponse]:
    """Resolve conversation → sandbox → workspace.

    Returns (workspace, working_dir) on success, or (None, error_response)
    when something is not ready.
    """
    conversation = await app_conversation_service.get_app_conversation(
        conversation_id
    )
    if not conversation:
        return None, JSONResponse(
            content={'error': 'Conversation not found', 'retryable': False},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    sandbox = await sandbox_service.get_sandbox(conversation.sandbox_id)
    if not sandbox:
        return None, JSONResponse(
            content={'error': 'Sandbox not found', 'retryable': True},
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if sandbox.status != SandboxStatus.RUNNING:
        return None, JSONResponse(
            content={
                'error': f'Sandbox not ready (status: {sandbox.status.value})',
                'retryable': True,
            },
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    agent_server_url = _extract_agent_url(sandbox)
    if not agent_server_url:
        return None, JSONResponse(
            content={
                'error': 'Agent server URL not available yet',
                'retryable': True,
            },
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    agent_server_url = replace_localhost_hostname_for_docker(agent_server_url)

    sandbox_spec = await sandbox_spec_service.get_sandbox_spec(sandbox.sandbox_spec_id)
    working_dir = sandbox_spec.working_dir if sandbox_spec else '/workspace'

    workspace = AsyncRemoteWorkspace(
        host=agent_server_url,
        api_key=sandbox.session_api_key,
        working_dir=working_dir,
    )
    return (workspace, working_dir), None


@router.get('/{conversation_id}/list-files')
async def list_files(
    conversation_id: UUID,
    path: Annotated[
        str | None,
        Query(title='Path to list files from within the sandbox workspace'),
    ] = None,
    app_conversation_service=app_conversation_service_dependency,
    sandbox_service: SandboxService = sandbox_service_dependency,
    sandbox_spec_service: SandboxSpecService = sandbox_spec_service_dependency,
) -> JSONResponse:
    """List files in a conversation's sandbox workspace.

    Runs ``ls -1p`` inside the sandbox via the remote workspace API and
    returns a sorted list of file and directory names (directories end
    with a trailing '/').

    Returns an empty list if the conversation or sandbox is not ready.
    """
    (workspace, working_dir), error = await _resolve_workspace(
        conversation_id,
        app_conversation_service,
        sandbox_service,
        sandbox_spec_service,
    )
    if error is not None:
        return error

    try:
        # Resolve target directory
        target_dir = working_dir
        if path is not None:
            if path.startswith('/'):
                target_dir = path
            else:
                target_dir = f'{working_dir}/{path}'

        # Run ls -1p: one entry per line, append '/' to directories.
        result = await workspace.execute_command(
            f'ls -1p {shlex.quote(target_dir)} 2>/dev/null || echo ""',
            working_dir,
        )

        if result.exit_code != 0 or not result.stdout:
            return JSONResponse(content=[])

        # Parse output and filter out sandbox system directories
        lines = [line for line in result.stdout.strip().split('\n') if line]
        directories = sorted(
            [
                line for line in lines
                if line.endswith('/') and line not in _SYSTEM_DIRS
            ],
            key=str.lower,
        )
        files = sorted(
            [line for line in lines if not line.endswith('/')],
            key=str.lower,
        )

        sorted_entries = directories + files
        _logger.info(
            'list-files result: %d entries — %s',
            len(sorted_entries),
            sorted_entries[:6],
        )
        return JSONResponse(content=sorted_entries)

    except Exception:
        _logger.exception(
            'Failed to list files for conversation %s',
            conversation_id,
        )
        return JSONResponse(
            content={
                'error': 'Internal server error listing files',
                'retryable': True,
            },
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get('/{conversation_id}/select-file')
async def select_file(
    conversation_id: UUID,
    file: Annotated[
        str,
        Query(title='File path relative to the sandbox workspace'),
    ],
    app_conversation_service=app_conversation_service_dependency,
    sandbox_service: SandboxService = sandbox_service_dependency,
    sandbox_spec_service: SandboxSpecService = sandbox_spec_service_dependency,
) -> JSONResponse:
    """Read a file's content from the sandbox workspace.

    Runs ``cat`` on the requested file path inside the sandbox and returns
    the content as ``{"code": "..."}`` (matching the V0 response shape for
    backward compatibility).
    """
    (workspace, working_dir), error = await _resolve_workspace(
        conversation_id,
        app_conversation_service,
        sandbox_service,
        sandbox_spec_service,
    )
    if error is not None:
        return error

    # Resolve the absolute file path
    if file.startswith('/'):
        target = file
    else:
        target = f'{working_dir}/{file}'

    try:
        result = await workspace.execute_command(
            f'cat {shlex.quote(target)} 2>/dev/null || echo ""',
            working_dir,
        )
        if result.exit_code != 0 or not result.stdout:
            return JSONResponse(
                content={'error': 'File not found', 'file': file},
                status_code=status.HTTP_404_NOT_FOUND,
            )
        return JSONResponse(content={'code': result.stdout, 'content': result.stdout})
    except Exception:
        _logger.exception(
            'Failed to read file for conversation %s: %s',
            conversation_id,
            file,
        )
        return JSONResponse(
            content={'error': 'Internal server error reading file'},
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _extract_agent_url(sandbox: SandboxInfo) -> str | None:
    """Extract the agent server URL from sandbox exposed URLs."""
    if not sandbox.exposed_urls:
        return None
    for exposed_url in sandbox.exposed_urls:
        if exposed_url.name == AGENT_SERVER:
            return exposed_url.url
    return None
