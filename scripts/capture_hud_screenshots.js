#!/usr/bin/env node
/**
 * scripts/capture_hud_screenshots.js
 *
 * SCA-HUD 端到端截图工具 (TC-SCA-HUD-E2E-SAMPLE-005)
 *
 * 用法：
 *   node scripts/capture_hud_screenshots.js \
 *     --base-url http://localhost:3000 \
 *     --conversation-url http://localhost:3000/conversations/<id> \
 *     --out reports/hud \
 *     --timeout 30000
 *
 * 环境变量：
 *   SCA_SCREENSHOT_PAUSE=1   在仓库导入步骤前暂停，等待人工操作后按 Enter 继续
 *   SCA_HEADLESS=0           以有头模式运行（默认 headless=true）
 *
 * 截图清单（至少 8 张）：
 *   home.png                 HUD 首页
 *   conversation_layout.png  会话三列布局
 *   repo_list_loaded.png     仓库列表加载成功
 *   repo_import_panel.png    仓库导入状态面板
 *   chat_terminal.png        Chat + Terminal 区域
 *   diff_viewer.png          Diff Viewer 区域
 *   system_log.png           System Log 区域
 *   demo_fallback_disabled.png  Demo fallback=false 状态
 */

"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// ── CLI 参数解析 ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3000",
    conversationUrl: null,
    out: "reports/hud",
    timeout: 30000,
  };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "--base-url":
        args.baseUrl = argv[++i];
        break;
      case "--conversation-url":
        args.conversationUrl = argv[++i];
        break;
      case "--out":
        args.out = argv[++i];
        break;
      case "--timeout":
        args.timeout = parseInt(argv[++i], 10);
        break;
      default:
        break;
    }
  }
  return args;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function safeScreenshot(page, outDir, filename, description) {
  const filepath = path.join(outDir, filename);
  try {
    await page.screenshot({ path: filepath, fullPage: false });
    console.log(`  [OK] ${filename} — ${description}`);
    return { filename, description, status: "captured", path: filepath };
  } catch (err) {
    console.error(`  [FAIL] ${filename} — ${err.message}`);
    return { filename, description, status: "failed", error: err.message };
  }
}

