from unittest import TestCase

from warships.agentic import run_graph


class AgenticGraphTests(TestCase):
    def test_run_graph_completes_when_verification_passes(self):
        result = run_graph(
            "Fix clan hydration in player page",
            context={
                "verification": {
                    "tests_passed": True,
                    "lint_passed": True,
                }
            },
        )

        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["plan"])
        self.assertTrue(result["implementation_notes"])
        self.assertTrue(result["verification_notes"])
        self.assertTrue(result["checks_passed"])

    def test_run_graph_blocks_files_outside_allowed_paths(self):
        result = run_graph(
            "Fix clan hydration in player page",
            context={
                "touched_files": ["secrets/unsafe.txt"],
                "verification": {
                    "tests_passed": True,
                    "lint_passed": True,
                },
            },
        )

        self.assertEqual(result["status"], "needs_attention")
        self.assertFalse(result["boundary_ok"])
        self.assertTrue(result["issues"])

    def test_run_graph_handles_verification_failure(self):
        result = run_graph(
            "Fix clan hydration in player page",
            context={
                "verification": {
                    "tests_passed": False,
                    "lint_passed": True,
                },
                "max_retries": 0,
            },
        )

        self.assertEqual(result["status"], "needs_attention")
        self.assertFalse(result["checks_passed"])
        self.assertTrue(result["issues"])

    def test_run_graph_uses_clan_hydration_plan_template(self):
        result = run_graph(
            "clan information does not hydrate on first player page load",
            context={
                "verification": {
                    "tests_passed": True,
                    "lint_passed": True,
                }
            },
        )

        self.assertGreaterEqual(len(result["plan"]), 4)
        self.assertIn("PlayerSearch.tsx", " ".join(result["target_files"]))

    def test_run_graph_executes_verification_commands_success(self):
        result = run_graph(
            "simple verification command",
            context={
                "verification_commands": ["python -c \"print('ok')\""],
                "verification_cwd": "server",
            },
        )

        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["checks_passed"])
        self.assertTrue(result["command_results"])
        self.assertEqual(result["command_results"][0]["returncode"], 0)

    def test_run_graph_executes_verification_commands_failure(self):
        result = run_graph(
            "failing verification command",
            context={
                "verification_commands": ["python -c \"import sys; sys.exit(2)\""],
                "verification_cwd": "server",
                "max_retries": 0,
            },
        )

        self.assertEqual(result["status"], "needs_attention")
        self.assertFalse(result["checks_passed"])
        self.assertTrue(result["command_results"])
        self.assertEqual(result["command_results"][0]["returncode"], 2)
