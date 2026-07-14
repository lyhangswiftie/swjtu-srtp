from urllib.parse import urlparse, urlunparse
import socket
from functools import lru_cache
from openhands.utils.environment import is_running_in_docker

@lru_cache(maxsize=1)
def _is_host_docker_internal_resolvable() -> bool:
     """Check if host.docker.internal is resolvable (only in bridge network mode)."""
     try:
         socket.getaddrinfo('host.docker.internal', None)
         return True
     except socket.gaierror:
         return False

def replace_localhost_hostname_for_docker(
    url: str, replacement: str = 'host.docker.internal'
) -> str:
    """Replace localhost hostname in URL with the specified replacement when running in Docker.

    This function only performs the replacement when the code is running inside a Docker
    container. When not running in Docker, it returns the original URL unchanged.

    Only replaces the hostname if it's exactly 'localhost', preserving all other
    parts of the URL including port, path, query parameters, etc.

    Args:
        url: The URL to process
        replacement: The hostname to replace localhost with (default: 'host.docker.internal')

    Returns:
        URL with localhost hostname replaced if running in Docker and hostname is localhost,
        otherwise returns the original URL unchanged
    """
    if not is_running_in_docker():
         return url
     # host 网络模式下 host.docker.internal 不可解析，应保留 localhost
    if not _is_host_docker_internal_resolvable():
         return url
    parsed = urlparse(url)
    if parsed.hostname == 'localhost':
         netloc = parsed.netloc.replace('localhost', replacement, 1)
         return urlunparse(parsed._replace(netloc=netloc))
