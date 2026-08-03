import tempfile
import unittest
from pathlib import Path

from tools.check_cloud_config import validate


class CloudConfigTest(unittest.TestCase):
    def write(self, content: str) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / ".env.cloud"
        path.write_text(content, encoding="utf-8")
        return path

    def test_accepts_complete_arm_configuration(self) -> None:
        content = """
ACME_EMAIL=ops@belloria.fr
BELLORIA_MCP_DOMAIN=mcp.belloria.fr
BELLORIA_MCP_TOKEN=0123456789abcdef0123456789abcdef
WAHA_API_KEY=1123456789abcdef0123456789abcdef1123456789abcdef0123456789abcdef
WAHA_DASHBOARD_PASSWORD=2123456789abcdef0123456789abcdef
WAHA_DASHBOARD_USERNAME=admin
WAHA_IMAGE=devlikeapro/waha:noweb-arm-2026.7.1
WAHA_SESSION=belloria-test
WAHA_WEBHOOK_HMAC_KEY=3123456789abcdef0123456789abcdef
"""
        self.assertEqual(validate(self.write(content)), [])

    def test_rejects_placeholders_and_floating_image(self) -> None:
        content = "\n".join(f"{key}=change-me" for key in [
            "ACME_EMAIL", "BELLORIA_MCP_DOMAIN", "BELLORIA_MCP_TOKEN", "WAHA_API_KEY",
            "WAHA_DASHBOARD_PASSWORD", "WAHA_DASHBOARD_USERNAME", "WAHA_SESSION",
            "WAHA_WEBHOOK_HMAC_KEY",
        ]) + "\nWAHA_IMAGE=devlikeapro/waha:noweb\n"
        errors = validate(self.write(content))
        self.assertIn("WAHA_IMAGE must pin a versioned NOWEB tag", errors)
        self.assertTrue(any("placeholder" in error for error in errors))

    def test_rejects_missing_and_short_secrets(self) -> None:
        errors = validate(self.write("BELLORIA_MCP_TOKEN=too-short\n"))
        self.assertIn("missing WAHA_API_KEY", errors)
        self.assertIn("BELLORIA_MCP_TOKEN must contain at least 32 characters", errors)

    def test_rejects_weak_waha_api_key(self) -> None:
        short = "a" * 63
        invalid = "a" * 63 + "-"
        common = "\n".join([
            "ACME_EMAIL=ops@belloria.fr",
            "BELLORIA_MCP_DOMAIN=mcp.belloria.fr",
            "BELLORIA_MCP_TOKEN=" + "b" * 32,
            "WAHA_DASHBOARD_PASSWORD=" + "c" * 32,
            "WAHA_DASHBOARD_USERNAME=admin",
            "WAHA_IMAGE=devlikeapro/waha:noweb-arm-2026.7.1",
            "WAHA_SESSION=belloria-test",
            "WAHA_WEBHOOK_HMAC_KEY=" + "d" * 32,
        ])
        self.assertIn(
            "WAHA_API_KEY must contain at least 64 characters",
            validate(self.write(common + f"\nWAHA_API_KEY={short}\n")),
        )
        self.assertIn(
            "WAHA_API_KEY must contain only letters and digits",
            validate(self.write(common + f"\nWAHA_API_KEY={invalid}\n")),
        )


if __name__ == "__main__":
    unittest.main()
