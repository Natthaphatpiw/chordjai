"""Consent lineage, protected materialization and leakage-resistant split.

No production cache can be used offline. The synthetic path regenerates every
image from a fixed procedure and checks its bytes; it cannot launder real photos.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from collections import defaultdict

VERSION = "petid-dataset-v1"
ANGLE = {"front", "left", "right", "full_body", "nose_detail", "distinctive_mark"}
MARKER = ".petid-private-run"
SHA = re.compile(r"^[a-f0-9]{64}$")
HEX = re.compile(r"^[a-f0-9]{16}$")
OPAQUE = re.compile(r"^[a-zA-Z0-9_-]{8,128}$")


class GateError(RuntimeError):
    """Safe, bounded exception; never include credentials, URLs or source bytes."""


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                      allow_nan=False).encode("utf-8")


def digest(value: object) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def read_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, value: object) -> None:
    path.write_bytes(canonical(value) + b"\n")
    path.chmod(0o600)


def validate_manifest(envelope: dict) -> dict:
    manifest = envelope.get("manifest")
    if not isinstance(manifest, dict) or manifest.get("version") != VERSION:
        raise GateError("Unsupported dataset manifest")
    if not SHA.fullmatch(str(envelope.get("manifestSha256", ""))) or digest(manifest) != envelope["manifestSha256"]:
        raise GateError("Manifest integrity check failed")
    if not OPAQUE.fullmatch(str(manifest.get("exportId", ""))):
        raise GateError("Invalid dataset identity")
    samples = manifest.get("samples")
    if not isinstance(samples, list) or not 1 <= len(samples) <= 500:
        raise GateError("Dataset must contain 1–500 reviewed photos")
    seen_ids, seen_hashes, pet_owners, pet_species = set(), set(), {}, {}
    for sample in samples:
        for key in ("sampleId", "sessionId", "petKey", "ownerKey", "reviewId"):
            if not OPAQUE.fullmatch(str(sample.get(key, ""))):
                raise GateError("Invalid opaque sample lineage")
        if sample["sampleId"] in seen_ids:
            raise GateError("Repeated sample identifier")
        seen_ids.add(sample["sampleId"])
        if sample.get("species") not in {"cat", "dog"} or sample.get("angle") not in ANGLE:
            raise GateError("Invalid species or capture angle")
        if type(sample.get("consentVersion")) is not int or sample["consentVersion"] < 1:
            raise GateError("Missing consent revision")
        for key in ("imageSha256", "decodedSha256"):
            if not SHA.fullmatch(str(sample.get(key, ""))):
                raise GateError("Missing reviewed image fingerprint")
        if not HEX.fullmatch(str(sample.get("dhash64", ""))):
            raise GateError("Missing perceptual fingerprint")
        if any(type(sample.get(key)) is not int or not 32 <= sample[key] <= 4096 for key in ("width", "height")):
            raise GateError("Invalid image dimensions")
        for key in ("imageSha256", "decodedSha256"):
            token = (key, sample[key])
            if token in seen_hashes:
                raise GateError("Duplicate image leakage; reject snapshot and review it")
            seen_hashes.add(token)
        try:
            day = datetime.strptime(sample["captureDay"], "%Y-%m-%d")
            captured = datetime.fromisoformat(sample["capturedAt"].replace("Z", "+00:00"))
            if captured.tzinfo is None or day.strftime("%Y-%m-%d") != sample["captureDay"]:
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            raise GateError("Invalid owner-declared capture date") from None
        prior_owner = pet_owners.setdefault(sample["petKey"], sample["ownerKey"])
        if prior_owner != sample["ownerKey"]:
            raise GateError("An animal crosses owner groups")
        if pet_species.setdefault(sample["petKey"], sample["species"]) != sample["species"]:
            raise GateError("An animal has conflicting species labels")
    # Conservative quarantine: near duplicates are never allowed across dates,
    # sessions or identities. It may reject simple images: review rather than
    # claiming dHash is an identity detector.
    for index, first in enumerate(samples):
        for second in samples[index + 1:]:
            distance = (int(first["dhash64"], 16) ^ int(second["dhash64"], 16)).bit_count()
            if distance <= 2:
                raise GateError("Near-duplicate image leakage; independent review required")
    return manifest


def private_run(path: Path, create: bool = False) -> Path:
    path = path.absolute()
    if path.is_symlink():
        raise GateError("Private run path cannot use symlinks")
    # Resolve platform aliases such as macOS /var -> /private/var once, before
    # creating or checking the run marker. The run directory itself cannot be a
    # link, and cleanup always uses this resolved, pipeline-owned directory.
    path = path.resolve()
    if create:
        if path.exists() and any(path.iterdir()):
            raise GateError("Use a new empty private run directory")
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
        path.chmod(0o700)
        (path / MARKER).write_text(VERSION, encoding="utf-8")
        (path / MARKER).chmod(0o600)
    elif not path.is_dir() or not (path / MARKER).is_file() or (path / MARKER).read_text() != VERSION:
        raise GateError("Not a pipeline-owned private run directory")
    return path


def erase_artifacts(run: Path) -> None:
    """Erase only our exact artifact names under a verified, non-symlink run."""
    run = private_run(run)
    for name in ("images", "model.pt", "training.json", "calibration.json", "evaluation.json"):
        target = run / name
        if target.is_symlink():
            target.unlink()
        elif target.is_dir():
            shutil.rmtree(target)
        elif target.exists():
            target.unlink()


class ServerGate:
    def __init__(self, envelope: dict, origin: str | None = None, token: str | None = None):
        self.envelope = envelope
        self.manifest = validate_manifest(envelope)
        self.origin = (origin or os.environ.get("PETID_API_ORIGIN", "")).rstrip("/")
        self.token = token or os.environ.get("PETID_API_TOKEN", "")
        parsed = urllib.parse.urlsplit(self.origin)
        if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
            raise GateError("API origin must contain only scheme and host")
        local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
        if parsed.scheme != "https" and not (parsed.scheme == "http" and local):
            raise GateError("Dataset access requires HTTPS")
        if not self.token or any(c in self.token for c in "\r\n"):
            raise GateError("Missing admin API token in environment")

    def request(self, suffix: str, body: dict | None = None, raw: bool = False) -> object:
        url = f"{self.origin}/api/v1/biometric/review/datasets/{self.manifest['exportId']}{suffix}"
        req = urllib.request.Request(url, data=canonical(body) if body is not None else None,
                                     headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
                                     method="POST" if body is not None else "GET")
        # Never send a bearer token to a redirect host, including same-origin
        # redirects accidentally pointing at Blob/public URLs.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        try:
            with urllib.request.build_opener(NoRedirect).open(req, timeout=20) as response:
                limit = 5_000_000 if raw else 1_000_000
                data = response.read(limit + 1)
                if len(data) > limit:
                    raise GateError("Dataset response exceeded its size limit")
                if raw:
                    if response.headers.get_content_type() != "image/jpeg":
                        raise GateError("Dataset photo has an unexpected format")
                    return data
                decoded = json.loads(data)
                if not isinstance(decoded, dict):
                    raise GateError("Dataset response has an invalid shape")
                return decoded.get("data", decoded)
        except (urllib.error.URLError, OSError, ValueError, KeyError):
            raise GateError("Dataset authorization or transfer failed; run cannot continue") from None

    def check(self) -> None:
        answer = self.request("/authorize", {"manifestSha256": self.envelope["manifestSha256"]})
        try:
            if not isinstance(answer, dict):
                raise ValueError()
            checked = datetime.fromisoformat(answer["checkedAt"].replace("Z", "+00:00"))
            age = (datetime.now(timezone.utc) - checked).total_seconds()
            valid = answer["authorized"] is True and answer["exportId"] == self.manifest["exportId"] and answer["manifestSha256"] == self.envelope["manifestSha256"] and -5 <= age <= 60
        except (KeyError, TypeError, ValueError):
            valid = False
        if not valid:
            raise GateError("Snapshot is withdrawn, stale or unauthorized")

    def image(self, sample: dict) -> bytes:
        self.check()
        data = self.request(f"/samples/{sample['sampleId']}", raw=True)
        if hashlib.sha256(data).hexdigest() != sample["imageSha256"]:
            raise GateError("Reviewed image bytes changed")
        return data


def split_manifest(manifest: dict, seed: int = 17) -> dict[str, list[dict]]:
    owners = sorted({s["ownerKey"] for s in manifest["samples"]}, key=lambda value: hashlib.sha256(f"{seed}:{value}".encode()).hexdigest())
    if len(owners) < 10:
        raise GateError("Insufficient dataset: need at least 10 owner groups for a research split")
    train_end = max(2, math.floor(len(owners) * .6))
    calibration_end = train_end + max(2, math.floor(len(owners) * .2))
    assigned = {owner: "train" if index < train_end else "calibration" if index < calibration_end else "test" for index, owner in enumerate(owners)}
    splits = {name: [s for s in manifest["samples"] if assigned[s["ownerKey"]] == name] for name in ("train", "calibration", "test")}
    for name, samples in splits.items():
        pets = defaultdict(list)
        for sample in samples:
            pets[sample["petKey"]].append(sample)
        if len(pets) < 2:
            raise GateError(f"Insufficient {name} split: need at least two animals")
        for pet_samples in pets.values():
            if len({s["captureDay"] for s in pet_samples}) < 2 or len({s["sessionId"] for s in pet_samples}) < 2:
                raise GateError(f"Insufficient {name} split: every animal needs two capture days and sessions")
    return splits
