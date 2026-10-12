"""An intentionally small, trainable image baseline; no downloaded weights."""
from __future__ import annotations
from collections import defaultdict
import hashlib
from io import BytesIO
from pathlib import Path
import random

import numpy as np
from PIL import Image, ImageEnhance
import torch
from torch import nn
from torch.nn import functional as F

from protocol import GateError

MODEL_VERSION = "petid-small-cnn-v1"
IMAGE_SIZE = 64
EMBEDDING_DIM = 64


class PetEmbedding(nn.Module):
    def __init__(self, classes: int):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(32, 48, 3, padding=1), nn.ReLU(), nn.AdaptiveAvgPool2d((4, 4)),
        )
        self.projection = nn.Linear(48 * 4 * 4, EMBEDDING_DIM)
        self.classifier = nn.Linear(EMBEDDING_DIM, classes)

    def forward(self, images: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        embedding = F.normalize(self.projection(self.features(images).flatten(1)), dim=1)
        return embedding, self.classifier(embedding)


def load_image(run: Path, sample: dict, brightness: float = 1.0) -> torch.Tensor:
    target = run / "images" / f"{sample['sampleId']}.jpg"
    if (run / "images").is_symlink() or target.is_symlink() or not target.is_file():
        raise GateError("Missing or unsafe cache photo")
    data = target.read_bytes()
    if hashlib.sha256(data).hexdigest() != sample["imageSha256"]:
        raise GateError("Local image cache was modified")
    try:
        with Image.open(BytesIO(data)) as image:
            if image.format != "JPEG" or image.size != (sample["width"], sample["height"]):
                raise GateError("Local image dimensions or format changed")
            image = ImageEnhance.Brightness(image.convert("RGB")).enhance(brightness)
            array = np.asarray(image.resize((IMAGE_SIZE, IMAGE_SIZE), Image.Resampling.BILINEAR), dtype=np.float32) / 255.0
    except (OSError, ValueError):
        raise GateError("Local photo cannot be decoded") from None
    return torch.from_numpy(array.copy()).permute(2, 0, 1)


def cross_day_loss(embeddings: torch.Tensor, samples: list[dict]) -> torch.Tensor:
    """Batch-hard cosine triplets, with positives from another session AND day."""
    distance = 1 - embeddings @ embeddings.T
    terms = []
    for index, first in enumerate(samples):
        positives = [j for j, second in enumerate(samples)
                     if first["petKey"] == second["petKey"] and first["captureDay"] != second["captureDay"] and first["sessionId"] != second["sessionId"]]
        negatives = [j for j, second in enumerate(samples)
                     if first["petKey"] != second["petKey"] and first["species"] == second["species"]]
        if positives and negatives:
            terms.append(F.relu(distance[index, positives].max() - distance[index, negatives].min() + .2))
    return torch.stack(terms).mean() if terms else embeddings.sum() * 0


def identity_batches(samples: list[dict], randomizer: random.Random, pets_per_batch: int = 16) -> list[list[dict]]:
    groups = defaultdict(list)
    for sample in samples:
        groups[sample["petKey"]].append(sample)
    pets = list(groups)
    randomizer.shuffle(pets)
    batches = []
    for start in range(0, len(pets), pets_per_batch):
        batch = []
        for pet in pets[start:start + pets_per_batch]:
            by_day = defaultdict(list)
            for sample in groups[pet]:
                by_day[sample["captureDay"]].append(sample)
            days = sorted(by_day)
            # Include two distinct days, then extra observations. Never duplicate
            # a single photo to invent an independent positive observation.
            chosen = [randomizer.choice(by_day[days[0]]), randomizer.choice(by_day[days[-1]])]
            available = [s for s in groups[pet] if s not in chosen]
            randomizer.shuffle(available)
            batch.extend(chosen + available[:2])
        if len({s["petKey"] for s in batch}) >= 2:
            batches.append(batch)
    return batches


def train(run: Path, samples: list[dict], gate, epochs: int, seed: int) -> tuple[PetEmbedding, dict]:
    torch.set_num_threads(2)
    torch.use_deterministic_algorithms(True)
    torch.manual_seed(seed)
    np.random.seed(seed)
    randomizer = random.Random(seed)
    labels = {pet: index for index, pet in enumerate(sorted({s["petKey"] for s in samples}))}
    model = PetEmbedding(len(labels))
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    initial = {key: value.detach().clone() for key, value in model.state_dict().items()}
    losses = []
    gradient_steps = 0
    for _ in range(epochs):
        gate.check()
        model.train()
        for batch in identity_batches(samples, randomizer):
            # Revocation is checked immediately before reading photos and again
            # immediately before each parameter update; no epoch-level blind gap.
            gate.check()
            images = torch.stack([load_image(run, sample, randomizer.uniform(.9, 1.1)) for sample in batch])
            targets = torch.tensor([labels[s["petKey"]] for s in batch], dtype=torch.long)
            embedding, logits = model(images)
            loss = F.cross_entropy(logits, targets) + .3 * cross_day_loss(embedding, batch)
            if not torch.isfinite(loss):
                raise GateError("Training became numerically invalid")
            optimizer.zero_grad()
            loss.backward()
            gate.check()
            optimizer.step()
            losses.append(float(loss.detach()))
            gradient_steps += 1
    gate.check()
    change = sum(float((value.detach() - initial[key]).abs().sum()) for key, value in model.state_dict().items())
    if gradient_steps == 0 or change <= 0:
        raise GateError("Training did not update any model parameters")
    return model, {"modelVersion": MODEL_VERSION, "seed": seed, "epochs": epochs,
                   "gradientSteps": gradient_steps, "parameterChangeL1": change,
                   "firstLoss": losses[0], "lastLoss": losses[-1],
                   "trainingAnimalCount": len(labels), "embeddingDimensions": EMBEDDING_DIM,
                   "imageSize": IMAGE_SIZE, "pretrainedWeights": False,
                   "loss": "cross_entropy_plus_0.3_cross_day_cosine_triplet", "classes": len(labels)}


def embed(run: Path, model: PetEmbedding, samples: list[dict], gate) -> np.ndarray:
    torch.set_num_threads(2)
    torch.use_deterministic_algorithms(True)
    model.eval()
    outputs = []
    with torch.no_grad():
        for start in range(0, len(samples), 32):
            gate.check()
            batch = samples[start:start + 32]
            images = torch.stack([load_image(run, sample) for sample in batch])
            outputs.extend(model(images)[0].numpy())
    gate.check()
    return np.asarray(outputs)
