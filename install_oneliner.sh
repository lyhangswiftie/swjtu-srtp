#!/usr/bin/env bash
# SecureCodeAct (SCA) 一键快速安装脚本
# 适用场景：全新环境的快速体验部署
# 用法：curl -sSL https://raw.githubusercontent.com/SWJTU-AI-Lab/securecodeact/main/install_oneliner.sh | bash

set -e

echo "============================================================"
echo "    SecureCodeAct (SCA) 快速部署向导"
echo "============================================================"

# 1. 检查 API Key
if [ -z "$OPENAI_API_KEY" ]; then
    echo "[错误] 未设置 OPENAI_API_KEY 环境变量。"
    echo "请先执行：export OPENAI_API_KEY='your-api-key'"
    exit 1
fi

# 2. 检查并安装系统依赖
echo "[1/4] 检查系统依赖..."
if ! command -v git &> /dev/null; then
    echo "正在安装 git..."
    sudo apt-get update && sudo apt-get install -y git
fi

if ! command -v docker &> /dev/null; then
    echo "正在安装 Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
fi

if ! command -v node &> /dev/null; then
    echo "正在安装 Node.js 22.x..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 3. 克隆仓库
echo "[2/4] 获取项目代码..."
if [ -d "securecodeact" ]; then
    echo "目录 securecodeact 已存在，正在更新..."
    cd securecodeact
    git pull
else
    git clone https://github.com/SWJTU-AI-Lab/securecodeact.git
    cd securecodeact
fi

# 4. 执行主安装脚本
echo "[3/4] 启动核心安装流程..."
bash install.sh

echo "============================================================"
echo "[4/4] 部署完成！"
echo "请在浏览器中访问：http://localhost:3000"
echo "============================================================"
