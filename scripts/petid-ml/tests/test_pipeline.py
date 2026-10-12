"""Executable privacy/protocol tests; no real photos, provider calls or tokens."""
import copy
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import subprocess
import tempfile
import threading
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import (GateError, ServerGate, canonical, digest, erase_artifacts,
                      private_run, read_json, split_manifest, validate_manifest, write_json)
from synthetic import SyntheticGate, envelope, photo
from metrics import calibrate, evaluation_report, gallery_and_probes, observations, rate, threshold_at
from pipeline import evaluate_run, gate_for, materialize, train_run


def amended(source, change):
    altered = copy.deepcopy(source)
    change(altered["manifest"])
    altered["manifestSha256"] = digest(altered["manifest"])
    return altered


class ProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot = envelope(30)

    def test_canonical_unicode_matches_javascript_sorted_json(self):
        self.assertEqual(canonical({"z": 4, "a": "น้อง"}), '{"a":"น้อง","z":4}'.encode())

    def test_manifest_tampering_rejected(self):
        changed = copy.deepcopy(self.snapshot)
        changed["manifest"]["samples"][0]["consentVersion"] = 2
        with self.assertRaises(GateError):
            validate_manifest(changed)

    def test_exact_image_duplicate_rejected(self):
        changed = amended(self.snapshot, lambda m: m["samples"][1].update(imageSha256=m["samples"][0]["imageSha256"]))
        with self.assertRaises(GateError):
            validate_manifest(changed)

    def test_decoded_duplicate_rejected_even_when_jpeg_changes(self):
        changed = amended(self.snapshot, lambda m: m["samples"][1].update(decodedSha256=m["samples"][0]["decodedSha256"]))
        with self.assertRaises(GateError):
            validate_manifest(changed)

    def test_near_duplicate_requires_review(self):
        changed = amended(self.snapshot, lambda m: m["samples"][1].update(dhash64=f"{int(m['samples'][0]['dhash64'],16)^1:016x}"))
        with self.assertRaises(GateError):
            validate_manifest(changed)

    def test_same_pet_crossing_owners_rejected(self):
        changed = amended(self.snapshot, lambda m: m["samples"][1].update(ownerKey="another-owner-key"))
        with self.assertRaises(GateError):
            validate_manifest(changed)

    def test_invalid_capture_day_rejected(self):
        changed = amended(self.snapshot, lambda m: m["samples"][0].update(captureDay="2026-02-30"))
        with self.assertRaises(GateError):
            validate_manifest(changed)

    def test_conflicting_species_for_same_animal_rejected(self):
        changed = amended(self.snapshot, lambda m: m["samples"][1].update(species="dog"))
        with self.assertRaises(GateError):
            validate_manifest(changed)

    def test_owner_and_animal_partitions_are_disjoint_and_reproducible(self):
        splits = split_manifest(validate_manifest(self.snapshot))
        self.assertEqual(splits, split_manifest(validate_manifest(self.snapshot)))
        for key in ("ownerKey", "petKey"):
            groups = [{s[key] for s in samples} for samples in splits.values()]
            self.assertFalse(groups[0] & groups[1] or groups[0] & groups[2] or groups[1] & groups[2])

    def test_insufficient_owner_groups_fail_instead_of_random_image_split(self):
        small = copy.deepcopy(self.snapshot["manifest"])
        small["samples"] = small["samples"][:12]
        with self.assertRaises(GateError):
            split_manifest(small)

    def test_one_day_is_not_independent_recapture(self):
        changed = copy.deepcopy(self.snapshot["manifest"])
        for sample in changed["samples"]:
            sample["captureDay"] = "2026-01-01"
        with self.assertRaises(GateError):
            split_manifest(changed)

    def test_gallery_probe_days_and_sessions_do_not_overlap(self):
        samples = self.snapshot["manifest"]["samples"]
        gallery, probes = gallery_and_probes(samples)
        self.assertEqual(len(gallery), 30)
        self.assertEqual(len(probes), 60)
        self.assertFalse(set(gallery) & set(probes))
        for probe in probes:
            source = next(samples[g] for g in gallery if samples[g]["petKey"] == samples[probe]["petKey"])
            self.assertGreater(samples[probe]["captureDay"], source["captureDay"])
            self.assertNotEqual(samples[probe]["sessionId"], source["sessionId"])

    def test_symlink_run_cannot_erase_other_directories(self):
        with tempfile.TemporaryDirectory() as temp:
            actual = Path(temp) / "real"
            actual.mkdir()
            link = Path(temp) / "link"
            link.symlink_to(actual)
            with self.assertRaises(GateError):
                private_run(link, True)


