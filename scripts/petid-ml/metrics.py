"""Validation-only thresholds and consented unseen-animal evaluation.

Intervals resample probe animals or owners, conditional on the fixed gallery.
Pair counts are NOT treated as independent animals. This is a research report,
never an automatic model promotion or a claim about real-world accuracy.
"""
from __future__ import annotations
from collections import defaultdict
import hashlib
import math
import numpy as np


def gallery_and_probes(samples: list[dict]) -> tuple[list[int], list[int]]:
    pets = defaultdict(list)
    for index, sample in enumerate(samples):
        pets[sample["petKey"]].append(index)
    gallery, probes = [], []
    for pet_indices in pets.values():
        first_day = min(samples[i]["captureDay"] for i in pet_indices)
        earliest = [i for i in pet_indices if samples[i]["captureDay"] == first_day]
        earliest.sort(key=lambda i: (samples[i]["angle"] != "front", samples[i]["capturedAt"], samples[i]["sampleId"]))
        gallery.append(earliest[0])
        probes.extend(i for i in pet_indices if samples[i]["captureDay"] > first_day and samples[i]["sessionId"] != samples[earliest[0]]["sessionId"])
    return gallery, probes


def observations(samples: list[dict], vectors: np.ndarray, seed: int = 17) -> dict:
    gallery, probes = gallery_and_probes(samples)
    similarity = np.clip(vectors @ vectors.T, -1.0, 1.0)
    genuine, impostor, closed, known, unknown = [], [], [], [], []
    by_owner = defaultdict(list)
    for index in gallery:
        by_owner[samples[index]["ownerKey"]].append(index)
    # Hold out whole owners, including ALL of each owner's animals. Otherwise a
    # supposedly unknown owner could leak another pet/home into the gallery.
    # Stratify by the owner's species composition so small dog/cat cohorts can
    # still contain known and unknown owners where there are enough groups.
    owner_strata = defaultdict(list)
    for owner, indices in by_owner.items():
        signature = tuple(sorted({samples[index]["species"] for index in indices}))
        owner_strata[signature].append(owner)
    known_owners = set()
    for stratum in owner_strata.values():
        ordered = sorted(stratum, key=lambda owner: hashlib.sha256(f"open-owner:{seed}:{owner}".encode()).hexdigest())
        keep = max(1, math.floor(len(ordered) * .8)) if len(ordered) >= 2 else len(ordered)
        known_owners.update(ordered[:keep])
    enrolled = set()
    for owner in known_owners:
        enrolled.update(by_owner[owner])
    for probe in probes:
        source = samples[probe]
        compatible = [g for g in gallery if samples[g]["species"] == source["species"]]
        correct = next(g for g in compatible if samples[g]["petKey"] == source["petKey"])
        base = {"owner": source["ownerKey"], "pet": source["petKey"], "species": source["species"],
                "angle": source["angle"], "gapDays": (np.datetime64(source["captureDay"]) - np.datetime64(samples[correct]["captureDay"])).astype(int).item()}
        genuine.append({**base, "score": float(similarity[probe, correct])})
        for wrong in compatible:
            if samples[wrong]["petKey"] != source["petKey"]:
                impostor.append({**base, "score": float(similarity[probe, wrong])})
        ranked = sorted(compatible, key=lambda g: (-float(similarity[probe, g]), samples[g]["petKey"]))
        rank = ranked.index(correct) + 1
        closed.append({**base, "rank1": int(rank == 1), "rank5": int(rank <= 5), "gallerySize": len(compatible)})
        open_gallery = [g for g in compatible if g in enrolled]
        if not open_gallery:
            continue
        ordered = sorted(open_gallery, key=lambda g: (-float(similarity[probe, g]), samples[g]["petKey"]))
        if correct in open_gallery:
            known.append({**base, "score": float(similarity[probe, correct]),
                          "topCorrect": int(ordered[0] == correct), "topScore": float(similarity[probe, ordered[0]]),
                          "gallerySize": len(open_gallery)})
        else:
            unknown.append({**base, "score": float(similarity[probe, ordered[0]]), "gallerySize": len(open_gallery)})
    if {record["owner"] for record in known} & {record["owner"] for record in unknown}:
        raise ValueError("Open-set owner leakage")
    return {"genuine": genuine, "impostor": impostor, "closed": closed, "known": known,
            "unknown": unknown, "galleryAnimals": len(gallery), "probePhotos": len(probes),
            "enrolledAnimals": len(enrolled), "openSetKnownOwners": len(known_owners),
            "openSetUnknownOwners": len(set(by_owner) - known_owners)}


