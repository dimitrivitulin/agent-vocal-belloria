import unittest
import json
import threading
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from unittest.mock import Mock

from belloria_mcp.gateway import WahaGateway, WhatsAppGateway, gateway_from_env
from belloria_mcp.server import McpHandler, dispatch


class McpServerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = Mock(spec=WhatsAppGateway)

    def test_lists_only_two_tools(self) -> None:
        response = dispatch({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, self.client)
        self.assertEqual([tool["name"] for tool in response["result"]["tools"]], ["whatsapp_session_status", "whatsapp_send_text"])

    def test_status_delegates_to_fixed_client(self) -> None:
        self.client.status.return_value = {"status": "WORKING"}
        response = dispatch({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "whatsapp_session_status", "arguments": {}}}, self.client)
        self.assertIn("WORKING", response["result"]["content"][0]["text"])

    def test_send_validates_phone_and_delegates(self) -> None:
        client = WahaGateway("http://waha", "key")
        client.request = Mock(return_value={"id": "message-id"})
        client.send_text("33612345678", "Bonjour")
        client.request.assert_called_once_with("POST", "/api/sendText", {"session": "default", "chatId": "33612345678@c.us", "text": "Bonjour"})
        with self.assertRaises(ValueError):
            client.send_text("+33612345678", "Bonjour")

    def test_waha_fallback_requires_explicit_enablement(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "provider is disabled"):
            gateway_from_env({})
        gateway = gateway_from_env({"WHATSAPP_PROVIDER": "waha", "WAHA_API_KEY": "test-key"})
        self.assertIsInstance(gateway, WahaGateway)

    def test_unknown_provider_is_rejected(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "unsupported WhatsApp provider"):
            gateway_from_env({"WHATSAPP_PROVIDER": "other"})

    def test_unknown_tool_is_rejected(self) -> None:
        response = dispatch({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "raw_waha", "arguments": {}}}, self.client)
        self.assertEqual(response["error"]["code"], -32602)

    def test_send_without_confirmation_is_rejected(self) -> None:
        response = dispatch({"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "whatsapp_send_text", "arguments": {"phone": "33612345678", "text": "Bonjour"}}}, self.client)
        self.assertEqual(response["error"]["message"], "explicit confirmation is required")
        self.client.send_text.assert_not_called()

    def test_http_entry_requires_bearer_token(self) -> None:
        McpHandler.token = "mcp-test-token"
        McpHandler.client = self.client
        server = ThreadingHTTPServer(("127.0.0.1", 0), McpHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            body = json.dumps({"jsonrpc": "2.0", "id": 4, "method": "tools/list"})
            for token, expected in ((None, 401), ("wrong", 401), ("mcp-test-token", 200)):
                connection = HTTPConnection("127.0.0.1", server.server_port)
                headers = {"Content-Type": "application/json"}
                if token:
                    headers["Authorization"] = f"Bearer {token}"
                connection.request("POST", "/mcp", body, headers)
                response = connection.getresponse()
                response.read()
                self.assertEqual(response.status, expected)
                connection.close()
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == "__main__":
    unittest.main()
