"""Procedural non-animal textures used ONLY for offline smoke tests."""
from __future__ import annotations
import hashlib
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

from protocol import VERSION, GateError, canonical, digest, validate_manifest

PROCEDURE = "petid-non-animal-textures-v1"


def photo(owner: int, day: int, angle: int) -> bytes:
    rng = np.random.default_rng(owner * 100_000 + day * 1_000 + angle + 71)
    animal_rng = np.random.default_rng(owner + 357)
    texture = animal_rng.uniform(40, 205, (8, 8, 3))
    upsampled = np.repeat(np.repeat(texture, 8, axis=0), 8, axis=1)
    pixels = np.clip(upsampled + rng.normal(0, 38, (64, 64, 3)), 0, 255).astype(np.uint8)
    image = Image.fromarray(pixels, "RGB")
    output = BytesIO()
    image.save(output, format="JPEG", quality=85)
    return output.getvalue()


def fingerprints(data: bytes) -> tuple[str, str]:
    with Image.open(BytesIO(data)) as image:
        image = image.convert("RGB")
        decoded = hashlib.sha256(f"{image.width}x{image.height}:RGB\0".encode() + image.tobytes()).hexdigest()
        small = np.asarray(image.resize((9, 8), Image.Resampling.NEAREST).convert("L"))
        result = 0
        for row in range(8):
            for column in range(8):
                result = (result << 1) | int(small[row, column] > small[row, column + 1])
    return decoded, f"{result:016x}"


def envelope(owner_count: int = 30) -> dict:
    if not 10 <= owner_count <= 100:
        raise GateError("Synthetic owner count must be 10–100")
    samples = []
    for owner in range(owner_count):
        for day in range(2):
            for angle in range(2):
                data = photo(owner, day, angle)
                decoded, dhash = fingerprints(data)
                samples.append({"sampleId": f"sample-synthetic-{owner:04d}-{day}-{angle}",
                                "sessionId": f"session-synthetic-{owner:04d}-{day}",
                                "petKey": f"pet-synthetic-{owner:04d}", "ownerKey": f"owner-synthetic-{owner:04d}",
                                "reviewId": f"review-synthetic-{owner:04d}-{day}",
                                "species": "cat" if owner % 2 == 0 else "dog", "angle": "front" if angle == 0 else "left",
                                "capturedAt": f"2026-01-{1 + day * 7:02d}T12:00:00+07:00",
                                "captureDay": f"2026-01-{1 + day * 7:02d}", "consentVersion": 1,
                                "imageSha256": hashlib.sha256(data).hexdigest(), "decodedSha256": decoded,
                                "dhash64": dhash, "width": 64, "height": 64})
    manifest = {"version": VERSION, "exportId": f"synthetic-textures-{owner_count:04d}",
                "createdAt": "2026-01-01T00:00:00Z", "policyVersion": "synthetic-no-user-data",
                "syntheticProcedure": PROCEDURE, "syntheticOwnerCount": owner_count, "samples": samples}
    return {"manifest": manifest, "manifestSha256": digest(manifest)}


class SyntheticGate:
    def __init__(self, submitted: dict, run: Path):
        manifest = validate_manifest(submitted)
        expected = envelope(manifest.get("syntheticOwnerCount", 0))
        if canonical(submitted) != canonical(expected):
            raise GateError("Synthetic bypass accepts only exact procedurally regenerated textures")
        self.expected = expected
        self.run = run

    def check(self) -> None:
        if (self.run / "images").is_symlink():
            raise GateError("Synthetic cache cannot use symlinks")
        for sample in self.expected["manifest"]["samples"]:
            target = self.run / "images" / f"{sample['sampleId']}.jpg"
            if target.is_symlink() or not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != sample["imageSha256"]:
                raise GateError("Synthetic cache contains a non-procedural image")

    def image(self, sample: dict) -> bytes:
        parts = sample["sampleId"].split("-")
        return photo(int(parts[-3]), int(parts[-2]), int(parts[-1]))
