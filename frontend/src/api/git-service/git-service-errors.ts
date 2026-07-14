/**
 * git-service-errors.ts
 *
 * TC-SCA-REPO-SANDBOX-USABILITY-004 — Commit 1 (v2: pre-merge fixes)
 *
 * GitService 错误分类体系：
 * - GitServiceErrorCode：枚举所有可能的错误类型
 * - GitServiceError：携带分类码和原始错误的自定义 Error 子类
 * - classifyGitError：将 Axios 错误转换为 GitServiceError（支持 endpoint-aware 上下文）
 *
 * 错误分类依据：
 *   401 → AUTH_FAILED（Token 无效或过期）
 *   403 + rate-limit header/body → RATE_LIMITED（GitHub rate limit 有时返回 403）
 *   403 → PERMISSION_DENIED（无仓库访问权限）
 *   404 + endpoint=user_repositories → ROUTE_NOT_FOUND（路由未注册或 APP_MODE 异常）
 *   404 → REPO_NOT_FOUND（仓库不存在或未安装 App）
 *   422 → INVALID_PARAMS（请求参数错误，如分支名非法）
 *   429 → RATE_LIMITED（GitHub API 速率限制）
 *   5xx → SERVER_ERROR（上游服务错误）
 *   network → NETWORK_ERROR（网络不可达）
 *   其他 → UNKNOWN
 */

export enum GitServiceErrorCode {
  AUTH_FAILED = "AUTH_FAILED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  REPO_NOT_FOUND = "REPO_NOT_FOUND",
  /** 路由未注册或 APP_MODE 异常（/api/user/repositories 返回 404） */
  ROUTE_NOT_FOUND = "ROUTE_NOT_FOUND",
  INVALID_PARAMS = "INVALID_PARAMS",
  RATE_LIMITED = "RATE_LIMITED",
  SERVER_ERROR = "SERVER_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  UNKNOWN = "UNKNOWN",
}

/** 人类可读的错误说明（用于 UI Banner 展示） */
export const GIT_ERROR_MESSAGES: Record<GitServiceErrorCode, string> = {
  [GitServiceErrorCode.AUTH_FAILED]:
    "GitHub Token 认证失败（401）。请检查 GITHUB_TOKEN 是否有效，或在 Settings 中重新授权。",
  [GitServiceErrorCode.PERMISSION_DENIED]:
    "无仓库访问权限（403）。请确认 Token 拥有 repo 读取权限。",
  [GitServiceErrorCode.REPO_NOT_FOUND]:
    "仓库未找到（404）。请检查仓库名称，或确认已安装 GitHub App。",
  [GitServiceErrorCode.ROUTE_NOT_FOUND]:
    "API 路由未找到（404）。可能是 APP_MODE 配置异常或 git_api_router 未注册，请检查 OpenHands 容器日志。",
  [GitServiceErrorCode.INVALID_PARAMS]:
    "请求参数无效（422）。请检查分支名称或分页参数是否合法。",
  [GitServiceErrorCode.RATE_LIMITED]:
    "GitHub API 速率限制（429/403）。请稍后重试，或使用 Personal Access Token 提升限额。",
  [GitServiceErrorCode.SERVER_ERROR]:
    "上游服务错误（5xx）。OpenHands 后端或 GitHub 服务暂时不可用，请稍后重试。",
  [GitServiceErrorCode.NETWORK_ERROR]:
    "网络连接失败。请检查网络连接，或确认 OpenHands 容器正在运行。",
  [GitServiceErrorCode.UNKNOWN]: "未知错误，请查看控制台日志获取详情。",
};

/** classifyGitError 调用上下文，用于 endpoint-aware 错误分类 */
export interface GitErrorContext {
  /**
   * 调用的 API 端点标识符，用于区分同一 HTTP 状态码在不同接口的语义。
   * 例如：'user_repositories' | 'repository_branches' | 'microagents'
   */
  endpoint?: string;
}

export class GitServiceError extends Error {
  public readonly code: GitServiceErrorCode;
  public readonly statusCode?: number;
  public readonly originalError?: unknown;

