import axios from "axios";
import { mapV1ToV0Status } from "#/utils/git-status-mapper";
import type {
  GitChange,
  GitChangeDiff,
  V1GitChangeStatus,
} from "../open-hands.types";

interface V1GitChange {
  status: V1GitChangeStatus;
  path: string;
}

class V1GitService {
  /**
   * Get git changes for a V1 conversation.
   *
   * Routes through the OpenHands backend V1 proxy (/api/v1/app-conversations/{id}/git/changes)
   * to avoid CORS issues from calling the agent server directly from the browser.
   *
   * @param conversationId The V1 conversation ID
   * @param path The git repository path (e.g., /workspace)
   * @returns List of git changes with V0-compatible status types
   */
  static async getGitChanges(
    conversationId: string,
    path: string,
  ): Promise<GitChange[]> {
    const url = `/api/v1/app-conversations/${conversationId}/git/changes`;
    const { data } = await axios.get<V1GitChange[]>(url, {
      params: { path },
    });

    if (!Array.isArray(data)) {
      throw new Error(
        "Invalid response from agent server - server may be unavailable",
      );
    }

    return data.map((change) => ({
      status: mapV1ToV0Status(change.status),
      path: change.path,
    }));
  }

  /**
   * Get git change diff for a specific file in a V1 conversation.
   *
   * Routes through the OpenHands backend V1 proxy (/api/v1/app-conversations/{id}/git/diff)
   * to avoid CORS issues from calling the agent server directly from the browser.
   *
   * @param conversationId The V1 conversation ID
   * @param path The absolute file path to get diff for (e.g., /workspace/project/src/main.py)
   * @returns Git change diff
   */
  static async getGitChangeDiff(
    conversationId: string,
    path: string,
  ): Promise<GitChangeDiff> {
    const url = `/api/v1/app-conversations/${conversationId}/git/diff`;
    const { data } = await axios.get<GitChangeDiff>(url, {
      params: { path },
    });
    return data;
  }
}

export default V1GitService;
