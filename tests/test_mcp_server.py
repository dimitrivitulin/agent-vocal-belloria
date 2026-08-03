import unittest
import json
import threading
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from unittest.mock import Mock

from belloria_mcp.gateway import HttpResponse, MetaCloudGateway, WahaGateway, WhatsAppGateway, gateway_from_env
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

    def test_meta_provider_requires_explicit_configuration(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "META_PHONE_NUMBER_ID"):
            gateway_from_env({"WHATSAPP_PROVIDER": "meta"})
        gateway = gateway_from_env({"WHATSAPP_PROVIDER": "meta", "META_PHONE_NUMBER_ID": "123", "META_ACCESS_TOKEN": "test-token", "META_GRAPH_VERSION": "v99.0"})
        self.assertIsInstance(gateway, MetaCloudGateway)

    def test_meta_send_text_uses_graph_contract(self) -> None:
        transport = Mock(return_value=HttpResponse(200, {"Content-Type": "application/json"}, b'{"messages":[{"id":"wamid.1"}]}'))
        gateway = MetaCloudGateway("phone-id", "test-token", graph_version="v99.0", transport=transport)
        result = gateway.send_text("33612345678", "Bonjour")
        self.assertEqual(result["messages"][0]["id"], "wamid.1")
        method, url, headers, body = transport.call_args.args
        self.assertEqual((method, url), ("POST", "https://graph.facebook.com/v99.0/phone-id/messages"))
        self.assertEqual(headers["Authorization"], "Bearer test-token")
        self.assertEqual(json.loads(body)["text"]["body"], "Bonjour")

    def test_meta_media_download_uses_metadata_url_and_limits_content(self) -> None:
        transport = Mock(side_effect=[
            HttpResponse(200, {"Content-Type": "application/json"}, b'{"url":"https://lookaside.example/media"}'),
            HttpResponse(200, {"Content-Type": "audio/ogg", "Content-Length": "3"}, b"ogg"),
        ])
        media = MetaCloudGateway("phone-id", "test-token", graph_version="v99.0", transport=transport).get_media("media-1")
        self.assertEqual((media.content_type, media.data), ("audio/ogg", b"ogg"))
        self.assertEqual(transport.call_args_list[1].args[2]["Authorization"], "Bearer test-token")
        self.assertEqual(transport.call_args_list[1].kwargs["max_bytes"], 10 * 1024 * 1024)

    def test_meta_media_rejects_unsupported_or_oversized_content(self) -> None:
        for headers, body, message in (
            ({"Content-Type": "text/html"}, b"no", "unsupported media type"),
            ({"Content-Type": "audio/ogg", "Content-Length": "4"}, b"data", "size limit"),
        ):
            transport = Mock(side_effect=[
                HttpResponse(200, {}, b'{"url":"https://lookaside.example/media"}'),
                HttpResponse(200, headers, body),
            ])
            with self.assertRaisesRegex(RuntimeError, message):
                MetaCloudGateway("phone-id", "test-token", graph_version="v99.0", transport=transport, max_media_bytes=3).get_media("media-1")

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
