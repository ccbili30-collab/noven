from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
import networkx as nx


LAYER_ORDER = [
    "世界基准",
    "资料索引",
    "核心规则与边界",
    "宇宙、自然与地理",
    "生态、资源与物种",
    "经济、技术与力量体系",
    "社会、文化与日常生活",
    "国家、组织与权力",
    "历史、时代与重大事件",
    "地区、城市与重要地点",
    "当前局势与核心冲突",
    "人物、关系与阵营",
    "故事、传说与叙事入口",
    "视觉、地图与关系索引",
]
EDGE_COLORS = {"causes": "#d95f02", "adopts": "#2b6cb0"}
LAYER_COLORS = plt.get_cmap("tab20").colors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render persisted Growth World relations without inventing edges.")
    parser.add_argument("index", type=Path, help="Path to the persisted relation index.json")
    parser.add_argument("output", type=Path, help="Output directory")
    return parser.parse_args()


def load_graph(path: Path) -> tuple[nx.MultiDiGraph, list[dict[str, object]], list[dict[str, object]]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("nodes"), list) or not isinstance(payload.get("relations"), list):
        raise ValueError("relation index must contain nodes and relations arrays")

    nodes = payload["nodes"]
    relations = [edge for edge in payload["relations"] if isinstance(edge, dict) and edge.get("type") in EDGE_COLORS]
    node_ids = [node.get("id") for node in nodes if isinstance(node, dict)]
    if len(node_ids) != len(nodes) or any(not isinstance(node_id, str) or not node_id for node_id in node_ids):
        raise ValueError("every node must have a non-empty string id")
    if len(set(node_ids)) != len(node_ids):
        raise ValueError("node ids must be unique")

    graph = nx.MultiDiGraph()
    for node in nodes:
        layer = node.get("layer")
        if not isinstance(layer, str) or layer not in LAYER_ORDER:
            raise ValueError(f"unknown node layer: {layer!r}")
        graph.add_node(
            node["id"],
            title=str(node.get("title", node["id"])),
            layer=layer,
            path=str(node.get("path", "")),
            subset=LAYER_ORDER.index(layer),
        )

    for edge_index, edge in enumerate(relations):
        source = edge.get("from")
        target = edge.get("to")
        if source not in graph or target not in graph:
            raise ValueError(f"edge {edge_index} references an unknown endpoint: {source!r} -> {target!r}")
        graph.add_edge(source, target, key=f"{edge['type']}:{edge_index}", type=edge["type"], note=str(edge.get("note", "")))

    return graph, nodes, relations


def graph_summary(graph: nx.MultiDiGraph) -> dict[str, object]:
    layer_counts = Counter(data["layer"] for _, data in graph.nodes(data=True))
    edge_counts = Counter(data["type"] for *_, data in graph.edges(data=True))
    degree = sorted(
        (
            {
                "id": node_id,
                "title": graph.nodes[node_id]["title"],
                "layer": graph.nodes[node_id]["layer"],
                "inDegree": graph.in_degree(node_id),
                "outDegree": graph.out_degree(node_id),
                "degree": graph.degree(node_id),
            }
            for node_id in graph.nodes
        ),
        key=lambda item: (-item["degree"], item["title"]),
    )
    return {
        "nodeCount": graph.number_of_nodes(),
        "edgeCount": graph.number_of_edges(),
        "nodesByLayer": {layer: layer_counts[layer] for layer in LAYER_ORDER},
        "edgesByType": {edge_type: edge_counts[edge_type] for edge_type in EDGE_COLORS},
        "highestDegreeNodes": degree[:20],
    }


