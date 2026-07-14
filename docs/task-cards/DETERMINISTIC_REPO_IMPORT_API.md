# SecureCodeAct: Deterministic Repository Import API

This document details the API integration for importing GitHub repositories into SecureCodeAct, focusing on pagination, error handling, and deterministic behavior.

## API Endpoint

`GET /api/user/repositories`

**Parameters:**
- `selected_provider` (string): Usually `github`.
- `page` (integer): Pagination offset (1-indexed).
- `per_page` (integer): Number of results per page (max 100).

## Pagination Robustness

The frontend implements robust pagination handling:
- **Boundary Checks**: Prevents `page=0` requests.
- **Limit Enforcement**: Ensures `per_page` does not exceed the GitHub API maximum (100).
- **Infinite Scroll / Load More**: The UI tracks `currentPage` and `hasMore` state to load repositories incrementally, avoiding massive single payloads that could timeout or crash the backend.

## Error Classification

The `GitServiceError` class provides a deterministic way to handle API failures:

```typescript
export enum GitErrorType {
  UNAUTHORIZED = 'UNAUTHORIZED', // HTTP 401: Token missing or invalid
  NOT_FOUND = 'NOT_FOUND',       // HTTP 404: Repo doesn't exist or no access
  RATE_LIMITED = 'RATE_LIMITED', // HTTP 429: GitHub API limit reached
  NETWORK_ERROR = 'NETWORK_ERROR',// Connection failed
  UNKNOWN = 'UNKNOWN'            // Other HTTP errors (500, etc.)
}
```

This classification allows the UI to display specific, actionable guidance rather than generic "Failed to load" messages.

## Integration with State Machine

The API calls are tightly coupled with the `RepositoryImportState` machine:
1. `fetchRepositories` -> Updates UI list.
2. User selects repo -> State: `VALIDATING`.
3. Call `/api/github/repositories/{owner}/{repo}` (simulated or real validation).
4. Success -> State: `CLONING`.
5. Call OpenHands Agent command to clone repo into workspace.
6. Success -> State: `INDEXING` -> `READY`.

## Security Considerations

- **Token Storage**: The `GITHUB_TOKEN` is injected via `install.sh` using a secure temporary file payload to `/api/add-git-providers`, avoiding exposure in process lists.
- **API Proxy**: The backend acts as a proxy, ensuring the frontend never handles the raw GitHub PAT directly.
