import os
import json

def generate_doc():
    frontend_dir = "frontend/src"
    output_file = "docs/SCA-Frontend-Code-Complete.md"
    
    # 核心 SCA 拦截与定制文件
    core_files = [
        "routes/conversation.tsx",
        "components/sca-hud/index.ts",
        "components/sca-hud/ScaComponents.tsx",
        "components/sca-hud/ScaDashboard.tsx"
    ]
    
    # 辅助核心文件
    helper_files = [
        "routes.ts",
        "root.tsx",
        "entry.client.tsx",
        "contexts/websocket-provider-wrapper.tsx",
        "hooks/use-send-message.ts",
        "stores/command-store.ts",
        "stores/use-event-store.ts"
    ]
    
    all_target_files = core_files + helper_files
    
    with open(output_file, "w", encoding="utf-8") as out:
        out.write("# SecureCodeAct (SCA) 前端完整代码文档\n\n")
        out.write("本文档汇集了 SecureCodeAct (SCA) 前端的核心代码，包括目录结构说明、SCA 专属定制组件源码，以及被拦截和修改的核心路由代码。\n\n")
        
        out.write("## 1. 前端目录结构\n\n")
        out.write("```text\n")
        out.write("frontend/src/\n")
        out.write("├── api/                  # API 服务封装（ConversationService, GitService）\n")
        out.write("├── components/           # UI 组件库\n")
        out.write("│   ├── features/         # 原生功能组件\n")
        out.write("│   ├── sca-hud/          # ✅ SCA 专属定制组件（核心新增）\n")
        out.write("│   │   ├── index.ts\n")
        out.write("│   │   ├── ScaComponents.tsx # 基础展示组件 (Chat, Terminal, DiffViewer)\n")
        out.write("│   │   └── ScaDashboard.tsx  # 主控制台容器\n")
        out.write("│   └── ui/               # 基础 UI 库\n")
        out.write("├── contexts/             # React Contexts（WebSocket 状态管理等）\n")
        out.write("├── hooks/                # 自定义 React Hooks\n")
        out.write("├── routes/               # 页面路由配置\n")
        out.write("│   ├── conversation.tsx  # ✅ 核心对话路由（被 SCA 劫持并替换视图）\n")
        out.write("│   └── root-layout.tsx   # 根布局\n")
        out.write("├── stores/               # Zustand 状态管理\n")
        out.write("├── root.tsx              # 根组件\n")
        out.write("└── routes.ts             # 路由注册表\n")
        out.write("```\n\n")
        
        out.write("## 2. SCA 核心定制代码说明\n\n")
        out.write("SCA 的核心修改集中在拦截默认的对话界面，并替换为安全审计专属的 `ScaDashboard`。核心组件位于 `components/sca-hud/` 目录下，并修改了 `routes/conversation.tsx` 进行路由劫持。\n\n")
        
        out.write("## 3. 核心源代码\n\n")
        
        for file_path in all_target_files:
            full_path = os.path.join(frontend_dir, file_path)
            if os.path.exists(full_path):
                out.write(f"### 文件: `{file_path}`\n\n")
                
                # 根据文件扩展名确定语言
                ext = file_path.split('.')[-1]
                lang = ext if ext in ['ts', 'tsx', 'js', 'jsx', 'css', 'html'] else 'text'
                
                out.write(f"```{lang}\n")
                with open(full_path, "r", encoding="utf-8") as f:
                    out.write(f.read())
                out.write("\n```\n\n")
            else:
                out.write(f"### 文件: `{file_path}`\n\n")
                out.write("> ⚠️ 文件未找到\n\n")

if __name__ == "__main__":
    generate_doc()