def render_full_graph(graph: nx.MultiDiGraph, output: Path) -> None:
    plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False
    positions = nx.multipartite_layout(graph, subset_key="subset", align="vertical", scale=2.2)
    figure, axis = plt.subplots(figsize=(30, 22), constrained_layout=True)
    axis.set_facecolor("#f7f5f0")

    for edge_type, color in EDGE_COLORS.items():
        edges = [(source, target, key) for source, target, key, data in graph.edges(keys=True, data=True) if data["type"] == edge_type]
        nx.draw_networkx_edges(
            graph,
            positions,
            edgelist=edges,
            edge_color=color,
            width=1.1 if edge_type == "causes" else 0.45,
            alpha=0.55 if edge_type == "causes" else 0.10,
            arrows=True,
            arrowsize=7,
            connectionstyle="arc3,rad=0.04",
            ax=axis,
        )

    node_colors = [LAYER_COLORS[LAYER_ORDER.index(graph.nodes[node]["layer"]) % len(LAYER_COLORS)] for node in graph.nodes]
    node_sizes = [55 + min(graph.degree(node), 35) * 5 for node in graph.nodes]
    nx.draw_networkx_nodes(graph, positions, node_color=node_colors, node_size=node_sizes, edgecolors="#2b2b2b", linewidths=0.35, alpha=0.95, ax=axis)

    labels = {
        item["id"]: item["title"]
        for item in graph_summary(graph)["highestDegreeNodes"][:24]
    }
    nx.draw_networkx_labels(graph, positions, labels=labels, font_size=6.5, font_family="Microsoft YaHei", ax=axis)

    axis.set_title("阿斯特拉恩世界关系图\n箭头方向：原因/正文 -> 结果/实际采用来源", fontsize=20, pad=18)
    axis.axis("off")
    axis.legend(
        handles=[
            Line2D([0], [0], color=EDGE_COLORS["causes"], lw=2, label="causes：世界内部因果"),
            Line2D([0], [0], color=EDGE_COLORS["adopts"], lw=2, label="adopts：正文实际采用来源"),
        ],
        loc="lower center",
        ncol=2,
        frameon=True,
    )
    figure.savefig(output / "world-graph-full.svg", format="svg", facecolor=figure.get_facecolor())
    figure.savefig(output / "world-graph-full.png", dpi=180, facecolor=figure.get_facecolor())
    plt.close(figure)


def render_layer_overview(graph: nx.MultiDiGraph, output: Path) -> None:
    overview = nx.MultiDiGraph()
    for layer in LAYER_ORDER:
        overview.add_node(layer, subset=LAYER_ORDER.index(layer))
    counts: Counter[tuple[str, str, str]] = Counter()
    for source, target, data in graph.edges(data=True):
        counts[(graph.nodes[source]["layer"], graph.nodes[target]["layer"], data["type"])] += 1
    for (source, target, edge_type), count in counts.items():
        overview.add_edge(source, target, type=edge_type, count=count)

    positions = nx.circular_layout(overview, scale=1.8)
    figure, axis = plt.subplots(figsize=(18, 16), constrained_layout=True)
    axis.set_facecolor("#f7f5f0")
    nx.draw_networkx_nodes(
        overview,
        positions,
        node_color=[LAYER_COLORS[index % len(LAYER_COLORS)] for index in range(len(LAYER_ORDER))],
        node_size=[1600 + graph_summary(graph)["nodesByLayer"][layer] * 35 for layer in LAYER_ORDER],
        edgecolors="#2b2b2b",
        linewidths=0.8,
        ax=axis,
    )
    for edge_type, color in EDGE_COLORS.items():
        edges = [(source, target, key) for source, target, key, data in overview.edges(keys=True, data=True) if data["type"] == edge_type]
        widths = [0.5 + overview.edges[edge]["count"] / 7 for edge in edges]
        nx.draw_networkx_edges(overview, positions, edgelist=edges, edge_color=color, width=widths, alpha=0.45, arrowsize=12, connectionstyle="arc3,rad=0.12", ax=axis)
    nx.draw_networkx_labels(overview, positions, font_size=9, font_family="Microsoft YaHei", ax=axis)
    axis.set_title("阿斯特拉恩：十二层关系聚合图\n线宽表示持久化关系数量", fontsize=20, pad=18)
    axis.axis("off")
    figure.savefig(output / "world-graph-layers.svg", format="svg", facecolor=figure.get_facecolor())
    figure.savefig(output / "world-graph-layers.png", dpi=180, facecolor=figure.get_facecolor())
    plt.close(figure)


def main() -> None:
    args = parse_args()
    graph, nodes, relations = load_graph(args.index.resolve())
    args.output.mkdir(parents=True, exist_ok=True)
    summary = graph_summary(graph)
    (args.output / "graph.json").write_text(json.dumps({"nodes": nodes, "relations": relations}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (args.output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    nx.write_graphml(graph, args.output / "world-graph.graphml")
    render_full_graph(graph, args.output)
    render_layer_overview(graph, args.output)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
