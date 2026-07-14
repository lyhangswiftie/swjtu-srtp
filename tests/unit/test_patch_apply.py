#!/usr/bin/env python3
"""
TC-SCA-024 G3/G4: patch_apply.py 单元测试
"""
import sys
import os
import tempfile
import shutil
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../scripts"))
from patch_apply import (
    copy_to_workdir,
    adjust_diff_for_workdir,
    apply_patch_to_workdir,
    run_git_apply,
)

# 真实 diff 内容
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

# 真实源文件路径
SOURCE_FILE = os.path.join(
    os.path.dirname(__file__),
    "../../samples/cve-2024-22120/audit.c"
)


def write_temp_diff(content: str) -> str:
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".diff", delete=False)
    f.write(content)
    f.close()
    return f.name


class TestCopyToWorkdir(unittest.TestCase):
    """测试文件复制到工作区"""

    def setUp(self):
        self.workdir = tempfile.mkdtemp(prefix="test-patch-apply-")

    def tearDown(self):
        shutil.rmtree(self.workdir, ignore_errors=True)

    def test_copy_creates_file(self):
        if not os.path.exists(SOURCE_FILE):
            self.skipTest("audit.c 不存在")
        dest = copy_to_workdir(SOURCE_FILE, self.workdir)
        self.assertTrue(os.path.exists(dest))

    def test_copy_preserves_content(self):
        if not os.path.exists(SOURCE_FILE):
            self.skipTest("audit.c 不存在")
        dest = copy_to_workdir(SOURCE_FILE, self.workdir)
        with open(SOURCE_FILE) as f:
            orig = f.read()
        with open(dest) as f:
            copied = f.read()
        self.assertEqual(orig, copied)


class TestAdjustDiff(unittest.TestCase):
    """测试 diff 路径调整"""

    def setUp(self):
        self.workdir = tempfile.mkdtemp(prefix="test-patch-apply-")

    def tearDown(self):
        shutil.rmtree(self.workdir, ignore_errors=True)

    def test_adjust_replaces_path(self):
        diff_file = write_temp_diff(VALID_DIFF)
        try:
            adjusted = adjust_diff_for_workdir(diff_file, self.workdir, "samples/cve-2024-22120/audit.c")
            with open(adjusted) as f:
                content = f.read()
            self.assertIn("--- a/audit.c", content)
            self.assertIn("+++ b/audit.c", content)
        finally:
            os.unlink(diff_file)


class TestApplyPatch(unittest.TestCase):
    """测试完整补丁应用流程"""

    def setUp(self):
        self.workdir = tempfile.mkdtemp(prefix="test-patch-apply-")

    def tearDown(self):
        shutil.rmtree(self.workdir, ignore_errors=True)

    def test_apply_valid_patch_succeeds(self):
        if not os.path.exists(SOURCE_FILE):
            self.skipTest("audit.c 不存在")
        diff_file = write_temp_diff(VALID_DIFF)
        try:
            result = apply_patch_to_workdir(SOURCE_FILE, diff_file, self.workdir)
            self.assertEqual(result["stage"], "APPLIED",
                             f"有效补丁应成功应用，实际: {result}")
        finally:
            os.unlink(diff_file)

    def test_apply_creates_patched_file(self):
        if not os.path.exists(SOURCE_FILE):
            self.skipTest("audit.c 不存在")
        diff_file = write_temp_diff(VALID_DIFF)
        try:
            result = apply_patch_to_workdir(SOURCE_FILE, diff_file, self.workdir)
            if result["stage"] == "APPLIED":
                self.assertIsNotNone(result["patched_file"])
                self.assertTrue(os.path.exists(result["patched_file"]))
        finally:
            os.unlink(diff_file)

    def test_apply_modifies_content(self):
        if not os.path.exists(SOURCE_FILE):
            self.skipTest("audit.c 不存在")
        diff_file = write_temp_diff(VALID_DIFF)
        try:
            result = apply_patch_to_workdir(SOURCE_FILE, diff_file, self.workdir)
            if result["stage"] == "APPLIED" and result["patched_file"]:
                with open(result["patched_file"]) as f:
                    content = f.read()
                # 修复后应包含 FIXED 注释
                self.assertIn("FIXED", content,
                              "修复后文件应包含 FIXED 注释")
                # 修复后不应包含 VULNERABLE 注释
                self.assertNotIn("VULNERABLE", content,
                                 "修复后文件不应包含 VULNERABLE 注释")
        finally:
            os.unlink(diff_file)

    def test_check_passes_before_apply(self):
        if not os.path.exists(SOURCE_FILE):
            self.skipTest("audit.c 不存在")
        diff_file = write_temp_diff(VALID_DIFF)
        try:
            result = apply_patch_to_workdir(SOURCE_FILE, diff_file, self.workdir)
            if result["stage"] in ["APPLIED", "CHECK_PASSED"]:
                check = result.get("check_result", {})
                self.assertEqual(check.get("returncode", -1), 0,
                                 "git apply --check 应返回 0")
        finally:
            os.unlink(diff_file)

    def test_invalid_diff_fails(self):
        if not os.path.exists(SOURCE_FILE):
            self.skipTest("audit.c 不存在")
        bad_diff = write_temp_diff("--- a/nonexistent.c\n+++ b/nonexistent.c\n@@ -999,1 +999,1 @@\n-old\n+new\n")
        try:
            result = apply_patch_to_workdir(SOURCE_FILE, bad_diff, self.workdir)
            self.assertIn(result["stage"], ["CHECK_FAILED", "APPLY_FAILED"],
                          f"无效 diff 应失败，实际: {result['stage']}")
        finally:
            os.unlink(bad_diff)


if __name__ == "__main__":
    unittest.main(verbosity=2)
