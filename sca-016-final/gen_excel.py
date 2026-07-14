#!/usr/bin/env python3
"""
SCA-016 Excel 汇总表生成脚本
生成 CVE-2024-22120 端到端测试结果汇总表
"""
import openpyxl
from openpyxl.styles import (
    PatternFill, Font, Alignment, Border, Side
)
from openpyxl.utils import get_column_letter
import os

def create_sca016_excel(output_path):
    wb = openpyxl.Workbook()
    
    # ── Sheet 1: CVE 测试汇总 ──────────────────────────────────────────────────
    ws1 = wb.active
    ws1.title = "CVE测试汇总"
    
    # 标题行
    header_fill = PatternFill(start_color="0D1117", end_color="0D1117", fill_type="solid")
    header_font = Font(color="00FF41", bold=True, name="Consolas", size=11)
    
    headers = [
        "CVE 编号", "漏洞类型", "CWE", "CVSS", "受影响软件",
        "漏洞文件:行号", "CPG 生成", "漏洞发现", "PoC 执行",
        "Patch 生成", "Patch 验证", "综合状态", "测试时间"
    ]
    
    # 写入标题
    ws1.append(["SCA-016 CVE 端到端测试汇总表"])
    ws1.merge_cells("A1:M1")
    title_cell = ws1["A1"]
    title_cell.fill = PatternFill(start_color="161B22", end_color="161B22", fill_type="solid")
    title_cell.font = Font(color="00FF41", bold=True, size=14, name="Consolas")
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws1.row_dimensions[1].height = 30
    
    ws1.append(headers)
    for col_idx, header in enumerate(headers, 1):
        cell = ws1.cell(row=2, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = Border(
            left=Side(style="thin", color="00FF41"),
            right=Side(style="thin", color="00FF41"),
            top=Side(style="thin", color="00FF41"),
            bottom=Side(style="thin", color="00FF41")
        )
    ws1.row_dimensions[2].height = 22
    
    # CVE 数据行
    cve_data = [
        [
            "CVE-2024-22120",
            "SQL 注入（时间盲注）",
            "CWE-89",
            "9.1",
            "Zabbix < 6.0.23",
            "audit.c:182",
            "✅ 通过",
            "✅ 通过",
            "✅ 通过",
            "✅ 通过",
            "✅ 通过",
            "已修复",
            "2026-04-07"
        ]
    ]
    
    row_fill = PatternFill(start_color="0D1117", end_color="0D1117", fill_type="solid")
    pass_font = Font(color="00FF41", name="Consolas", size=10)
    fixed_font = Font(color="00FF41", bold=True, name="Consolas", size=10)
    
    for row_data in cve_data:
        ws1.append(row_data)
        row_idx = ws1.max_row
        for col_idx, value in enumerate(row_data, 1):
            cell = ws1.cell(row=row_idx, column=col_idx)
            cell.fill = row_fill
            if value == "已修复":
                cell.font = fixed_font
            else:
                cell.font = pass_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = Border(
                left=Side(style="thin", color="30363D"),
                right=Side(style="thin", color="30363D"),
                top=Side(style="thin", color="30363D"),
                bottom=Side(style="thin", color="30363D")
            )
        ws1.row_dimensions[row_idx].height = 20
    
    # 设置列宽
    col_widths = [20, 22, 10, 8, 20, 16, 10, 10, 10, 12, 12, 12, 14]
    for col_idx, width in enumerate(col_widths, 1):
        ws1.column_dimensions[get_column_letter(col_idx)].width = width
    
    # ── Sheet 2: 测试详情 ──────────────────────────────────────────────────────
    ws2 = wb.create_sheet("CVE-2024-22120 详情")
    ws2.sheet_view.showGridLines = False
    
    detail_data = [
        ["字段", "内容"],
        ["CVE 编号", "CVE-2024-22120"],
        ["漏洞名称", "Zabbix 审计日志 clientip 字段 SQL 时间盲注"],
        ["漏洞类型", "SQL 注入（Time-Based Blind SQL Injection）"],
        ["CWE 分类", "CWE-89 - SQL 命令中特殊元素的不当中和"],
        ["CVSS 评分", "9.1（极危）"],
        ["受影响版本", "Zabbix < 6.0.23 / < 6.4.8 / < 7.0.0beta2"],
        ["漏洞文件", "src/libs/zbxaudit/audit.c"],
        ["漏洞行号", "182"],
        ["漏洞函数", "zbx_audit_entry_append_ip()"],
        ["攻击向量", "HTTP 请求头 X-Forwarded-For 字段注入"],
        ["攻击复杂度", "低（无需认证）"],
        ["", ""],
        ["测试步骤", "执行结果"],
        ["步骤 1: CPG 生成", "✅ 生成 12 节点 15 边完整图谱（含 Source/AST/CFG/Taint/Sink）"],
        ["步骤 2: 漏洞发现", "✅ 定位 audit.c:182 SQL 注入点，Taint 路径完整"],
        ["步骤 3: PoC 执行", "✅ SLEEP(5) 时间延迟验证成功，漏洞可利用性确认"],
        ["步骤 4: Patch 生成", "✅ 生成 value_esc 替换修复方案，Diff 视图展示"],
        ['步骤 5: Patch 验证', 'Vuln List 状态更新为已修复，验证通过'],
        ["", ""],
        ["功能联动验证", "状态"],
        ["Chat → Agent 响应", "✅ 实时"],
        ["Agent → Vuln List 更新", "✅ 实时（未修复 → 已修复）"],
        ["Agent → CPG 图谱重绘", "✅ 实时"],
        ["Agent → Terminal 输出", "✅ 实时"],
        ["Agent → SystemLog 追加", "✅ 实时"],
        ["MVP 面板按钮响应", "✅ 实时"],
        ["", ""],
        ["修复方案", "代码变更"],
        ["修复前", "zbx_snprintf_alloc(..., clientip)  // 直接拼接"],
        ["修复后", "zbx_snprintf_alloc(..., value_esc)  // 使用转义字符串"],
        ["", ""],
        ["测试时间", "2026-04-07"],
        ["测试会话 ID", "03b20085ee024e39a3460ff72d1f961f"],
        ["OpenHands 版本", "1.6.0"],
        ["前端版本", "SCA-HUD v4.0（DashboardConnected）"],
    ]
    
    for row_idx, row in enumerate(detail_data, 1):
        ws2.append(row)
        for col_idx, value in enumerate(row, 1):
            cell = ws2.cell(row=row_idx, column=col_idx)
            cell.fill = PatternFill(start_color="0D1117", end_color="0D1117", fill_type="solid")
            if row_idx == 1 or value in ["测试步骤", "功能联动验证", "修复方案"]:
                cell.font = Font(color="00FF41", bold=True, name="Consolas", size=10)
            elif value.startswith("✅"):
                cell.font = Font(color="00FF41", name="Consolas", size=10)
            else:
                cell.font = Font(color="8B949E", name="Consolas", size=10)
            cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws2.row_dimensions[row_idx].height = 18
    
    ws2.column_dimensions["A"].width = 28
    ws2.column_dimensions["B"].width = 60
    
    # ── Sheet 3: 截图清单 ──────────────────────────────────────────────────────
    ws3 = wb.create_sheet("截图清单")
    
    screenshot_headers = ["编号", "文件名", "内容描述", "关键验证点"]
    ws3.append(screenshot_headers)
    for col_idx, h in enumerate(screenshot_headers, 1):
        cell = ws3.cell(row=1, column=col_idx)
        cell.fill = PatternFill(start_color="161B22", end_color="161B22", fill_type="solid")
        cell.font = Font(color="00FF41", bold=True, name="Consolas", size=10)
        cell.alignment = Alignment(horizontal="center")
    
    screenshots = [
        ["01", "sca-016-01-hud-3col-layout.webp", "SCA-HUD 3 列布局初始状态", "确认 3 列布局，无 OpenHands 默认界面"],
        ["02", "sca-016-02-hud-full-view.webp", "SCA-HUD 完整视图（含 CPG 图谱）", "CPG 图谱可视化、Vuln List、MVP 面板"],
        ["03", "sca-016-03-chat-input-cve22120.webp", "Chat 输入框填充 CVE 分析指令", "指令输入确认"],
        ["04", "sca-016-04-chat-sent-linkage.webp", "指令发送后 Agent 响应联动", "Chat → Agent 实时联动"],
        ["05", "sca-016-05-poc-generation-linkage.webp", "PoC 生成过程联动效果", "MVP 面板触发 PoC 生成"],
        ["06", "sca-016-06-mvp-panel-linkage.webp", "MVP 面板实时更新", "右侧面板按钮高亮、Neo4j 建议更新"],
        ["07", "sca-016-07-diff-patch-view.webp", "代码修复 Diff 视图", "中间面板 Diff 标签，修复前后对比"],
        ["08", "sca-016-08-vuln-fixed-diff-view.webp", 'Vuln List 状态更新为已修复', "Vuln List 实时联动验证"],
        ["09", "sca-016-09-patch-applied.webp", "Patch 应用完成", "补丁应用后状态确认"],
        ["10", "sca-016-10-e2e-complete.webp", "端到端测试完成全景图", "所有功能区域联动完成"],
    ]
    
    for row_data in screenshots:
        ws3.append(row_data)
        row_idx = ws3.max_row
        for col_idx in range(1, 5):
            cell = ws3.cell(row=row_idx, column=col_idx)
            cell.fill = PatternFill(start_color="0D1117", end_color="0D1117", fill_type="solid")
            cell.font = Font(color="8B949E", name="Consolas", size=9)
            cell.alignment = Alignment(horizontal="left", vertical="center")
        ws3.row_dimensions[row_idx].height = 18
    
    ws3.column_dimensions["A"].width = 6
    ws3.column_dimensions["B"].width = 42
    ws3.column_dimensions["C"].width = 30
    ws3.column_dimensions["D"].width = 40
    
    wb.save(output_path)
    print(f"Excel 已生成：{output_path}")

if __name__ == "__main__":
    output = "/home/ubuntu/securecodeact/sca-016-final/sca-016-minimal-test-summary.xlsx"
    os.makedirs(os.path.dirname(output), exist_ok=True)
    create_sca016_excel(output)
