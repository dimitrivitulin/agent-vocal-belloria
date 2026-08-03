from __future__ import annotations

import hmac
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PHONE = re.compile(r"^[1-9][0-9]{7,14}$")


class WahaClient:
    def __init__(self, base_url: str, api_key: str, session: str = "default") -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.session = session

    def request(self, method: str, path: str, payload: dict | None = None) -> object:
        body = None if payload is None else json.dumps(payload).encode()
        request = Request(
            f"{self.base_url}{path}", data=body, method=method,
            headers={"Accept": "application/json", "Content-Type": "application/json", "X-Api-Key": self.api_key},
        )
        try:
            with urlopen(request, timeout=5) as response:
                return json.loads(response.read() or b"{}")
        except HTTPError as error:
            raise RuntimeError(f"WAHA returned HTTP {error.code}") from error
        except URLError as error:
            raise RuntimeError("WAHA is unavailable") from error

    def status(self) -> object:
        return self.request("GET", f"/api/sessions/{self.session}")

    def send_text(self, phone: str, text: str) -> object:
        if not PHONE.fullmatch(phone):
            raise ValueError("phone must contain 8 to 15 digits without '+'")
        if not text or len(text) > 2000:
            raise ValueError("text must contain 1 to 2000 characters")
        return self.request("POST", "/api/sendText", {"session": self.session, "chatId": f"{phone}@c.us", "text": text})


TOOLS = [
    {"name": "whatsapp_session_status", "description": "Read the configured WhatsApp session status.", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "whatsapp_send_text", "description": "Send one text message only after explicit user approval.", "inputSchema": {"type": "object", "properties": {"phone": {"type": "string", "pattern": "^[1-9][0-9]{7,14}$"}, "text": {"type": "string", "minLength": 1, "maxLength": 2000}, "confirmed": {"type": "boolean", "const": True, "description": "True only after the user explicitly approved this exact message."}}, "required": ["phone", "text", "confirmed"], "additionalProperties": False}},
]


def dispatch(message: dict, client: WahaClient) -> dict:
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
    client: WahaClient

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
    McpHandler.client = WahaClient(os.getenv("WAHA_BASE_URL", "http://127.0.0.1:3000"), os.environ["WAHA_API_KEY"], os.getenv("WAHA_SESSION", "default"))
    ThreadingHTTPServer((os.getenv("MCP_HOST", "127.0.0.1"), int(os.getenv("MCP_PORT", "8000"))), McpHandler).serve_forever()


if __name__ == "__main__":
    main()
