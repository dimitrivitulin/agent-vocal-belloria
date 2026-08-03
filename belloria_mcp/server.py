from __future__ import annotations

import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from belloria_mcp.gateway import WhatsAppGateway, gateway_from_env


TOOLS = [
    {"name": "whatsapp_session_status", "description": "Read the configured WhatsApp session status.", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "whatsapp_send_text", "description": "Send one text message only after explicit user approval.", "inputSchema": {"type": "object", "properties": {"phone": {"type": "string", "pattern": "^[1-9][0-9]{7,14}$"}, "text": {"type": "string", "minLength": 1, "maxLength": 2000}, "confirmed": {"type": "boolean", "const": True, "description": "True only after the user explicitly approved this exact message."}}, "required": ["phone", "text", "confirmed"], "additionalProperties": False}},
]


def dispatch(message: dict, client: WhatsAppGateway) -> dict:
    request_id = message.get("id")
    method = message.get("method")
    try:
        if method == "initialize":
            result = {"protocolVersion": "2025-06-18", "capabilities": {"tools": {}}, "serverInfo": {"name": "belloria-mcp", "version": "0.1.0"}}
        elif method == "tools/list":
            result = {"tools": TOOLS}
        elif method == "tools/call":
            params = message.get("params", {})
            name, arguments = params.get("name"), params.get("arguments", {})
            if name == "whatsapp_session_status":
                value = client.status()
            elif name == "whatsapp_send_text":
                if arguments.get("confirmed") is not True:
                    raise ValueError("explicit confirmation is required")
                value = client.send_text(arguments.get("phone", ""), arguments.get("text", ""))
            else:
                raise ValueError("unknown tool")
            result = {"content": [{"type": "text", "text": json.dumps(value, ensure_ascii=False)}]}
        else:
            return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32601, "message": "Method not found"}}
        return {"jsonrpc": "2.0", "id": request_id, "result": result}
    except (ValueError, RuntimeError) as error:
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32602, "message": str(error)}}


class McpHandler(BaseHTTPRequestHandler):
    token = ""
    client: WhatsAppGateway

    def do_GET(self) -> None:
        if self.path == "/health":
            self.reply(200, {"status": "ok"})
        else:
            self.send_error(404)

    def do_POST(self) -> None:
        if self.path != "/mcp":
            self.send_error(404); return
        supplied = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if not supplied or not hmac.compare_digest(supplied, self.token):
            self.reply(401, {"error": "unauthorized"}); return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            message = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            self.reply(400, {"error": "invalid request"}); return
        self.reply(200, dispatch(message, self.client))

    def log_message(self, format: str, *args: object) -> None:
        return

    def reply(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)


def main() -> None:
    McpHandler.token = os.environ["BELLORIA_MCP_TOKEN"]
    McpHandler.client = gateway_from_env()
    ThreadingHTTPServer((os.getenv("MCP_HOST", "127.0.0.1"), int(os.getenv("MCP_PORT", "8000"))), McpHandler).serve_forever()


if __name__ == "__main__":
    main()