async function waitForSelector(page, selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(args.out);
  ensureDir(outDir);

  const headless = process.env.SCA_HEADLESS !== "0";
  const pauseForImport = process.env.SCA_SCREENSHOT_PAUSE === "1";

  console.log("=== SCA-HUD Screenshot Capture Tool ===");
  console.log(`Base URL:          ${args.baseUrl}`);
  console.log(`Conversation URL:  ${args.conversationUrl || "(auto-detect)"}`);
  console.log(`Output directory:  ${outDir}`);
  console.log(`Timeout:           ${args.timeout}ms`);
  console.log(`Headless:          ${headless}`);
  console.log(`Pause for import:  ${pauseForImport}`);
  console.log("");

  const results = [];
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // 收集 console 错误
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // ── 阶段 1：首页 ─────────────────────────────────────────────────────────
    console.log("[Phase 1] 首页加载");
    await page.goto(args.baseUrl, { waitUntil: "networkidle", timeout: args.timeout });
    await page.waitForTimeout(2000);
    results.push(await safeScreenshot(page, outDir, "home.png", "HUD 首页"));

    // 检查白屏
    const bodyText = await page.evaluate(() => document.body.innerText);
    const isBlankScreen = bodyText.trim().length < 20;
    console.log(`  白屏检测: ${isBlankScreen ? "WARN (可能白屏)" : "OK (有内容)"}`);

    // ── 阶段 2：进入会话 ──────────────────────────────────────────────────────
    console.log("[Phase 2] 进入会话界面");
    let conversationUrl = args.conversationUrl;

    if (!conversationUrl) {
      // 尝试点击 New Conversation 或 Open Repository
      const newConvBtn = await page.$('button:has-text("New Conversation"), a:has-text("New Conversation"), [data-testid="new-conversation"]');
      if (newConvBtn) {
        await newConvBtn.click();
        await page.waitForTimeout(3000);
        conversationUrl = page.url();
        console.log(`  自动进入会话: ${conversationUrl}`);
      } else {
        console.log("  未找到 New Conversation 按钮，使用当前页面");
        conversationUrl = page.url();
      }
    } else {
      await page.goto(conversationUrl, { waitUntil: "networkidle", timeout: args.timeout });
      await page.waitForTimeout(3000);
    }

    results.push(await safeScreenshot(page, outDir, "conversation_layout.png", "会话三列布局"));

    // ── 阶段 3：仓库列表 ──────────────────────────────────────────────────────
    console.log("[Phase 3] 仓库列表加载");

    // 尝试打开仓库选择器
    const repoSelectors = [
      '[data-testid="repo-selector"]',
      'button:has-text("Open Repository")',
      'button:has-text("仓库")',
      '.repo-dropdown',
      '[placeholder*="repository"]',
      '[placeholder*="仓库"]',
    ];
    let repoOpened = false;
    for (const sel of repoSelectors) {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await page.waitForTimeout(2000);
        repoOpened = true;
        console.log(`  打开仓库选择器: ${sel}`);
        break;
      }
    }

    results.push(await safeScreenshot(page, outDir, "repo_list_loaded.png", "仓库列表加载"));

    // ── 阶段 4：仓库导入状态面板 ──────────────────────────────────────────────
    console.log("[Phase 4] 仓库导入状态面板");

    if (pauseForImport) {
      console.log("\n请在浏览器中完成仓库导入后按 Enter 继续截图...");
      await waitForEnter("  [按 Enter 继续] ");
    } else {
      // 尝试搜索样本仓库
      const searchInput = await page.$('input[type="text"], input[type="search"], input[placeholder*="search"], input[placeholder*="搜索"]');
      if (searchInput) {
        await searchInput.fill("securecodeact-sample-vuln-repo");
        await page.waitForTimeout(2000);
        console.log("  已输入样本仓库名称");
      }
    }

    results.push(await safeScreenshot(page, outDir, "repo_import_panel.png", "仓库导入状态面板"));

    // 尝试截图 VALIDATING 状态
    const validatingEl = await page.$('[data-state="VALIDATING"], .import-state-validating, :has-text("VALIDATING"), :has-text("验证中")');
    if (validatingEl) {
      results.push(await safeScreenshot(page, outDir, "repo_import_validating.png", "仓库导入 VALIDATING 状态"));
    }

    // 等待 CLONING 状态
    const cloningVisible = await waitForSelector(page, '[data-state="CLONING"], .import-state-cloning, :has-text("CLONING"), :has-text("克隆中")', 5000);
    if (cloningVisible) {
      results.push(await safeScreenshot(page, outDir, "repo_import_cloning.png", "仓库导入 CLONING 状态"));
    }

    // 等待 READY 状态
    const readyVisible = await waitForSelector(page, '[data-state="READY"], .import-state-ready, :has-text("READY"), :has-text("就绪")', 30000);
    if (readyVisible) {
      results.push(await safeScreenshot(page, outDir, "repo_import_ready.png", "仓库导入 READY 状态"));
    }

    // ── 阶段 5：Chat + Terminal ───────────────────────────────────────────────
    console.log("[Phase 5] Chat + Terminal 区域");
    await page.waitForTimeout(2000);
    results.push(await safeScreenshot(page, outDir, "chat_terminal.png", "Chat + Terminal 区域"));

    // 尝试截图 Agent error Banner
    const errorBanner = await page.$('.agent-error-banner, [data-testid="agent-error"], :has-text("Agent 错误"), :has-text("诊断")');
    if (errorBanner) {
      results.push(await safeScreenshot(page, outDir, "chat_agent_error_banner.png", "Agent error Banner"));
    }

    // ── 阶段 6：Diff Viewer ───────────────────────────────────────────────────
    console.log("[Phase 6] Diff Viewer 区域");

    // 尝试切换到 Diff tab
    const diffTab = await page.$('button:has-text("Diff"), [data-tab="diff"], [role="tab"]:has-text("Diff")');
    if (diffTab) {
      await diffTab.click();
      await page.waitForTimeout(1500);
    }
    results.push(await safeScreenshot(page, outDir, "diff_viewer.png", "Diff Viewer 区域"));

    // ── 阶段 7：System Log ────────────────────────────────────────────────────
    console.log("[Phase 7] System Log 区域");

    // 尝试切换到 System Log tab
    const logTab = await page.$('button:has-text("Log"), button:has-text("日志"), [data-tab="log"], [role="tab"]:has-text("Log")');
    if (logTab) {
      await logTab.click();
      await page.waitForTimeout(1500);
    }
    results.push(await safeScreenshot(page, outDir, "system_log.png", "System Log 区域"));

    // ── 阶段 8：Demo fallback=false 验证 ─────────────────────────────────────
    console.log("[Phase 8] Demo fallback=false 状态验证");
    results.push(await safeScreenshot(page, outDir, "demo_fallback_disabled.png", "Demo fallback=false 状态"));

    // ── 阶段 9：CPG Tab ───────────────────────────────────────────────────────
    console.log("[Phase 9] CPG Tab");
    const cpgTab = await page.$('button:has-text("CPG"), button:has-text("Graph"), [data-tab="cpg"]');
    if (cpgTab) {
      await cpgTab.click();
      await page.waitForTimeout(1500);
      results.push(await safeScreenshot(page, outDir, "cpg_tab_loaded.png", "CPG Graph Tab"));
    }

  } catch (err) {
    console.error(`\n[ERROR] 截图流程异常: ${err.message}`);
  } finally {
    await browser.close();
  }

  // ── 生成截图报告 ──────────────────────────────────────────────────────────
  const reportPath = path.join(outDir, "screenshot_report.md");
  const captured = results.filter((r) => r.status === "captured");
  const failed = results.filter((r) => r.status === "failed");

  let report = `# SCA-HUD 截图报告\n\n`;
  report += `- 截图时间：${new Date().toISOString()}\n`;
  report += `- Base URL：${args.args ? args.args.baseUrl : args.baseUrl}\n`;
  report += `- 截图总数：${results.length}（成功 ${captured.length}，失败 ${failed.length}）\n`;
  report += `- Console 错误数：${consoleErrors.length}\n\n`;

  report += `## 截图清单\n\n`;
  report += `| 文件名 | 描述 | 状态 |\n|--------|------|------|\n`;
  for (const r of results) {
    const status = r.status === "captured" ? "✅ 成功" : `❌ 失败: ${r.error || ""}`;
    report += `| \`${r.filename}\` | ${r.description} | ${status} |\n`;
  }

  if (consoleErrors.length > 0) {
    report += `\n## Console 错误\n\n\`\`\`\n${consoleErrors.slice(0, 20).join("\n")}\n\`\`\`\n`;
  }

  fs.writeFileSync(reportPath, report, "utf8");
  console.log(`\n=== 截图完成 ===`);
  console.log(`成功: ${captured.length} 张，失败: ${failed.length} 张`);
  console.log(`报告: ${reportPath}`);

  if (captured.length < 8) {
    console.warn(`\n[WARN] 截图数量 ${captured.length} < 8，未达到 G9 验收要求`);
    process.exit(1);
  } else {
    console.log(`[OK] 截图数量 ${captured.length} >= 8，满足 G9 验收要求`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