def threshold_at(scores: list[float], target: float) -> float | None:
    if not scores:
        return None
    ordered = sorted(set(scores))
    # Higher scores match; score == threshold is accepted. An explicit threshold
    # just beyond the observed maximum is needed for zero permitted false hits.
    candidates = ordered + [float(np.nextafter(max(ordered), math.inf))]
    return next(value for value in candidates if sum(score >= value for score in scores) / len(scores) <= target)


def calibrate(data: dict, target_fmr: float, target_fpir: float) -> dict:
    verification = threshold_at([r["score"] for r in data["impostor"]], target_fmr)
    identification = threshold_at([r["score"] for r in data["unknown"]], target_fpir)
    owners = len({r["owner"] for r in data["impostor"]})
    animals = len({r["pet"] for r in data["impostor"]})
    return {"sourcePartition": "calibration_only", "verificationThreshold": verification,
            "identificationThreshold": identification, "targetFmr": target_fmr, "targetFpir": target_fpir,
            "impostorComparisons": len(data["impostor"]), "impostorProbeOwners": owners,
            "impostorProbeAnimals": animals, "unknownProbePhotos": len(data["unknown"]),
            "unknownProbeOwners": len({r["owner"] for r in data["unknown"]}),
            "sufficientForTargetErrorClaim": False,
            "limitation": "Observed thresholds do not establish a target error rate; correlated pair counts do not equal independent trials."}


def rate(records: list[dict], value, seed: int = 17, repeats: int = 500) -> dict:
    if not records:
        return {"status": "insufficient_data", "count": 0, "rate": None, "ownerGrouped95CI": None, "animalGrouped95CI": None}
    values = [float(value(record)) for record in records]
    report = {"status": "descriptive_only", "count": len(records), "rate": float(np.mean(values)),
              "ownerGroups": len({r["owner"] for r in records}), "animalGroups": len({r["pet"] for r in records})}
    for field, label in (("owner", "ownerGrouped95CI"), ("pet", "animalGrouped95CI")):
        groups = defaultdict(list)
        for record, measured in zip(records, values):
            groups[record[field]].append(measured)
        if len(groups) < 10:
            report[label] = None
            report[label + "Status"] = "insufficient_groups_minimum_10"
            continue
        if min(values) == max(values):
            report[label] = None
            report[label + "Status"] = "degenerate_observations_no_unseen_error_bound"
            continue
        group_values = list(groups.values())
        randomizer = np.random.default_rng(seed)
        bootstrap = []
        for _ in range(repeats):
            chosen = randomizer.integers(0, len(group_values), size=len(group_values))
            expanded = [value for index in chosen for value in group_values[index]]
            bootstrap.append(float(np.mean(expanded)))
        low, high = np.quantile(bootstrap, [.025, .975])
        report[label] = [float(low), float(high)]
        report[label + "Status"] = "conditional_fixed_gallery_cluster_bootstrap"
    return report


