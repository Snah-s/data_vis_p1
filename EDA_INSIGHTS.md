# EDA Insights: VAST 2020 GraphletMatchMaker Methodology

This report summarizes the exploratory data analysis implemented in `src/graphletmatchmaker_eda.ipynb`. The analysis follows the methodology described in `GraphletMatchMaker.pdf`.

## Methodology Used

The PDF compares a template graph to candidate graphs through four complementary views:

1. **Node-link structure:** compare overall graph structure, node types, edge types, hubs, and connectedness.
2. **Graphlet frequencies:** compare small induced subgraph patterns in the person-to-person communication graph.
3. **Temporal profiles:** compare daily activity patterns and detect shifted activity peaks.
4. **Node/profile matching:** compare demographic/financial profiles, travel itineraries, procurement behavior, and local graph structure.

## Dataset Structure

The data is a directed, temporal, multi-relational heterogeneous graph.

| eType | Meaning | Main source-target pattern |
|---:|---|---|
| 0 | Email | Person -> Person |
| 1 | Phone | Person -> Person |
| 2 | Sell | Person -> Product category |
| 3 | Buy | Person -> Product category |
| 4 | Author-of | Person -> Document |
| 5 | Financial | Person <-> Financial category |
| 6 | Travels-to | Person -> Country |

The node types are:

| NodeType | Meaning |
|---:|---|
| 1 | Person |
| 2 | Product category |
| 3 | Document |
| 4 | Financial category |
| 5 | Country |

## Data Inventory

| Graph | Edges | Nodes | Interpretation |
|---|---:|---:|---|
| `CGCS-Template` | 1,325 | 88 | Reference graph |
| `Q1-Graph1` | 1,216 | 93 | Candidate graph |
| `Q1-Graph2` | 1,300 | 87 | Candidate graph |
| `Q1-Graph3` | 729 | 79 | Candidate graph |
| `Q1-Graph4` | 732 | 87 | Candidate graph |
| `Q1-Graph5` | 395 | 86 | Candidate graph |

All Q1 candidate graphs are connected when treated as weakly connected directed graphs.

## Data Quality Findings

- `Time = 31,536,000` appears heavily and corresponds to day 365. It is mostly associated with financial/demographic profile edges, so it should not be interpreted as regular activity timing.
- Negative `Time` values occur in historical `Author-of` edges and should be handled separately from 2025 daily activity profiles.
- `Weight = -1` appears in some travel edges in `Q1-Graph4` and `Q1-Graph5`; this likely encodes unknown or sentinel travel weight.
- `Weight = 0` appears only in `Q1-Graph5`.
- Location and latitude/longitude columns are sparse and should be interpreted as optional event attributes, not complete node attributes.
- Repeated `Source`, `Target`, `eType` combinations occur because the data is temporal and can contain repeated interactions.

## Structural Insights

Financial edges (`eType=5`) dominate every graph. This means raw edge-count similarity is strongly influenced by financial profile edges. For matching social structure, the communication-only graph from `eType` 0 and 1 is more informative.

The person-to-person communication graph sizes are:

| Graph | Communication nodes | Communication edges |
|---|---:|---:|
| `Template` | 17 | 67 |
| `Q1-Graph1` | 20 | 63 |
| `Q1-Graph2` | 18 | 62 |
| `Q1-Graph3` | 14 | 31 |
| `Q1-Graph4` | 39 | 82 |
| `Q1-Graph5` | 10 | 25 |

`Q1-Graph2` is structurally close to the template because it has a similar number of communication nodes and communication edges.

## Graphlet Insights

The graphlet analysis follows the PDF by using only the undirected person-to-person communication graph (`Email` and `Phone`). Lower graphlet distance means closer topological pattern.

Graphlet L1 distance to the template:

| Rank | Graph | Graphlet distance |
|---:|---|---:|
| 1 | `Q1-Graph2` | 0.237 |
| 2 | `Q1-Graph3` | 0.285 |
| 3 | `Q1-Graph1` | 0.308 |
| 4 | `Q1-Graph5` | 0.512 |
| 5 | `Q1-Graph4` | 0.624 |

The closest candidates by graphlet frequency are:

| Rank | Graph | Interpretation |
|---:|---|---|
| 1 | `Q1-Graph2` | Closest communication topology |
| 2 | `Q1-Graph3` | Similar motifs but smaller communication graph |
| 3 | `Q1-Graph1` | Close, but less aligned than Graph2 |
| 4 | `Q1-Graph5` | Different/sparser communication topology |
| 5 | `Q1-Graph4` | Communication graph is much larger and structurally different |

This supports the PDF example, which visually compares `CGCS-Template` and `Q1-Graph2`.