class MetricTests(unittest.TestCase):
    def test_threshold_uses_inclusive_ties_and_can_reject_every_impostor(self):
        chosen = threshold_at([.2, .2, .8], 0)
        self.assertGreater(chosen, .8)
        self.assertEqual(sum(score >= chosen for score in [.2, .2, .8]), 0)

    def test_validation_calibration_does_not_use_genuine_test_scores(self):
        data = {"impostor": [{"score": .3, "owner": "owner", "pet": "pet"}], "unknown": [{"score": .4, "owner": "owner", "pet": "pet"}]}
        before = calibrate(data, .001, .01)
        data["genuine"] = [{"score": .99999}]
        self.assertEqual(before, calibrate(data, .001, .01))

    def test_correlated_pairs_do_not_invent_independent_confidence(self):
        result = rate([{"owner": "one-owner", "pet": "one-animal", "score": .2}] * 1000, lambda r: r["score"] > .5)
        self.assertEqual(result["count"], 1000)
        self.assertIsNone(result["ownerGrouped95CI"])
        self.assertIsNone(result["animalGrouped95CI"])

    def test_grouped_intervals_computed_with_enough_actual_groups(self):
        result = rate([{"owner": f"owner-{i}", "pet": f"pet-{i}", "value": i % 2} for i in range(20)], lambda r: r["value"], repeats=100)
        self.assertEqual(result["rate"], .5)
        self.assertIsNotNone(result["ownerGrouped95CI"])
        self.assertIsNotNone(result["animalGrouped95CI"])

    def test_no_observations_means_insufficient_not_perfect(self):
        result = rate([], None)
        self.assertEqual(result["status"], "insufficient_data")
        self.assertIsNone(result["rate"])

    def test_zero_observed_errors_do_not_produce_zero_width_confidence_bound(self):
        result = rate([{"owner": f"owner-{i}", "pet": f"pet-{i}", "value": 0} for i in range(20)], lambda r: r["value"])
        self.assertEqual(result["rate"], 0)
        self.assertIsNone(result["ownerGrouped95CI"])
        self.assertEqual(result["ownerGrouped95CIStatus"], "degenerate_observations_no_unseen_error_bound")

    def test_open_set_and_closed_set_are_distinct_and_no_identifiers_in_report(self):
        samples = envelope(10)["manifest"]["samples"]
        vectors = np.eye(10)[np.repeat(np.arange(10), 4)]
        data = observations(samples, vectors)
        calibration = calibrate(data, .001, .01)
        report = evaluation_report(data, calibration)
        self.assertEqual(report["closedSetIdentification"]["rank1"]["rate"], 1)
        self.assertGreater(report["openSetIdentification"]["unknownProbeCount"], 0)
        self.assertFalse(report["deploymentEligible"])
        encoded = json.dumps(report)
        for forbidden in ("pet-synthetic-", "owner-synthetic-", "sample-synthetic-", "http", ".jpg"):
            self.assertNotIn(forbidden, encoded)

    def test_unknown_owner_has_no_other_pet_in_open_set_gallery(self):
        samples = envelope(10)["manifest"]["samples"]
        for index, sample in enumerate(samples):
            sample["ownerKey"] = f"multi-pet-owner-{index // 8}"
        vectors = np.eye(10)[np.repeat(np.arange(10), 4)]
        data = observations(samples, vectors)
        known_owners = {record["owner"] for record in data["known"]}
        unknown_owners = {record["owner"] for record in data["unknown"]}
        self.assertTrue(known_owners)
        self.assertTrue(unknown_owners)
        self.assertFalse(known_owners & unknown_owners)
        # The unknown owner has two animals. Both must be excluded together.
        self.assertEqual(len({record["pet"] for record in data["unknown"]}), 2)


class GateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot = envelope(30)
        cls.authorized = True
        cls.redirect = False
        cls.authorize_count = 0
        cls.modified_bytes = False
        cls.stale_time = False
        parent = cls
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass
            def do_POST(self):
                parent.authorize_count += 1
                self.rfile.read(int(self.headers.get("Content-Length", 0)))
                if parent.redirect:
                    self.send_response(302)
                    self.send_header("Location", "https://example.com/no-token")
                    self.end_headers()
                    return
                data = {"data": {"authorized": parent.authorized, "exportId": parent.snapshot["manifest"]["exportId"],
                                  "manifestSha256": parent.snapshot["manifestSha256"], "checkedAt": "2026-01-01T00:00:00Z" if parent.stale_time else datetime.now(timezone.utc).isoformat()}}
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(data).encode())
            def do_GET(self):
                parts = self.path.rsplit("/", 1)[-1].split("-")
                body = b"different-jpeg-bytes" if parent.modified_bytes else photo(int(parts[-3]), int(parts[-2]), int(parts[-1]))
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.end_headers()
                self.wfile.write(body)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.__class__.authorized = True
        self.__class__.redirect = False
        self.__class__.modified_bytes = False
        self.__class__.stale_time = False

    def test_authorization_is_fresh_on_every_call(self):
        gate = ServerGate(self.snapshot, self.origin, "test-token-only")
        before = self.authorize_count
        gate.check()
        gate.check()
        self.assertEqual(self.authorize_count - before, 2)

    def test_revocation_rejects_already_cached_snapshot(self):
        gate = ServerGate(self.snapshot, self.origin, "test-token-only")
        gate.check()
        self.__class__.authorized = False
        with self.assertRaises(GateError):
            gate.check()

    def test_revocation_cli_erases_an_existing_cache_and_model(self):
        with tempfile.TemporaryDirectory() as temp:
            run = Path(temp) / "run"
            materialize(run, self.snapshot, True)
            (run / "model.pt").write_bytes(b"a-derived-private-model")
            (run / "evaluation.json").write_text("{}")
            self.__class__.authorized = False
            result = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / "pipeline.py"), "evaluate", "--run", str(run)],
                                    env={"PATH": os.defpath, "PETID_API_ORIGIN": self.origin, "PETID_API_TOKEN": "test-token-only"}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertNotIn("test-token-only", result.stdout + result.stderr)
            self.assertFalse((run / "images").exists())
            self.assertFalse((run / "model.pt").exists())
            self.assertFalse((run / "evaluation.json").exists())

    def test_redirect_cannot_receive_admin_bearer(self):
        self.__class__.redirect = True
        with self.assertRaises(GateError):
            ServerGate(self.snapshot, self.origin, "test-token-only").check()

    def test_network_failure_is_not_offline_permission(self):
        with self.assertRaises(GateError):
            ServerGate(self.snapshot, "http://127.0.0.1:1", "test-token-only").check()

    def test_non_https_external_origin_rejected(self):
        with self.assertRaises(GateError):
            ServerGate(self.snapshot, "http://example.com", "test-token-only")

    def test_each_photo_transfer_reauthorizes_and_verifies_exact_bytes(self):
        gate = ServerGate(self.snapshot, self.origin, "test-token-only")
        before = self.authorize_count
        sample = self.snapshot["manifest"]["samples"][0]
        received = gate.image(sample)
        self.assertEqual(received, photo(0, 0, 0))
        self.assertEqual(self.authorize_count - before, 1)

    def test_changed_image_bytes_are_not_materialized(self):
        self.__class__.modified_bytes = True
        gate = ServerGate(self.snapshot, self.origin, "test-token-only")
        with self.assertRaises(GateError):
            gate.image(self.snapshot["manifest"]["samples"][0])

    def test_stale_authorization_response_is_not_permission(self):
        self.__class__.stale_time = True
        with self.assertRaises(GateError):
            ServerGate(self.snapshot, self.origin, "test-token-only").check()


class ActualTrainingTests(unittest.TestCase):
    def test_real_gradient_training_and_calibration_tamper_denial(self):
        with tempfile.TemporaryDirectory() as temp:
            run = Path(temp) / "run"
            materialize(run, envelope(30), True)
            trained = train_run(run, True, 1, 17)
            self.assertGreater(trained["gradientSteps"], 0)
            self.assertGreater(trained["parameterChangeL1"], 0)
            report = evaluate_run(run, True)
            self.assertEqual(report["status"], "synthetic_smoke_only")
            self.assertFalse(report["deploymentEligible"])
            reproduced = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / "pipeline.py"), "evaluate", "--run", str(run), "--synthetic"],
                                        env={"PATH": os.defpath}, capture_output=True, text=True)
            self.assertEqual(reproduced.returncode, 0, reproduced.stderr)
            calibration = read_json(run / "calibration.json")
            calibration["verificationThreshold"] = -1
            write_json(run / "calibration.json", calibration)
            with self.assertRaises(GateError):
                evaluate_run(run, True)

    def test_synthetic_gate_rejects_changed_manifest_and_image(self):
        with tempfile.TemporaryDirectory() as temp:
            run = Path(temp) / "run"
            stored = envelope(30)
            materialize(run, stored, True)
            target = next((run / "images").iterdir())
            target.write_bytes(b"non-procedural-real-image-substitution")
            with self.assertRaises(GateError):
                SyntheticGate(stored, run).check()
            changed = amended(stored, lambda m: m.update(policyVersion="real-production-training"))
            with self.assertRaises(GateError):
                SyntheticGate(changed, run)

    def test_failure_cleanup_erases_photos_models_and_reports_only(self):
        with tempfile.TemporaryDirectory() as temp:
            run = Path(temp) / "run"
            materialize(run, envelope(30), True)
            (run / "model.pt").write_bytes(b"derived-weights")
            (run / "evaluation.json").write_text("{}")
            erase_artifacts(run)
            self.assertFalse((run / "images").exists())
            self.assertFalse((run / "model.pt").exists())
            self.assertFalse((run / "evaluation.json").exists())
            self.assertTrue((run / "manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
