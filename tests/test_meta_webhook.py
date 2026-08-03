import hashlib
import hmac
import unittest

from belloria_cloud.webhook import iter_events, normalize_event, valid_signature, verify_challenge


class MetaWebhookTest(unittest.TestCase):
    def test_subscription_challenge_requires_exact_token(self) -> None:
        self.assertEqual(verify_challenge("subscribe", "verify-me", "1234", "verify-me"), "1234")
        self.assertIsNone(verify_challenge("subscribe", "wrong", "1234", "verify-me"))
        self.assertIsNone(verify_challenge("unsubscribe", "verify-me", "1234", "verify-me"))

    def test_signature_uses_raw_body_and_sha256_prefix(self) -> None:
        body = b'{"object":"whatsapp_business_account"}'
        digest = hmac.new(b"app-secret", body, hashlib.sha256).hexdigest()
        self.assertTrue(valid_signature(body, f"sha256={digest}", "app-secret"))
        self.assertFalse(valid_signature(body + b" ", f"sha256={digest}", "app-secret"))
        self.assertFalse(valid_signature(body, digest, "app-secret"))

    def test_extracts_stable_ids_from_synthetic_payload(self) -> None:
        payload = {
            "object": "whatsapp_business_account",
            "entry": [{"changes": [{"field": "messages", "value": {
                "metadata": {"phone_number_id": "100200300"},
                "messages": [{"id": "wamid.inbound", "type": "text", "text": {"body": "Bonjour"}}],
                "statuses": [{"id": "wamid.outbound", "status": "delivered"}],
            }}]}],
        }
        events = list(iter_events(payload))
        self.assertEqual([event.event_id for event in events], ["wamid.inbound", "wamid.outbound:delivered"])
        self.assertEqual([event.kind for event in events], ["message", "status"])
        self.assertTrue(all(event.phone_number_id == "100200300" for event in events))

    def test_ignores_unknown_objects_and_changes(self) -> None:
        self.assertEqual(list(iter_events({"object": "page", "entry": []})), [])
        payload = {"object": "whatsapp_business_account", "entry": [{"changes": [{"field": "other"}]}]}
        self.assertEqual(list(iter_events(payload)), [])

    def test_normalizes_text_media_and_status_events(self) -> None:
        payload = {"object": "whatsapp_business_account", "entry": [{"changes": [{"field": "messages", "value": {
            "metadata": {"phone_number_id": "100200300"},
            "messages": [
                {"id": "wamid.text", "from": "3361", "timestamp": "10", "type": "text", "text": {"body": "Bonjour"}},
                {"id": "wamid.audio", "from": "3361", "timestamp": "11", "type": "audio", "audio": {"id": "media-1", "mime_type": "audio/ogg"}},
            ],
            "statuses": [{"id": "wamid.out", "recipient_id": "3361", "timestamp": "12", "status": "read"}],
        }}]}]}
        normalized = [normalize_event(event) for event in iter_events(payload)]
        self.assertEqual((normalized[0].sender, normalized[0].text), ("3361", "Bonjour"))
        self.assertEqual((normalized[1].message_type, normalized[1].media_id), ("audio", "media-1"))
        self.assertEqual((normalized[2].recipient, normalized[2].status), ("3361", "read"))


if __name__ == "__main__":
    unittest.main()