## Temporal Insights

The temporal comparison uses daily edge counts from `Time // 86,400` and compares candidates to the template using best lag from -30 to +30 days.

Important observations:

- All-edge profiles are dominated by financial edges at day 365, so they are not enough for matching.
- Communication profiles are much more useful for comparing social behavior.
- `Q1-Graph2` has the strongest communication temporal similarity to the template, with an estimated best shift of about 11 days.
- This aligns with the PDF narrative that `Q1-Graph2` shows a similar activity peak to the template with a shifted timing.
- Travel profiles are noisier and less discriminative in this subset, but they still contribute to profile-level matching.

Communication temporal comparison to the template:

| Graph | Best lag in days | Cosine distance |
|---|---:|---:|
| `Q1-Graph2` | 11 | 0.411 |
| `Q1-Graph1` | 24 | 0.512 |
| `Q1-Graph4` | 22 | 0.675 |
| `Q1-Graph3` | 28 | 0.722 |
| `Q1-Graph5` | -6 | 0.776 |

## Financial and Profile Insights

The PDF uses demographic profiles as a key matching signal. In this repository, template IDs are local/anonymized while Q1 graph IDs are global. Because of that, direct comparison by category node ID is not valid between template and Q1 graphs.

The notebook therefore compares ID-agnostic profile shapes:

- sorted financial category weight distributions,
- nearest per-person financial profile vectors,
- sorted buy/sell product distributions,
- nearest per-person travel vectors.

`Q1-Graph2`, `Q1-Graph1`, and `Q1-Graph3` have much more similar financial/profile shapes than `Q1-Graph4` and `Q1-Graph5`.

## Q2 Seed Findings

The Q2 seed files contain one edge each:

| Seed | Pattern | Interpretation |
|---|---|---|
| `Q2-Seed1` | Person -> Document, `Author-of` | Historical publication-like edge |
| `Q2-Seed2` | Person -> Document, `Author-of` | Historical publication-like edge |
| `Q2-Seed3` | Person -> Product category, `Sell` | Procurement seed |

The exact seed edges do not appear in the Q1 candidate files. `Q2-Seed3` shares its target product node with `Q1-Graph1`, but the edge itself is absent.

The PDF method would use these seeds to expand into nearby candidate neighborhoods in the large graph. In this reduced repository, the available Q1 files are already extracted candidate subgraphs, so the seed-based expansion can only be inspected, not fully reproduced.

## Final Candidate Ranking

Using the combined PDF-inspired score from graphlets, temporal profiles, financial/profile shapes, travel profiles, and procurement shapes:

| Rank | Candidate | Combined score | Conclusion |
|---:|---|---:|---|
| 1 | `Q1-Graph2` | 0.378 | Best overall match to `CGCS-Template` |
| 2 | `Q1-Graph1` | 0.394 | Close alternative |
| 3 | `Q1-Graph3` | 0.406 | Close but weaker temporal communication match |
| 4 | `Q1-Graph4` | 0.649 | Structurally different communication graph |
| 5 | `Q1-Graph5` | 0.888 | Most different overall |

Detailed normalized-score inputs before final averaging:

| Graph | Graphlet | All-time | Communication time | Travel time | Financial shape | Buy shape | Sell shape | Person financial | Person travel |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `Q1-Graph2` | 0.237 | 0.005 | 0.411 | 0.710 | 0.040 | 0.000 | 0.000 | 0.010 | 0.015 |
| `Q1-Graph1` | 0.308 | 0.004 | 0.512 | 0.731 | 0.053 | 0.000 | 0.000 | 0.009 | 0.011 |
| `Q1-Graph3` | 0.285 | 0.004 | 0.722 | 0.694 | 0.006 | 0.000 | 0.000 | 0.011 | 0.010 |
| `Q1-Graph4` | 0.624 | 0.005 | 0.675 | 0.705 | 0.021 | 0.163 | 0.161 | 0.011 | 0.023 |
| `Q1-Graph5` | 0.512 | 0.010 | 0.776 | 0.759 | 0.322 | 0.479 | 0.028 | 0.015 | 0.053 |

## Main Conclusion

`Q1-Graph2` is the best candidate match for `CGCS-Template` under the GraphletMatchMaker methodology.

The strongest evidence is:

- its person-to-person communication graph is closest in size and graphlet structure,
- its communication temporal profile is the closest after a small time shift,
- its financial and per-person profile shapes are close to the template,
- the result agrees with the example and visual comparison emphasized in the PDF.

## Recommended Use

Use `src/graphletmatchmaker_eda.ipynb` as the reproducible technical artifact and this Markdown file as the written EDA summary. If the task requires selecting one candidate graph, select `Q1-Graph2`.
