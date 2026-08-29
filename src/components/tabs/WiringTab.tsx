"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type NodeTypes,
} from "@xyflow/react";
import type { ProjectRecord } from "@/lib/design/schema";
import { PartNode } from "@/components/tabs/wiring/PartNode";
import { WiringSidebar } from "@/components/tabs/wiring/WiringSidebar";
import {
  NODE_WIDTH,
  buildWiringGraph,
  estimateNodeHeight,
  type PartNodeType,
} from "@/components/tabs/wiring/layout";

/** Module scope: a fresh object here would remount every node each render. */
const NODE_TYPES: NodeTypes = { part: PartNode };

const CONTROLS_STYLE = {
  ["--xy-controls-button-background-color" as string]: "var(--bg-card)",
  ["--xy-controls-button-background-color-hover" as string]: "var(--bg-raised)",
  ["--xy-controls-button-color" as string]: "var(--text-dim)",
  ["--xy-controls-button-color-hover" as string]: "var(--text)",
  ["--xy-controls-button-border-color" as string]: "var(--border)",
  ["--xy-controls-box-shadow" as string]: "none",
};

export function WiringTab({ record }: { record: ProjectRecord }) {
  return (
    <ReactFlowProvider>
      <WiringCanvas record={record} />
    </ReactFlowProvider>
  );
}

function WiringCanvas({ record }: { record: ProjectRecord }) {
  const graph = useMemo(() => buildWiringGraph(record.pkg), [record.pkg]);

  const [nodes, setNodes, onNodesChange] = useNodesState<PartNodeType>(graph.nodes);
  const [edges, , onEdgesChange] = useEdgesState(graph.edges);
  const { getNode, setCenter } = useReactFlow<PartNodeType>();

  const selectedId = nodes.find((n) => n.selected)?.id ?? null;

  const focusPart = useCallback(
    (id: string) => {
      setNodes((current) => current.map((n) => ({ ...n, selected: n.id === id })));
      const node = getNode(id);
      if (!node) return;
      const width = node.measured?.width ?? NODE_WIDTH;
      const height = node.measured?.height ?? estimateNodeHeight(node.data.pins.length);
      void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: 1.15,
        duration: 450,
      });
    },
    [getNode, setCenter, setNodes],
  );

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="microlabel text-ink-faint">No electrical data</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-52px)] min-h-[560px] w-full">
      <div className="relative min-w-0 flex-1 bg-bg-inset">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          defaultEdgeOptions={{ type: "smoothstep" }}
          colorMode="dark"
          nodesConnectable={false}
          minZoom={0.2}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          proOptions={{ hideAttribution: true }}
          style={{ background: "var(--bg-inset)" }}
        >
          <Background
            id="wiring-major"
            variant={BackgroundVariant.Lines}
            gap={96}
            lineWidth={1}
            color="rgba(61, 219, 180, 0.05)"
          />
          <Background
            id="wiring-minor"
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="rgba(61, 219, 180, 0.13)"
          />
          <Controls showInteractive={false} style={CONTROLS_STYLE} />
        </ReactFlow>
      </div>

      <WiringSidebar groups={graph.groups} selectedId={selectedId} onSelect={focusPart} />
    </div>
  );
}