def score_report(data: dict, calibration: dict) -> dict:
    threshold = calibration.get("verificationThreshold")
    open_threshold = calibration.get("identificationThreshold")
    verification = {"threshold": threshold, "FMR": rate(data["impostor"], lambda r: r["score"] >= threshold) if threshold is not None else rate([], None),
                    "FNMR": rate(data["genuine"], lambda r: r["score"] < threshold) if threshold is not None else rate([], None)}
    # Rank-5 is easy when the gallery is small; show exactly how many animals were
    # searched and whether all animals fit within five results.
    closed = {"rank1": rate(data["closed"], lambda r: r["rank1"]),
              "rank5": rate(data["closed"], lambda r: r["rank5"]),
              "gallerySizeByProbe": sorted({r["gallerySize"] for r in data["closed"]}),
              "rank5TrivialSmallGallery": bool(data["closed"]) and all(r["gallerySize"] <= 5 for r in data["closed"])}
    opened = {"threshold": open_threshold,
              "FPIR": rate(data["unknown"], lambda r: r["score"] >= open_threshold) if open_threshold is not None else rate([], None),
              "FNIRRank1": rate(data["known"], lambda r: not r["topCorrect"] or r["score"] < open_threshold) if open_threshold is not None else rate([], None),
              "gallerySizeByProbe": sorted({r["gallerySize"] for r in data["known"] + data["unknown"]}),
              "knownProbeCount": len(data["known"]), "unknownProbeCount": len(data["unknown"])}
    return {"verification": verification, "closedSetIdentification": closed, "openSetIdentification": opened}


def evaluation_report(data: dict, calibration: dict) -> dict:
    report = score_report(data, calibration)
    all_scores = [r["score"] for r in data["genuine"] + data["impostor"]]
    candidates = sorted(set(all_scores))
    if len(candidates) > 100:
        candidates = [candidates[index] for index in np.linspace(0, len(candidates) - 1, 100, dtype=int)]
    candidates = [-1.000001] + candidates + [1.000001]
    report["ROC"] = [{"threshold": t,
                      "FMR": sum(r["score"] >= t for r in data["impostor"]) / len(data["impostor"]) if data["impostor"] else None,
                      "TMR": sum(r["score"] >= t for r in data["genuine"]) / len(data["genuine"]) if data["genuine"] else None}
                     for t in candidates]
    report["ROCUsage"] = "Descriptive test curve; never used to choose the operating threshold."
    report["breakdowns"] = {}
    for key in ("species", "angle", "gapDays"):
        groups = sorted({str(r[key]) for r in data["genuine"] + data["impostor"] + data["closed"]})
        report["breakdowns"][key] = {}
        for group in groups:
            subset = {name: [r for r in data[name] if str(r[key]) == group] for name in ("genuine", "impostor", "closed", "known", "unknown")}
            report["breakdowns"][key][group] = score_report(subset, calibration)
    report["protocol"] = {"ownerAnimalSplit": "disjoint_train_calibration_test", "probeProtocol": "strictly_later_capture_day_and_different_session",
                          "speciesProtocol": "search_and_impostor_comparisons_within_declared_species",
                          "galleryProtocol": "one_earliest_day_photo_per_animal_prefer_front",
                          "openSetHoldout": "whole_owner_groups_stratified_by_owner_species_composition",
                          "openSetUnknownOwnersDisjointFromGallery": True,
                          "intervalProtocol": "500_cluster_bootstrap_replicates_by_probe_owner_and_animal_fixed_gallery",
                          "galleryAnimals": data["galleryAnimals"], "probePhotos": data["probePhotos"], "openSetEnrolledAnimals": data["enrolledAnimals"],
                          "openSetKnownOwnerGroups": data["openSetKnownOwners"], "openSetUnknownOwnerGroups": data["openSetUnknownOwners"]}
    report["deploymentEligible"] = False
    report["limitations"] = ["This small CNN is a research baseline, not a validated biometric identity product.",
                             "Independent review is a human evidence attestation, not a laboratory-proven identity label.",
                             "Capture times are owner-declared; multi-day metadata does not prove live capture or liveness.",
                             "Reported rates are conditional on this fixed gallery size; test again at the intended deployment scale.",
                             "Few independent owners or unknown animals cannot substantiate a low-error-rate claim.",
                             "Background, breed resemblance, lighting, occlusion and recapture robustness need independent testing.",
                             "Owner withdrawal invalidates the artifact; retrain from a fresh eligible snapshot before use."]
    return report
