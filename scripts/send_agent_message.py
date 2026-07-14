#!/usr/bin/env python3
"""
通过 OpenHands WebSocket 向 Agent 发送消息，触发真实 bash 命令执行。
Agent 执行的命令会通过 WebSocket 推送 ExecuteBashAction/ExecuteBashObservation 事件到前端终端。
"""
import asyncio
import json
import sys
import time
import websockets

CONV_ID = "281612dae7dc40858c7d1bf307b43f38"
WS_URL = f"ws://localhost:3000/sockets/events/{CONV_ID}"

async def send_message(message: str, wait_seconds: int = 30):
    """发送消息到 OpenHands Agent 并等待响应"""
    print(f"[WebSocket] 连接到: {WS_URL}")
    
    async with websockets.connect(WS_URL) as ws:
        print(f"[WebSocket] 连接成功")
        
        # 构建 V1 消息格式
        msg = {
            "action": "message",
            "args": {
                "content": [
                    {
                        "type": "text",
                        "text": message
                    }
                ],
                "image_urls": [],
                "file_urls": [],
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S")
            }
        }
        
        print(f"[WebSocket] 发送消息: {message[:100]}...")
        await ws.send(json.dumps(msg))
        print(f"[WebSocket] 消息已发送，等待 Agent 响应 ({wait_seconds}s)...")
        
        # 等待响应
        start_time = time.time()
        bash_outputs = []
        
        try:
            while time.time() - start_time < wait_seconds:
                try:
                    response = await asyncio.wait_for(ws.recv(), timeout=5.0)
                    data = json.loads(response)
                    
                    event_type = data.get("type") or data.get("action") or data.get("observation")
                    
                    # 捕获 bash 命令执行事件
                    if data.get("action") == "run":
                        cmd = data.get("args", {}).get("command", "")
                        print(f"[BASH-INPUT] $ {cmd}")
                        bash_outputs.append(f"$ {cmd}")
                    
                    elif data.get("observation") == "run":
                        content = data.get("content", "")
                        print(f"[BASH-OUTPUT] {content[:200]}")
                        bash_outputs.append(content)
                    
                    elif data.get("action") == "message" and data.get("source") == "agent":
                        msg_content = data.get("args", {}).get("content", "")
                        if isinstance(msg_content, list):
                            for item in msg_content:
                                if item.get("type") == "text":
                                    print(f"[AGENT-MSG] {item['text'][:200]}")
                        else:
                            print(f"[AGENT-MSG] {str(msg_content)[:200]}")
                    
                    # 检查是否完成
                    if data.get("extras", {}).get("agent_state") in ["finished", "error"]:
                        print(f"[WebSocket] Agent 完成")
                        break
                        
                except asyncio.TimeoutError:
                    continue
                    
        except websockets.exceptions.ConnectionClosed:
            print("[WebSocket] 连接已关闭")
        
        return bash_outputs

async def main():
    message = sys.argv[1] if len(sys.argv) > 1 else "请执行: echo SCA-014-TEST && python3 --version"
    wait = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    
    outputs = await send_message(message, wait)
    print(f"\n[完成] 收到 {len(outputs)} 条终端输出")
    return outputs

if __name__ == "__main__":
    asyncio.run(main())
