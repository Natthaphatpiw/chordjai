#!/usr/bin/env python3
"""Run `python pipeline.py --help`; output contains no bearer tokens or photos."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
import PIL
import torch

from protocol import (GateError, MARKER, OPAQUE, ServerGate, canonical, digest,
                      erase_artifacts, private_run, read_json, split_manifest,
                      validate_manifest, write_json)
from model import MODEL_VERSION, PetEmbedding, embed, train as train_model
from metrics import calibrate, evaluation_report, observations
from synthetic import SyntheticGate, envelope as synthetic_envelope, photo


def source_hash() -> str:
    source = Path(__file__).parent
    return hashlib.sha256(b"".join((source / name).read_bytes() for name in ("protocol.py", "model.py", "metrics.py", "pipeline.py", "synthetic.py", "requirements.txt"))).hexdigest()


def fetch_envelope(export_id: str) -> dict:
    if not OPAQUE.fullmatch(export_id):
        raise GateError("Invalid export ID")
    origin = os.environ.get("PETID_API_ORIGIN", "").rstrip("/")
    token = os.environ.get("PETID_API_TOKEN", "")
    parsed = urllib.parse.urlsplit(origin)
    local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if (parsed.scheme != "https" and not (parsed.scheme == "http" and local)) or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
        raise GateError("A trusted HTTPS API origin is required")
    if not token or any(c in token for c in "\r\n"):
        raise GateError("An existing admin API token is required in the environment")
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    req = urllib.request.Request(f"{origin}/api/v1/biometric/review/datasets/{export_id}", headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=20) as response:
            data = response.read(1_000_001)
            if len(data) > 1_000_000:
                raise GateError("Dataset manifest exceeded its size limit")
            decoded = json.loads(data)
            if not isinstance(decoded, dict):
                raise GateError("Dataset response has an invalid shape")
            answer = decoded.get("data", decoded)
    except (urllib.error.URLError, OSError, ValueError):
        raise GateError("Authenticated dataset manifest could not be fetched") from None
    validate_manifest(answer)
    if answer["manifest"]["exportId"] != export_id:
        raise GateError("Dataset response identity changed")
    return answer


def gate_for(run: Path, synthetic: bool):
    if (run / "manifest.json").is_symlink():
        raise GateError("Manifest cannot use symlinks")
    stored = read_json(run / "manifest.json")
    manifest = validate_manifest(stored)
    if (run / "images").is_symlink():
        raise GateError("Image cache cannot use symlinks")
    expected_names = {s["sampleId"] + ".jpg" for s in manifest["samples"]}
    if not (run / "images").is_dir() or {p.name for p in (run / "images").iterdir()} != expected_names:
        raise GateError("Image cache does not match the reviewed snapshot")
    gate = SyntheticGate(stored, run) if synthetic else ServerGate(stored)
    gate.check()
    # Bind locally stored bytes too, even when a server-authorized cache exists.
    for sample in manifest["samples"]:
        path = run / "images" / f"{sample['sampleId']}.jpg"
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != sample["imageSha256"]:
            raise GateError("Local image cache no longer matches reviewed bytes")
    return stored, gate


def materialize(run: Path, stored: dict, synthetic: bool) -> None:
    manifest = validate_manifest(stored)
    gate = None if synthetic else ServerGate(stored)
    if gate:
        gate.check()
    run = private_run(run, create=True)
    write_json(run / "manifest.json", stored)
    images = run / "images"
    images.mkdir(mode=0o700)
    try:
        for sample in manifest["samples"]:
            if synthetic:
                parts = sample["sampleId"].split("-")
                data = photo(int(parts[-3]), int(parts[-2]), int(parts[-1]))
            else:
                data = gate.image(sample)
            target = images / f"{sample['sampleId']}.jpg"
            target.write_bytes(data)
            target.chmod(0o600)
        (SyntheticGate(stored, run) if synthetic else gate).check()
    except (GateError, OSError):
        erase_artifacts(run)
        raise


def train_run(run: Path, synthetic: bool, epochs: int, seed: int) -> dict:
    stored, gate = gate_for(run, synthetic)
    splits = split_manifest(stored["manifest"], seed)
    model, summary = train_model(run, splits["train"], gate, epochs, seed)
    gate.check()
    checkpoint = {"modelVersion": MODEL_VERSION, "manifestSha256": stored["manifestSha256"],
                  "seed": seed, "classes": summary["classes"], "stateDict": model.state_dict(),
                  "synthetic": synthetic, "pipelineSourceSha256": source_hash()}
    torch.save(checkpoint, run / "model.pt")
    (run / "model.pt").chmod(0o600)
    model_hash = hashlib.sha256((run / "model.pt").read_bytes()).hexdigest()
    vectors = embed(run, model, splits["calibration"], gate)
    calibration = calibrate(observations(splits["calibration"], vectors, seed), .001, .01)
    calibration.update({"manifestSha256": stored["manifestSha256"], "modelSha256": model_hash, "seed": seed})
    summary.update({"manifestSha256": stored["manifestSha256"], "modelSha256": model_hash,
                    "pipelineSourceSha256": source_hash(),
                    "runtime": {"python": sys.version.split()[0], "torch": str(torch.__version__), "pillow": PIL.__version__, "numpy": np.__version__, "device": "cpu", "threads": 2},
                    "status": "synthetic_smoke_only" if synthetic else "research_baseline",
                    "deploymentEligible": False,
                    "splitCounts": {name: {"photos": len(samples), "owners": len({s['ownerKey'] for s in samples}),
                                           "animals": len({s['petKey'] for s in samples})} for name, samples in splits.items()}})
    gate.check()
    write_json(run / "calibration.json", calibration)
    write_json(run / "training.json", summary)
    # Final authorization happens after writing: a concurrent withdrawal erases
    # the newly written artifact through the caller's failure handler.
    gate.check()
    return summary


def evaluate_run(run: Path, synthetic: bool) -> dict:
    stored, gate = gate_for(run, synthetic)
    checkpoint_path = run / "model.pt"
    if checkpoint_path.is_symlink() or (run / "calibration.json").is_symlink():
        raise GateError("Model artifacts cannot use symlinks")
    # weights_only prevents executable pickle payloads in a substituted file.
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    calibration = read_json(run / "calibration.json")
    model_hash = hashlib.sha256(checkpoint_path.read_bytes()).hexdigest()
    if checkpoint.get("modelVersion") != MODEL_VERSION or checkpoint.get("manifestSha256") != stored["manifestSha256"] or checkpoint.get("pipelineSourceSha256") != source_hash() or checkpoint.get("synthetic") is not synthetic or calibration.get("manifestSha256") != stored["manifestSha256"] or calibration.get("modelSha256") != model_hash or calibration.get("sourcePartition") != "calibration_only" or checkpoint.get("seed") != calibration.get("seed"):
        raise GateError("Model or calibration lineage does not match the current dataset")
    splits = split_manifest(stored["manifest"], checkpoint["seed"])
    model = PetEmbedding(checkpoint["classes"])
    model.load_state_dict(checkpoint["stateDict"])
    # Recalculate calibration deterministically from its partition. Editing a
    # threshold JSON cannot secretly choose a better threshold on test animals.
    calibration_vectors = embed(run, model, splits["calibration"], gate)
    expected = calibrate(observations(splits["calibration"], calibration_vectors, checkpoint["seed"]), .001, .01)
    if any(calibration.get(key) != value for key, value in expected.items()):
        raise GateError("Calibration was modified or does not reproduce")
    vectors = embed(run, model, splits["test"], gate)
    report = evaluation_report(observations(splits["test"], vectors, checkpoint["seed"]), calibration)
    report.update({"status": "synthetic_smoke_only" if synthetic else "research_baseline",
                   "manifestSha256": stored["manifestSha256"], "modelSha256": model_hash,
                   "pipelineSourceSha256": source_hash(),
                   "modelVersion": MODEL_VERSION, "seed": checkpoint["seed"], "calibration": calibration})
    gate.check()
    write_json(run / "evaluation.json", report)
    gate.check()
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Private consent-gated PetID research pipeline; never auto-promotes a model.")
    commands = parser.add_subparsers(dest="command", required=True)
    fetch = commands.add_parser("fetch", help="Materialize one currently authorized admin export")
    fetch.add_argument("--export-id", default=os.environ.get("PETID_EXPORT_ID"))
    fetch.add_argument("--out", type=Path, required=True)
    for name in ("train", "evaluate"):
        command = commands.add_parser(name)
        command.add_argument("--run", type=Path, required=True)
        command.add_argument("--synthetic", action="store_true", help="Accept only exactly regenerated procedural smoke textures")
        if name == "train":
            command.add_argument("--epochs", type=int, default=10)
            command.add_argument("--seed", type=int, default=17)
    smoke = commands.add_parser("smoke", help="Train/evaluate procedurally generated textures; no user data or API")
    smoke.add_argument("--out", type=Path, required=True)
    smoke.add_argument("--epochs", type=int, default=2)
    smoke.add_argument("--owners", type=int, default=30)
    args = parser.parse_args()
    run = getattr(args, "run", None) or getattr(args, "out", None)
    try:
        if hasattr(args, "epochs") and not 1 <= args.epochs <= 200:
            raise GateError("Epochs must be 1–200")
        if args.command == "fetch":
            if not args.export_id:
                raise GateError("An existing reviewed export ID is required")
            materialize(run, fetch_envelope(args.export_id), False)
            print(json.dumps({"status": "materialized_private_snapshot", "trainingStarted": False}))
        elif args.command == "train":
            summary = train_run(private_run(run), args.synthetic, args.epochs, args.seed)
            print(json.dumps({key: summary[key] for key in ("status", "gradientSteps", "parameterChangeL1", "deploymentEligible")}))
        elif args.command == "evaluate":
            report = evaluate_run(private_run(run), args.synthetic)
            print(json.dumps({"status": report["status"], "deploymentEligible": False, "report": "evaluation.json"}))
        else:
            materialize(run, synthetic_envelope(args.owners), True)
            summary = train_run(run, True, args.epochs, 17)
            evaluate_run(run, True)
            print(json.dumps({"status": "synthetic_smoke_only", "gradientSteps": summary["gradientSteps"],
                              "parameterChangeL1": summary["parameterChangeL1"], "deploymentEligible": False}))
        return 0
    except (GateError, OSError, ValueError, RuntimeError, KeyError, TypeError):
        # Fail closed for withdrawal, permissions, network and corrupted local
        # state. Never include an exception that might contain a signed URL.
        if run and run.is_dir() and (run / MARKER).is_file():
            try:
                erase_artifacts(run)
            except (GateError, OSError):
                pass
        print("PetID pipeline stopped. Authorization, dataset integrity or protocol failed. Pipeline-owned image/model/report artifacts are removed where accessible; create a fresh run after fixing the source.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