  constructor(
    code: GitServiceErrorCode,
    message: string,
    statusCode?: number,
    originalError?: unknown,
  ) {
    super(message);
    this.name = "GitServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

/**
 * 将 Axios 或原生 fetch 错误转换为 GitServiceError。
 *
 * @param error - 捕获到的原始错误对象
 * @param context - 可选的调用上下文（用于 endpoint-aware 分类）
 * @returns GitServiceError 实例
 */
export function classifyGitError(
  error: unknown,
  context?: GitErrorContext,
): GitServiceError {
  // Axios 错误：携带 response.status
  if (
    error !== null &&
    typeof error === "object" &&
    "response" in error &&
    (error as any).response !== null &&
    typeof (error as any).response === "object"
  ) {
    const status: number = (error as any).response?.status ?? 0;
    const responseData = (error as any).response?.data;
    const responseHeaders = (error as any).response?.headers ?? {};

    if (status === 401) {
      return new GitServiceError(
        GitServiceErrorCode.AUTH_FAILED,
        GIT_ERROR_MESSAGES[GitServiceErrorCode.AUTH_FAILED],
        status,
        error,
      );
    }

    if (status === 403) {
      // GitHub rate limit 有时以 403 返回，需要检查响应体和 header
      const message = String(responseData?.message ?? "").toLowerCase();
      const remaining = responseHeaders["x-ratelimit-remaining"];
      if (message.includes("rate limit") || remaining === "0") {
        return new GitServiceError(
          GitServiceErrorCode.RATE_LIMITED,
          GIT_ERROR_MESSAGES[GitServiceErrorCode.RATE_LIMITED],
          status,
          error,
        );
      }
      return new GitServiceError(
        GitServiceErrorCode.PERMISSION_DENIED,
        GIT_ERROR_MESSAGES[GitServiceErrorCode.PERMISSION_DENIED],
        status,
        error,
      );
    }

    if (status === 404) {
      // endpoint-aware：/api/user/repositories 的 404 表示路由未注册，而非仓库不存在
      if (context?.endpoint === "user_repositories") {
        return new GitServiceError(
          GitServiceErrorCode.ROUTE_NOT_FOUND,
          GIT_ERROR_MESSAGES[GitServiceErrorCode.ROUTE_NOT_FOUND],
          status,
          error,
        );
      }
      return new GitServiceError(
        GitServiceErrorCode.REPO_NOT_FOUND,
        GIT_ERROR_MESSAGES[GitServiceErrorCode.REPO_NOT_FOUND],
        status,
        error,
      );
    }

    if (status === 422) {
      return new GitServiceError(
        GitServiceErrorCode.INVALID_PARAMS,
        GIT_ERROR_MESSAGES[GitServiceErrorCode.INVALID_PARAMS],
        status,
        error,
      );
    }

    if (status === 429) {
      return new GitServiceError(
        GitServiceErrorCode.RATE_LIMITED,
        GIT_ERROR_MESSAGES[GitServiceErrorCode.RATE_LIMITED],
        status,
        error,
      );
    }

    if (status >= 500) {
      return new GitServiceError(
        GitServiceErrorCode.SERVER_ERROR,
        GIT_ERROR_MESSAGES[GitServiceErrorCode.SERVER_ERROR],
        status,
        error,
      );
    }
  }

  // 网络错误：无 response（请求未到达服务器）
  if (
    error !== null &&
    typeof error === "object" &&
    "request" in error &&
    !("response" in error)
  ) {
    return new GitServiceError(
      GitServiceErrorCode.NETWORK_ERROR,
      GIT_ERROR_MESSAGES[GitServiceErrorCode.NETWORK_ERROR],
      undefined,
      error,
    );
  }

  // 未知错误
  const message =
    error instanceof Error
      ? error.message
      : GIT_ERROR_MESSAGES[GitServiceErrorCode.UNKNOWN];
  return new GitServiceError(
    GitServiceErrorCode.UNKNOWN,
    message,
    undefined,
    error,
  );
}
