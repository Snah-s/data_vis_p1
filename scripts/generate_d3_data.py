from __future__ import annotations

import csv
import itertools
import json
import math
from collections import Counter, defaultdict, deque
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUT = ROOT / "public" / "data" / "graphletmatchmaker.json"

GRAPH_FILES = {
    "Template": "CGCS-Template.csv",
    "Q1-Graph1": "Q1-Graph1.csv",
    "Q1-Graph2": "Q1-Graph2.csv",
    "Q1-Graph3": "Q1-Graph3.csv",
    "Q1-Graph4": "Q1-Graph4.csv",
    "Q1-Graph5": "Q1-Graph5.csv",
}

EDGE_LABELS = {
    0: "Email",
    1: "Phone",
    2: "Sell",
    3: "Buy",
    4: "Author-of",
    5: "Financial",
    6: "Travels-to",
}

NODE_LABELS = {
    "1": "Person",
    "2": "Product",
    "3": "Document",
    "4": "Financial",
    "5": "Country",
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def to_float(value: str | None, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except ValueError:
        return default


def to_int(value: str | None, default: int = 0) -> int:
    try:
        return int(float(value or default))
    except ValueError:
        return default


def cosine_distance(a: list[float], b: list[float]) -> float:
    n = max(len(a), len(b))
    aa = a + [0.0] * (n - len(a))
    bb = b + [0.0] * (n - len(b))
    dot = sum(x * y for x, y in zip(aa, bb))
    na = math.sqrt(sum(x * x for x in aa))
    nb = math.sqrt(sum(x * x for x in bb))
    if na == 0 and nb == 0:
        return 0.0
    if na == 0 or nb == 0:
        return 1.0
    return 1.0 - dot / (na * nb)


def normalized_l1(c1: Counter[str], c2: Counter[str]) -> float:
    keys = sorted(set(c1) | set(c2))
    a = [float(c1.get(k, 0)) for k in keys]
    b = [float(c2.get(k, 0)) for k in keys]
    sa = sum(a)
    sb = sum(b)
    if sa:
        a = [x / sa for x in a]
    if sb:
        b = [x / sb for x in b]
    return sum(abs(x - y) for x, y in zip(a, b)) / 2.0


def canonical_graphlet_key(nodes: tuple[str, ...], edges: set[tuple[str, str]]) -> str:
    best = None
    n = len(nodes)
    for perm in itertools.permutations(nodes):
        bits = []
        for i in range(n):
            for j in range(i + 1, n):
                a, b = sorted((perm[i], perm[j]))
                bits.append("1" if (a, b) in edges else "0")
        candidate = "".join(bits)
        if best is None or candidate < best:
            best = candidate
    return f"n{n}:{best}"


def connected(subset: tuple[str, ...], adjacency: dict[str, set[str]]) -> bool:
    seen = {subset[0]}
    queue = deque([subset[0]])
    wanted = set(subset)
    while queue:
        node = queue.popleft()
        for neighbor in adjacency[node] & wanted:
            if neighbor not in seen:
                seen.add(neighbor)
                queue.append(neighbor)
    return seen == wanted


def communication_graphlet_counts(rows: list[dict[str, str]], kmax: int = 4):
    edges: set[tuple[str, str]] = set()
    adjacency: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        if to_int(row["eType"]) not in (0, 1):
            continue
        a, b = sorted((row["Source"], row["Target"]))
        edges.add((a, b))
        adjacency[a].add(b)
        adjacency[b].add(a)

    counts: Counter[str] = Counter()
    nodes = sorted(adjacency)
    for k in range(2, kmax + 1):
        for subset in itertools.combinations(nodes, k):
            if connected(subset, adjacency):
                counts[canonical_graphlet_key(subset, edges)] += 1
    return counts, adjacency, edges


def daily_counts(rows: list[dict[str, str]], etypes: set[int] | None = None) -> list[int]:
    counts = [0] * 366
    for row in rows:
        etype = to_int(row["eType"])
        if etypes is not None and etype not in etypes:
            continue
        time = to_float(row["Time"])
        if time < 0 or time > 31_536_000:
            continue
        day = max(0, min(365, int(time // 86_400)))
        counts[day] += 1
    return counts


def shifted(values: list[int], lag: int) -> list[float]:
    if lag < 0:
        return [float(x) for x in values[-lag:]] + [0.0] * (-lag)
    if lag > 0:
        return [0.0] * lag + [float(x) for x in values[:-lag]]
    return [float(x) for x in values]


def best_lag(template: list[int], candidate: list[int], limit: int = 30) -> dict[str, float]:
    best = {"lag": 0, "distance": cosine_distance(template, candidate)}
    for lag in range(-limit, limit + 1):
        distance = cosine_distance(template, shifted(candidate, lag))
        if distance < best["distance"]:
            best = {"lag": lag, "distance": distance}
    return best


def sorted_weight_profile(rows: list[dict[str, str]], etype: int) -> list[float]:
    totals: dict[str, float] = defaultdict(float)
    for row in rows:
        if to_int(row["eType"]) != etype:
            continue
        weight = to_float(row["Weight"])
        if weight < 0:
            continue
        totals[row["Target"]] += weight
    vals = sorted(totals.values(), reverse=True)
    total = sum(vals)
    return [v / total for v in vals] if total else []


def person_profile_matrix(rows: list[dict[str, str]], etype: int) -> list[list[float]]:
    by_person: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for row in rows:
        if to_int(row["eType"]) != etype:
            continue
        weight = to_float(row["Weight"])
        if weight < 0:
            continue
        by_person[row["Source"]][row["Target"]] += weight
    matrix = []
    for profile in by_person.values():
        vals = sorted(profile.values(), reverse=True)
        total = sum(vals)
        if total:
            matrix.append([v / total for v in vals])
    return matrix


def average_nearest(template_profiles: list[list[float]], candidate_profiles: list[list[float]]) -> float:
    if not template_profiles or not candidate_profiles:
        return 1.0
    distances = []
    for template in template_profiles:
        distances.append(min(cosine_distance(template, candidate) for candidate in candidate_profiles))
    return sum(distances) / len(distances)


def weak_components(node_ids: set[str], edges: list[tuple[str, str]]) -> list[int]:
    adjacency: dict[str, set[str]] = defaultdict(set)
    for node in node_ids:
        adjacency[node]
    for source, target in edges:
        adjacency[source].add(target)
        adjacency[target].add(source)
    seen: set[str] = set()
    sizes = []
    for node in node_ids:
        if node in seen:
            continue
        queue = deque([node])
        seen.add(node)
        size = 0
        while queue:
            cur = queue.popleft()
            size += 1
            for nxt in adjacency[cur]:
                if nxt not in seen:
                    seen.add(nxt)
                    queue.append(nxt)
        sizes.append(size)
    return sorted(sizes, reverse=True)


def node_type_counts(nodes: set[str], type_map: dict[str, str]) -> dict[str, int]:
    counts = Counter(type_map.get(node, "Unknown") for node in nodes)
    return {NODE_LABELS.get(k, k): v for k, v in sorted(counts.items())}


def relation_type_counts(rows: list[dict[str, str]], type_map: dict[str, str]) -> list[dict[str, str | int]]:
    counts: Counter[tuple[int, str, str]] = Counter()
    for row in rows:
        etype = to_int(row["eType"])
        source_type = NODE_LABELS.get(type_map.get(row["Source"], "Unknown"), "Unknown")
        target_type = NODE_LABELS.get(type_map.get(row["Target"], "Unknown"), "Unknown")
        counts[(etype, source_type, target_type)] += 1
    return [
        {"eType": etype, "edgeLabel": EDGE_LABELS.get(etype, str(etype)), "sourceType": source, "targetType": target, "count": count}
        for (etype, source, target), count in sorted(counts.items())
    ]


def top_degree(adjacency: dict[str, set[str]], limit: int = 12) -> list[dict[str, int | str]]:
    return [
        {"node": node, "degree": len(neighbors)}
        for node, neighbors in sorted(adjacency.items(), key=lambda item: len(item[1]), reverse=True)[:limit]
    ]


def graph_payload(name: str, rows: list[dict[str, str]], type_map: dict[str, str]) -> dict:
    node_ids = {row["Source"] for row in rows} | {row["Target"] for row in rows}
    edge_pairs = [(row["Source"], row["Target"]) for row in rows]
    components = weak_components(node_ids, edge_pairs)
    etype_counts = Counter(to_int(row["eType"]) for row in rows)
    graphlet_counts, adjacency, comm_edges = communication_graphlet_counts(rows)
    duplicate_keys = Counter((row["Source"], row["Target"], to_int(row["eType"])) for row in rows)

    return {
        "name": name,
        "summary": {
            "edges": len(rows),
            "nodes": len(node_ids),
            "density": len(rows) / (len(node_ids) * (len(node_ids) - 1)) if len(node_ids) > 1 else 0,
            "weakComponents": len(components),
            "largestComponent": components[0] if components else 0,
            "selfLoops": sum(1 for row in rows if row["Source"] == row["Target"]),
            "duplicateRelations": sum(count - 1 for count in duplicate_keys.values() if count > 1),
            "negativeTimeRows": sum(1 for row in rows if to_float(row["Time"]) < 0),
            "day365Rows": sum(1 for row in rows if to_float(row["Time"]) == 31_536_000),
            "negativeWeightRows": sum(1 for row in rows if to_float(row["Weight"]) < 0),
            "zeroWeightRows": sum(1 for row in rows if to_float(row["Weight"]) == 0),
            "communicationNodes": len(adjacency),
            "communicationEdges": len(comm_edges),
        },
        "nodes": [
            {
                "id": node,
                "type": type_map.get(node, "Unknown"),
                "typeLabel": NODE_LABELS.get(type_map.get(node, "Unknown"), "Unknown"),
                "location": next((r.get("SourceLocation") for r in rows if r["Source"] == node and r.get("SourceLocation")), ""),
            }
            for node in sorted(node_ids)
        ],
        "edges": [
            {
                "source": row["Source"],
                "target": row["Target"],
                "eType": to_int(row["eType"]),
                "label": EDGE_LABELS.get(to_int(row["eType"]), str(row["eType"])),
                "time": to_float(row["Time"]),
                "weight": to_float(row["Weight"]),
            }
            for row in rows
        ],
        "edgeTypeCounts": [
            {"eType": etype, "label": EDGE_LABELS.get(etype, str(etype)), "count": count}
            for etype, count in sorted(etype_counts.items())
        ],
        "nodeTypeCounts": node_type_counts(node_ids, type_map),
        "relationTypeCounts": relation_type_counts(rows, type_map),
        "communicationHubs": top_degree(adjacency),
        "graphlets": dict(graphlet_counts),
        "daily": {
            "all": daily_counts(rows),
            "communication": daily_counts(rows, {0, 1}),
            "travel": daily_counts(rows, {6}),
            "financial": daily_counts(rows, {5}),
            "procurement": daily_counts(rows, {2, 3}),
        },
        "profiles": {
            "financialShape": sorted_weight_profile(rows, 5),
            "buyShape": sorted_weight_profile(rows, 3),
            "sellShape": sorted_weight_profile(rows, 2),
        },
    }


def seed_payload(rows_by_graph: dict[str, list[dict[str, str]]], global_type_map: dict[str, str]) -> list[dict]:
    q1_node_sets = {
        name: {row["Source"] for row in rows} | {row["Target"] for row in rows}
        for name, rows in rows_by_graph.items()
        if name != "Template"
    }
    q1_edge_sets = {
        name: {(row["Source"], row["Target"], to_int(row["eType"])) for row in rows}
        for name, rows in rows_by_graph.items()
        if name != "Template"
    }
    out = []
    for seed_file in sorted(DATA_DIR.glob("Q2-Seed*.csv")):
        row = read_csv(seed_file)[0]
        source = row["Source"]
        target = row["Target"]
        etype = to_int(row["eType"])
        edge = (source, target, etype)
        out.append(
            {
                "seed": seed_file.stem,
                "source": source,
                "sourceType": NODE_LABELS.get(global_type_map.get(source), "Unknown"),
                "target": target,
                "targetType": NODE_LABELS.get(global_type_map.get(target), "Unknown"),
                "eType": etype,
                "label": EDGE_LABELS.get(etype, str(etype)),
                "time": to_float(row["Time"]),
                "weight": to_float(row["Weight"]),
                "edgeIn": [name for name, edges in q1_edge_sets.items() if edge in edges],
                "sourceIn": [name for name, nodes in q1_node_sets.items() if source in nodes],
                "targetIn": [name for name, nodes in q1_node_sets.items() if target in nodes],
            }
        )
    return out


def main() -> None:
    global_types = {row["NodeID"]: row["NodeType"] for row in read_csv(DATA_DIR / "CGCS-GraphData-NodeTypes.csv")}
    template_types = {row["NodeID"]: row["NodeType"] for row in read_csv(DATA_DIR / "CGCS-Template-NodeTypes.csv")}
    rows_by_graph = {name: read_csv(DATA_DIR / filename) for name, filename in GRAPH_FILES.items()}
    graphs = [
        graph_payload(name, rows, template_types if name == "Template" else global_types)
        for name, rows in rows_by_graph.items()
    ]

    template = next(graph for graph in graphs if graph["name"] == "Template")
    template_rows = rows_by_graph["Template"]
    template_person_financial = person_profile_matrix(template_rows, 5)
    template_person_travel = person_profile_matrix(template_rows, 6)

    comparison = []
    for graph in graphs:
        name = graph["name"]
        rows = rows_by_graph[name]
        temporal = {}
        for layer in ("all", "communication", "travel", "financial", "procurement"):
            temporal[layer] = best_lag(template["daily"][layer], graph["daily"][layer])
        profile_distances = {
            "financialShape": cosine_distance(template["profiles"]["financialShape"], graph["profiles"]["financialShape"]),
            "buyShape": cosine_distance(template["profiles"]["buyShape"], graph["profiles"]["buyShape"]),
            "sellShape": cosine_distance(template["profiles"]["sellShape"], graph["profiles"]["sellShape"]),
            "personFinancial": average_nearest(template_person_financial, person_profile_matrix(rows, 5)),
            "personTravel": average_nearest(template_person_travel, person_profile_matrix(rows, 6)),
        }
        comparison.append(
            {
                "graph": name,
                "graphletDistance": normalized_l1(Counter(template["graphlets"]), Counter(graph["graphlets"])),
                "temporal": temporal,
                "profileDistances": profile_distances,
            }
        )

    candidates = [row for row in comparison if row["graph"] != "Template"]
    metrics = {
        "graphletDistance": [row["graphletDistance"] for row in candidates],
        "allTime": [row["temporal"]["all"]["distance"] for row in candidates],
        "communicationTime": [row["temporal"]["communication"]["distance"] for row in candidates],
        "travelTime": [row["temporal"]["travel"]["distance"] for row in candidates],
        "financialShape": [row["profileDistances"]["financialShape"] for row in candidates],
        "buyShape": [row["profileDistances"]["buyShape"] for row in candidates],
        "sellShape": [row["profileDistances"]["sellShape"] for row in candidates],
        "personFinancial": [row["profileDistances"]["personFinancial"] for row in candidates],
        "personTravel": [row["profileDistances"]["personTravel"] for row in candidates],
    }
    maxes = {key: max(values) if max(values) else 1 for key, values in metrics.items()}
    ranking = []
    for row in candidates:
        values = {
            "graphlet": row["graphletDistance"] / maxes["graphletDistance"],
            "allTime": row["temporal"]["all"]["distance"] / maxes["allTime"],
            "communicationTime": row["temporal"]["communication"]["distance"] / maxes["communicationTime"],
            "travelTime": row["temporal"]["travel"]["distance"] / maxes["travelTime"],
            "financialShape": row["profileDistances"]["financialShape"] / maxes["financialShape"],
            "buyShape": row["profileDistances"]["buyShape"] / maxes["buyShape"],
            "sellShape": row["profileDistances"]["sellShape"] / maxes["sellShape"],
            "personFinancial": row["profileDistances"]["personFinancial"] / maxes["personFinancial"],
            "personTravel": row["profileDistances"]["personTravel"] / maxes["personTravel"],
        }
        ranking.append({"graph": row["graph"], "score": sum(values.values()) / len(values), "metrics": values})
    ranking.sort(key=lambda item: item["score"])

    payload = {
        "edgeLabels": EDGE_LABELS,
        "nodeLabels": NODE_LABELS,
        "graphs": graphs,
        "comparison": comparison,
        "ranking": ranking,
        "seeds": seed_payload(rows_by_graph, global_types),
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
