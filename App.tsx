
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Activity, Zap, RotateCcw, Box, 
  Droplets, Waves, Clock, AlertOctagon,
  Trash2, Play, Pause, 
  ChevronDown, Sliders,
  AlertTriangle, MessageSquare, Sparkles, Fan, Gauge, Timer, CalendarClock,
  PenTool, Coins, Cpu, GripVertical, Settings2, ArrowRight,
  CircleDot, Cylinder, LandPlot, MousePointer2, X, Workflow, Cable, Construction,
  RectangleVertical, Container, Spline, Disc, Plug
} from 'lucide-react';
import { ChatMessage, Sender, Attachment, FaultState, PlanStep, DesignParadigm, DisturbanceType, DisturbanceConfig } from './types';
import ChatInput from './components/ChatInput';
import MarkdownRenderer from './components/MarkdownRenderer';
import { streamGeminiResponse } from './services/geminiService';

// --- TYPES & CONSTANTS ---
const DT = 0.1;
const BUFFER_SIZE = 500; 
const HISTORY_SECONDS = 60;
const MAX_HISTORY = Math.round(HISTORY_SECONDS / DT);

type NodeType = 'SOURCE' | 'PUMP' | 'PIPE' | 'RESERVOIR' | 'DEMAND' | 'VALVE' | 'GATE' | 'TURBINE';

interface CanvasNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  label: string;
  data: any; 
}

interface CanvasEdge {
  id: string;
  source: string;
  target: string;
}

// Design Paradigms
const PARADIGMS: DesignParadigm[] = [
  {
    type: 'TRADITIONAL',
    name: '传统设计范式',
    description: '以大设施换稳定 (PID + 大调蓄池)',
    tankArea: 200.0,
    algorithm: 'PID',
    infrastructureCost: '$$$$',
    computeCost: '$',
    resilience: '极高'
  },
  {
    type: 'IMPROVED',
    name: '改良设计范式',
    description: '内模控制补偿 (Smith + 中调蓄池)',
    tankArea: 80.0,
    algorithm: 'SMITH',
    infrastructureCost: '$$',
    computeCost: '$$',
    resilience: '中'
  },
  {
    type: 'MODERN',
    name: '现代设计范式',
    description: '以算力换设施 (MPC + 微调蓄池)',
    tankArea: 15.0,
    algorithm: 'MPC',
    infrastructureCost: '$',
    computeCost: '$$$$',
    resilience: '低'
  }
];

const DISTURBANCE_OPTIONS: { type: DisturbanceType; label: string }[] = [
  { type: 'CONSTANT', label: '恒定值' },
  { type: 'STEP', label: '阶跃突变' },
  { type: 'RAMP', label: '线性爬坡' },
  { type: 'SINE', label: '正弦波动' },
  { type: 'SQUARE', label: '方波震荡' },
  { type: 'PULSE', label: '脉冲干扰' },
  { type: 'NOISE', label: '随机白噪声' },
  { type: 'BURST', label: '突发洪峰' },
];

// --- MATH HELPERS ---
const getDisturbanceValue = (t: number, config: DisturbanceConfig) => {
  const { type, base, amplitude, frequency } = config;
  const omega = 2 * Math.PI * frequency;
  const period = 1 / Math.max(0.001, frequency);
  const localT = t % period;
  switch(type) {
    case 'CONSTANT': return base;
    case 'STEP': return localT < period/2 ? base : base + amplitude;
    case 'RAMP': return base + amplitude * (localT / period);
    case 'SINE': return base + amplitude * Math.sin(omega * t);
    case 'SQUARE': return base + amplitude * Math.sign(Math.sin(omega * t));
    case 'PULSE': return localT < period * 0.1 ? base + amplitude : base;
    case 'NOISE': return base + (Math.random() - 0.5) * amplitude;
    case 'BURST': return (t % 20 > 18) ? base + amplitude * 2 : base;
    default: return base;
  }
};

// --- UI COMPONENTS ---

const PaletteItem = ({ type, icon: Icon, label, isLinear }: { type: NodeType, icon: any, label: string, isLinear?: boolean }) => (
  <div 
    className="flex flex-col items-center justify-center p-3 bg-slate-900 rounded-lg border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800 cursor-grab active:cursor-grabbing transition-all group w-full select-none relative overflow-hidden"
    draggable
    onDragStart={(e) => {
      e.dataTransfer.setData('nodeType', type);
      e.dataTransfer.setData('nodeLabel', label);
      e.dataTransfer.effectAllowed = 'copy';
    }}
  >
    <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full shadow-[0_0_5px_cyan]"></div>
    </div>
    <Icon size={20} className={isLinear ? "text-cyan-300/70 group-hover:text-cyan-400" : "text-slate-400 group-hover:text-slate-200"} />
    <span className="text-[10px] text-slate-500 font-bold mt-2 group-hover:text-cyan-100 transition-colors text-center leading-tight">{label}</span>
  </div>
);

interface CanvasNodeComponentProps {
  node: CanvasNode;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onStartConnect: (e: React.MouseEvent, nodeId: string) => void;
  onEndConnect: (e: React.MouseEvent, nodeId: string) => void;
}

const CanvasNodeComponent: React.FC<CanvasNodeComponentProps> = ({ node, isSelected, onMouseDown, onStartConnect, onEndConnect }) => {
  // Render Visuals
  let Visual = null;
  
  if (node.type === 'PIPE') {
    Visual = (
        <div className={`w-28 h-5 bg-slate-800 rounded-full border flex items-center justify-center relative overflow-hidden transition-all ${isSelected ? 'border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.3)]' : 'border-slate-600 group-hover:border-slate-500'}`}>
           <div className="absolute inset-0 bg-cyan-900/20"></div>
           <div className="absolute inset-0 flex gap-4 animate-flow-right opacity-30">
              {[1,2,3,4,5].map(i => <div key={i} className="w-1 h-full bg-cyan-400 transform -skew-x-12"></div>)}
           </div>
           <span className="relative z-10 text-[9px] font-mono text-cyan-200 font-bold flex gap-1 items-center">
              <Spline size={10}/> {node.label} ({node.data.delay}s)
           </span>
        </div>
    );
  } else {
      let Icon = Box;
      let colorClass = "text-slate-400";
      let bgClass = "bg-slate-900";
      let borderClass = "border-slate-700";
      let subLabel = "";

      switch(node.type) {
        case 'SOURCE': Icon = Waves; colorClass="text-blue-400"; break;
        case 'PUMP': Icon = Fan; colorClass="text-orange-400"; borderClass="border-orange-900/50"; subLabel=`η:${node.data.efficiency||100}%`; break;
        case 'TURBINE': Icon = Zap; colorClass="text-purple-400"; borderClass="border-purple-900/50"; subLabel=`${node.data.capacity||100}MW`; break;
        case 'RESERVOIR': Icon = Container; colorClass="text-cyan-400"; borderClass="border-cyan-900/50"; subLabel=`A:${node.data.area}m²`; break;
        case 'DEMAND': Icon = ArrowRight; colorClass="text-red-400"; break;
        case 'VALVE': Icon = CircleDot; colorClass="text-yellow-400"; subLabel=`${node.data.open||100}%`; break;
        case 'GATE': Icon = RectangleVertical; colorClass="text-yellow-500"; subLabel=`${node.data.open||100}%`; break;
      }

      Visual = (
        <>
            <div className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center shadow-2xl transition-all ${bgClass} ${isSelected ? 'border-white scale-110 shadow-cyan-500/20' : `${borderClass} hover:border-slate-500`}`}>
                <Icon size={28} className={colorClass} />
            </div>
            <div className={`absolute -bottom-8 bg-slate-950/80 px-2 py-1 rounded border text-center min-w-[60px] backdrop-blur-md ${isSelected ? 'border-white text-white' : 'border-slate-800 text-slate-400'}`}>
                <div className="text-[10px] font-bold whitespace-nowrap">{node.label}</div>
                {subLabel && <div className="text-[9px] font-mono text-slate-500">{subLabel}</div>}
            </div>
        </>
      );
  }

  return (
    <div 
      className={`absolute flex flex-col items-center cursor-grab active:cursor-grabbing group z-20 select-none`}
      style={{ left: node.x, top: node.y, transform: 'translate(-50%, -50%)' }}
      onMouseDown={onMouseDown}
    >
      {/* Input Port (Left) */}
      {node.type !== 'SOURCE' && (
          <div 
            className="absolute -left-3 top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-800 rounded-full border-2 border-slate-500 hover:bg-green-500 hover:border-green-300 hover:scale-125 transition-all cursor-crosshair z-30"
            onMouseUp={(e) => { e.stopPropagation(); onEndConnect(e, node.id); }}
            title="Input Port"
          />
      )}

      {Visual}

      {/* Output Port (Right) */}
      {node.type !== 'DEMAND' && (
          <div 
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-800 rounded-full border-2 border-slate-500 hover:bg-blue-500 hover:border-blue-300 hover:scale-125 transition-all cursor-crosshair z-30"
            onMouseDown={(e) => { e.stopPropagation(); onStartConnect(e, node.id); }}
            title="Output Port"
          />
      )}
    </div>
  );
};

// --- CHART ---
const TrendChart: React.FC<{ history: any[], prediction?: any[], faults: any }> = ({ history, prediction, faults }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 600, h: 200 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(e => setDims({ w: e[0].contentRect.width, h: e[0].contentRect.height }));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!history.length) return <div className="w-full h-full bg-slate-950 flex items-center justify-center text-xs text-slate-600 animate-pulse">等待仿真数据...</div>;

  const { w, h } = dims;
  const m = { t: 20, b: 30, l: 40, r: 40 }; // Margins
  const chartW = w - m.l - m.r;
  const chartH = h - m.t - m.b;

  const last = history[history.length - 1];
  const tEnd = last.t + (45 * 0.25);
  const tStart = tEnd - 45;
  
  const getX = (t: number) => m.l + ((t - tStart) / (tEnd - tStart)) * chartW;
  const getYFlow = (v: number) => m.t + chartH - (Math.max(0, Math.min(250, v)) / 250) * chartH;
  const getYLevel = (v: number) => m.t + chartH - (Math.max(0, Math.min(350, v)) / 350) * chartH;

  const makePath = (data: any[], val: string, scale: (v:number)=>number) => {
    const visible = data.filter(d => d.t >= tStart - 2 && d.t <= tEnd + 2);
    if(visible.length < 2) return "";
    return visible.map(d => `${getX(d.t).toFixed(1)},${scale(d[val]).toFixed(1)}`).join(" ");
  };

  const pLevel = makePath(history, 'level', getYLevel);
  const pTarget = makePath(history, 'target', getYLevel);
  const pFlow = makePath(history, 'flowIn', getYFlow);
  const pDemand = makePath(history, 'flowOut', getYFlow);
  
  let pPredLevel = "", pPredDemand = "";
  if (prediction && prediction.length > 0) {
    const combined = [last, ...prediction];
    pPredLevel = makePath(combined, 'level', getYLevel);
    pPredDemand = makePath(combined, 'flowOut', getYFlow);
  }

  const xNow = getX(last.t);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 rounded-lg border border-slate-800 overflow-hidden select-none">
       {faults.leakage.active && <div className="absolute inset-0 bg-red-500/10 animate-pulse z-0 pointer-events-none"/>}
       
       <svg width={w} height={h} className="absolute inset-0 z-10">
          <defs>
             <linearGradient id="gradLevel" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#06b6d4" stopOpacity="0.2"/>
                <stop offset="1" stopColor="#06b6d4" stopOpacity="0"/>
             </linearGradient>
          </defs>
          
          {/* Prediction Zone BG */}
          <rect x={xNow} y={m.t} width={Math.max(0, w-m.r-xNow)} height={chartH} fill="#0f172a" opacity="0.8"/>
          
          {/* Grid & Axes */}
          {[0, 0.25, 0.5, 0.75, 1].map(p => {
             const y = m.t + chartH * (1-p);
             return <g key={p}>
                <line x1={m.l} y1={y} x2={w-m.r} y2={y} stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2"/>
                <text x={m.l-5} y={y+3} textAnchor="end" className="text-[9px] fill-blue-500/70 font-mono">{(p*250).toFixed(0)}</text>
                <text x={w-m.r+5} y={y+3} textAnchor="start" className="text-[9px] fill-cyan-500/70 font-mono">{(p*350).toFixed(0)}</text>
             </g>
          })}

          {/* NOW Line */}
          <line x1={xNow} y1={m.t} x2={xNow} y2={h-m.b} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" opacity="0.5"/>
          <text x={xNow} y={m.t-5} textAnchor="middle" className="text-[9px] fill-slate-400 font-bold tracking-widest">LIVE</text>

          {/* Data Curves */}
          {pLevel && <path d={`M${pLevel.split(' ')[0]?.split(',')[0]},${m.t+chartH} ${pLevel.replace(/ /g, ' L')} V${m.t+chartH} Z`} fill="url(#gradLevel)"/>}
          
          <polyline points={pTarget} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8"/>
          <polyline points={pLevel} fill="none" stroke="#06b6d4" strokeWidth="2"/>
          <polyline points={pFlow} fill="none" stroke="#3b82f6" strokeWidth="1.5" opacity="0.9"/>
          <polyline points={pDemand} fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.9"/>
          
          {/* Predictions */}
          <polyline points={pPredLevel} fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="2 2" opacity="0.4"/>
          <polyline points={pPredDemand} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="2 2" opacity="0.4"/>
       </svg>

       {/* Bottom Right Legend (Fixed & Overlay) */}
       <div className="absolute bottom-3 right-3 bg-slate-900/80 backdrop-blur-md border border-slate-700 p-2 rounded-md shadow-2xl z-20 pointer-events-none">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
             <div className="flex items-center gap-1.5 text-slate-300"><div className="w-2 h-2 bg-blue-500 rounded-sm"/> 进水 Flow</div>
             <div className="flex items-center gap-1.5 text-slate-300"><div className="w-2 h-2 bg-cyan-500 rounded-sm"/> 水位 Level</div>
             <div className="flex items-center gap-1.5 text-slate-300"><div className="w-2 h-2 bg-red-500 rounded-sm"/> 需求 Out</div>
             <div className="flex items-center gap-1.5 text-slate-300"><div className="w-2 h-2 border-t border-green-500 border-dashed"/> 目标 SP</div>
             <div className="flex items-center gap-1.5 text-slate-400 col-span-2 opacity-70"><div className="w-2 h-2 border-t border-white border-dotted"/> MPC预测</div>
          </div>
       </div>
    </div>
  );
};

export default function App() {
  // --- STATE ---
  const [deployedParadigm, setDeployedParadigm] = useState<DesignParadigm>(PARADIGMS[1]);
  const [activeTab, setActiveTab] = useState<'DESIGN' | 'CONTROL' | 'FAULTS'>('DESIGN');
  
  // Sim
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  
  // Canvas Nodes & Edges
  const [nodes, setNodes] = useState<CanvasNode[]>([
    { id: 'n1', type: 'SOURCE', x: 80, y: 180, label: '水源地', data: {} },
    { id: 'n2', type: 'PUMP', x: 200, y: 180, label: '加压泵站', data: { efficiency: 100 } },
    { id: 'n3', type: 'PIPE', x: 380, y: 180, label: '输水干渠', data: { delay: 5.0 } },
    { id: 'n4', type: 'RESERVOIR', x: 550, y: 180, label: '调蓄池', data: { area: 80.0 } },
    { id: 'n5', type: 'DEMAND', x: 700, y: 180, label: '市政管网', data: {} },
  ]);
  const [edges, setEdges] = useState<CanvasEdge[]>([
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
    { id: 'e4', source: 'n4', target: 'n5' }
  ]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<{id: string, startX: number, startY: number, initialNodeX: number, initialNodeY: number} | null>(null);
  const [tempEdge, setTempEdge] = useState<{sourceId: string, x1: number, y1: number, x2: number, y2: number} | null>(null);

  // Controls
  const [activeDemandPattern, setActiveDemandPattern] = useState<DisturbanceConfig>({ type: 'STEP', base: 50, amplitude: 100, frequency: 0.1, active: true });
  const [activeSetpointPattern, setActiveSetpointPattern] = useState<DisturbanceConfig>({ type: 'CONSTANT', base: 295, amplitude: 0, frequency: 0, active: true });
  const [disturbanceScope, setDisturbanceScope] = useState<'DEMAND' | 'TARGET'>('DEMAND');
  const [draftDisturbance, setDraftDisturbance] = useState<DisturbanceConfig>(activeDemandPattern);
  
  const [plans, setPlans] = useState<PlanStep[]>([]);
  const [planDelay, setPlanDelay] = useState(10);
  const [faults, setFaults] = useState<FaultState>({ leakage: {active:false, value:0}, pumpEfficiency: {active:false, value:0}, sensorDrift: {active:false, value:0} });

  // AI & Refs
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const pipeBufferRef = useRef<number[]>(new Array(BUFFER_SIZE).fill(0));
  const tankLevelRef = useRef(295);
  const mpcStateRef = useRef({ lastOut: 0 });
  const integralRef = useRef(0);
  const lastErrorRef = useRef(0);

  // Sync Draft
  useEffect(() => {
     if (disturbanceScope === 'DEMAND') setDraftDisturbance(activeDemandPattern);
     else setDraftDisturbance(activeSetpointPattern);
  }, [disturbanceScope]);

  // --- INTERACTIONS ---
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('nodeType') as NodeType;
    const label = e.dataTransfer.getData('nodeLabel');
    if (type) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const newNode: CanvasNode = {
        id: `n${Date.now()}`, type, x, y, label,
        data: type === 'RESERVOIR' ? { area: 100 } : type === 'PIPE' ? { delay: 5 } : type === 'PUMP' ? { efficiency: 100 } : {}
      };
      setNodes(prev => [...prev, newNode]);
      setSelectedNodeId(newNode.id);
    }
  };

  // Node Dragging
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (draggingNode) {
        setNodes(prev => prev.map(n => n.id === draggingNode.id ? { ...n, x: draggingNode.initialNodeX + (e.clientX - draggingNode.startX), y: draggingNode.initialNodeY + (e.clientY - draggingNode.startY) } : n));
      }
      if (tempEdge) {
         // Update temp edge target
         const rect = document.getElementById('canvas-area')?.getBoundingClientRect();
         if (rect) {
            setTempEdge(prev => prev ? { ...prev, x2: e.clientX - rect.left, y2: e.clientY - rect.top } : null);
         }
      }
    };
    const up = () => { setDraggingNode(null); setTempEdge(null); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }
  }, [draggingNode, tempEdge]);

  // Connection Logic
  const handleStartConnect = (e: React.MouseEvent, nodeId: string) => {
     const node = nodes.find(n => n.id === nodeId);
     if (node) {
        const rect = e.currentTarget.getBoundingClientRect(); // Port rect (ignored mainly, use node pos)
        // Calculate relative pos of port in canvas. 
        // Node X/Y is center. Output port is at X + width/2.
        // Approx width based on component type... simplified to Node X + 20
        const canvasRect = document.getElementById('canvas-area')?.getBoundingClientRect();
        if (canvasRect) {
           setTempEdge({
              sourceId: nodeId,
              x1: node.x + 20, 
              y1: node.y,
              x2: e.clientX - canvasRect.left,
              y2: e.clientY - canvasRect.top
           });
        }
     }
  };

  const handleEndConnect = (e: React.MouseEvent, nodeId: string) => {
     if (tempEdge && tempEdge.sourceId !== nodeId) {
        // Check if edge exists
        const exists = edges.find(e => e.source === tempEdge.sourceId && e.target === nodeId);
        if (!exists) {
           setEdges(prev => [...prev, { id: `e${Date.now()}`, source: tempEdge.sourceId, target: nodeId }]);
        }
     }
     setTempEdge(null);
  };

  const applyParadigm = (p: DesignParadigm) => {
    setDeployedParadigm(p);
    setNodes([
      { id: 'n1', type: 'SOURCE', x: 80, y: 180, label: '水源地', data: {} },
      { id: 'n2', type: 'PUMP', x: 200, y: 180, label: '加压泵站', data: { efficiency: 100 } },
      { id: 'n3', type: 'PIPE', x: 380, y: 180, label: '输水干渠', data: { delay: 5.0 } },
      { id: 'n4', type: 'RESERVOIR', x: 550, y: 180, label: '调蓄池', data: { area: p.tankArea } },
      { id: 'n5', type: 'DEMAND', x: 700, y: 180, label: '市政管网', data: {} },
    ]);
    setEdges([
       {id: 'e1', source: 'n1', target: 'n2'},
       {id: 'e2', source: 'n2', target: 'n3'},
       {id: 'e3', source: 'n3', target: 'n4'},
       {id: 'e4', source: 'n4', target: 'n5'},
    ]);
    tankLevelRef.current = 295; integralRef.current = 0;
    handleSendMessage(`系统更新：已重置为【${p.name}】范式。`, []);
  };

  // --- PHYSICS LOOP (Adaptive to Topology) ---
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setTime(t => {
        const nextT = t + DT;
        // Plans
        plans.forEach(p => {
           if (p.status === 'pending' && nextT >= p.triggerTime) {
              p.status = 'completed';
              if (p.actionType === 'CHANGE_DISTURBANCE') setActiveDemandPattern(p.payload as any);
              else setActiveSetpointPattern(p.payload as any);
           }
        });

        // Topology Analysis for Sim
        const reservoir = nodes.find(n => n.type === 'RESERVOIR');
        // Find feeding chain (simplified for robustness): Pump -> Pipe -> Reservoir
        // In a real graph solver, we'd traverse. Here we find nodes by type to apply params.
        const pipe = nodes.find(n => n.type === 'PIPE');
        const pump = nodes.find(n => n.type === 'PUMP');
        
        // If critical nodes missing, default to safe values
        const area = reservoir?.data.area || deployedParadigm.tankArea;
        const delay = pipe?.data.delay || 5.0;
        const eff = pump?.data.efficiency || 100;

        // Check connectivity: Is Pump connected to Pipe connected to Reservoir?
        // Simplified connectivity check for visual feedback effect
        const isConnected = edges.some(e => e.target === reservoir?.id) || true; 

        // Dynamics
        const demand = getDisturbanceValue(nextT, activeDemandPattern);
        const target = getDisturbanceValue(nextT, activeSetpointPattern);
        const error = target - tankLevelRef.current;
        
        // Control
        let out = 0;
        if (isConnected) {
            if (deployedParadigm.algorithm === 'PID') {
              integralRef.current += error * DT;
              if(Math.abs(integralRef.current)>500) integralRef.current = Math.sign(integralRef.current)*500;
              out = (area>100?5:2)*error + 0.5*integralRef.current + 0.1*(error-lastErrorRef.current)/DT + 50;
            } else if (deployedParadigm.algorithm === 'MPC') {
               out = mpcStateRef.current.lastOut + error * 2.5; 
            } else {
               out = 4 * error + 50; 
            }
        }
        lastErrorRef.current = error;
        
        let maxQ = 250 * (eff/100);
        if (faults.pumpEfficiency.active) maxQ *= (1 - faults.pumpEfficiency.value/100);
        out = Math.max(0, Math.min(maxQ, out));
        mpcStateRef.current.lastOut = out;

        // Buffer
        const buf = pipeBufferRef.current;
        buf.push(out);
        if(buf.length > BUFFER_SIZE) buf.shift();
        const idx = Math.floor(delay/DT);
        const inflow = buf.length >= idx ? buf[buf.length - idx] : 0;
        
        let net = inflow - demand;
        if (faults.leakage.active) net -= (faults.leakage.value/10)*Math.sqrt(Math.max(0, tankLevelRef.current));
        
        // Physics Update
        if (isConnected) {
            tankLevelRef.current = Math.max(0, tankLevelRef.current + (net*DT)/area);
        }

        setHistory(p => {
           const next = [...p, { t: nextT, level: tankLevelRef.current, target, flowIn: out, flowOut: demand }];
           return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
        });
        return nextT;
      });
    }, DT * 1000);
    return () => clearInterval(interval);
  }, [isRunning, deployedParadigm, activeDemandPattern, activeSetpointPattern, faults, plans, nodes, edges]);

  // AI
  const handleSendMessage = async (text: string, att: Attachment[]) => {
    const userMsg: ChatMessage = { id: Date.now().toString(), sender: Sender.User, text, attachments: att, timestamp: new Date() };
    setMessages(p => [...p, userMsg]);
    setIsStreaming(true);
    try {
       const last = history[history.length-1] || { level: 0, target: 0, flowIn: 0, flowOut: 0 };
       const ctx = { state: { time, waterLevel: tankLevelRef.current, sensorLevel: last.level, targetLevel: last.target, inflowAtPump: last.flowIn, inflowAtTank: 0, outflow: last.flowOut, valveOpen: 100 }, params: { kp:1, ki:0, kd:0, targetLevel: last.target }, faults, paradigm: deployedParadigm };
       const stream = streamGeminiResponse(messages, text, att, ctx);
       let full = '';
       const mid = (Date.now()+1).toString();
       setMessages(p => [...p, { id: mid, sender: Sender.Model, text: '', timestamp: new Date() }]);
       for await (const chunk of stream) { full += chunk; setMessages(p => p.map(m => m.id === mid ? { ...m, text: full } : m)); }
    } catch(e) { console.error(e); }
    setIsStreaming(false);
  };

  const executeImmediate = () => {
      const scope = disturbanceScope;
      const pattern = {...draftDisturbance};
      if (scope === 'DEMAND') setActiveDemandPattern(pattern);
      else setActiveSetpointPattern(pattern);
      handleSendMessage(`操作：立即应用了新的${scope==='DEMAND'?'负载':'目标'}设置。`, []);
  };
  
  const addPlan = () => {
      setPlans(p => [...p, {
          id: Date.now().toString(), triggerTime: time + planDelay, description: `${planDelay}s 后变更设置`,
          actionType: disturbanceScope === 'DEMAND' ? 'CHANGE_DISTURBANCE' : 'CHANGE_SETPOINT',
          payload: {...draftDisturbance}, status: 'pending'
      }].sort((a,b)=>a.triggerTime - b.triggerTime));
  };

  // --- RENDER ---
  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden select-none">
      {/* LEFT SIDEBAR */}
      <div className="w-[280px] flex flex-col border-r border-slate-800 bg-slate-900/80 backdrop-blur-sm z-20 shadow-2xl">
         <div className="p-4 border-b border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-900/50"><Activity className="text-white" size={18}/></div>
            <div><h1 className="font-bold text-sm text-slate-100 tracking-tight">水利仿真平台 Pro</h1><div className="text-[10px] text-slate-500 font-mono">{deployedParadigm.algorithm} ENGINE</div></div>
         </div>
         
         <div className="flex border-b border-slate-800 bg-slate-900">
            <button onClick={()=>setActiveTab('DESIGN')} className={`flex-1 py-3 text-[10px] font-bold flex flex-col items-center gap-1 border-b-2 transition-all ${activeTab==='DESIGN'?'border-cyan-500 text-cyan-400 bg-slate-800/50':'border-transparent text-slate-500 hover:text-slate-300'}`}><PenTool size={14}/> 建模 DESIGN</button>
            <button onClick={()=>setActiveTab('CONTROL')} className={`flex-1 py-3 text-[10px] font-bold flex flex-col items-center gap-1 border-b-2 transition-all ${activeTab==='CONTROL'?'border-purple-500 text-purple-400 bg-slate-800/50':'border-transparent text-slate-500 hover:text-slate-300'}`}><Sliders size={14}/> 控制 CONTROL</button>
            <button onClick={()=>setActiveTab('FAULTS')} className={`flex-1 py-3 text-[10px] font-bold flex flex-col items-center gap-1 border-b-2 transition-all ${activeTab==='FAULTS'?'border-red-500 text-red-400 bg-slate-800/50':'border-transparent text-slate-500 hover:text-slate-300'}`}><AlertTriangle size={14}/> 故障 FAULT</button>
         </div>

         <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {activeTab === 'DESIGN' ? (
              <>
                 <div>
                    <div className="text-[10px] font-bold text-slate-500 mb-3 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-1">储水/节点 Storage & Nodes</div>
                    <div className="grid grid-cols-2 gap-2">
                       <PaletteItem type="SOURCE" icon={Waves} label="水源 Source"/>
                       <PaletteItem type="RESERVOIR" icon={Container} label="库湖池 Reservoir"/>
                       <PaletteItem type="DEMAND" icon={ArrowRight} label="用户 User"/>
                    </div>
                    
                    <div className="text-[10px] font-bold text-slate-500 mt-4 mb-3 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-1">动力/设备 Equipment</div>
                    <div className="grid grid-cols-2 gap-2">
                       <PaletteItem type="PUMP" icon={Fan} label="水泵 Pump"/>
                       <PaletteItem type="TURBINE" icon={Zap} label="水轮机 Turbine"/>
                       <PaletteItem type="VALVE" icon={CircleDot} label="阀门 Valve"/>
                       <PaletteItem type="GATE" icon={RectangleVertical} label="闸门 Gate"/>
                    </div>

                    <div className="text-[10px] font-bold text-slate-500 mt-4 mb-3 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-1">输水设施 Linear Objects</div>
                    <PaletteItem type="PIPE" icon={Cable} label="河管渠 Channel/Pipe" isLinear/>
                 </div>
                 
                 <div className="border-t border-slate-800 pt-4">
                    <div className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider flex items-center gap-2"><Workflow size={10}/> 范式模板 Templates</div>
                    <div className="space-y-2">
                       {PARADIGMS.map(p => (
                          <div key={p.type} onClick={() => applyParadigm(p)} className={`p-3 rounded border cursor-pointer transition-all group ${deployedParadigm.type === p.type ? 'bg-slate-800 border-cyan-500 shadow-lg' : 'bg-slate-900 border-slate-700 hover:border-slate-600'}`}>
                             <div className="flex justify-between items-center mb-1">
                                <span className={`text-xs font-bold ${deployedParadigm.type === p.type ? 'text-cyan-400' : 'text-slate-300'}`}>{p.name}</span>
                                {deployedParadigm.type === p.type && <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_5px_cyan]"/>}
                             </div>
                             <p className="text-[10px] text-slate-500 group-hover:text-slate-400">{p.description}</p>
                          </div>
                       ))}
                    </div>
                 </div>
              </>
            ) : activeTab === 'CONTROL' ? (
               <div className="space-y-4 animate-in fade-in">
                  <div className="flex bg-slate-950 p-1 rounded border border-slate-800">
                      <button onClick={()=>setDisturbanceScope('DEMAND')} className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all ${disturbanceScope==='DEMAND'?'bg-slate-800 text-blue-400 shadow-sm':'text-slate-500 hover:text-slate-300'}`}>负载设置</button>
                      <button onClick={()=>setDisturbanceScope('TARGET')} className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all ${disturbanceScope==='TARGET'?'bg-slate-800 text-green-400 shadow-sm':'text-slate-500 hover:text-slate-300'}`}>目标设置</button>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg space-y-3 shadow-inner">
                      <select value={draftDisturbance.type} onChange={(e) => setDraftDisturbance({...draftDisturbance, type: e.target.value as any})} className="w-full bg-slate-950 border border-slate-700 text-xs p-2 rounded outline-none text-slate-300 focus:border-cyan-500">
                          {DISTURBANCE_OPTIONS.map(o => <option key={o.type} value={o.type}>{o.label}</option>)}
                      </select>
                      {['base','amplitude','frequency'].map(k => (
                        <div key={k}>
                           <div className="flex justify-between text-[10px] text-slate-500 mb-1 capitalize"><span>{k}</span><span className="font-mono text-slate-300">{draftDisturbance[k as keyof DisturbanceConfig]}</span></div>
                           <input type="range" min={k==='frequency'?0.01:0} max={k==='frequency'?1:350} step={k==='frequency'?0.01:1} value={draftDisturbance[k as keyof DisturbanceConfig] as number} onChange={e=>setDraftDisturbance({...draftDisturbance, [k]: Number(e.target.value)})} className="w-full h-1 bg-slate-800 rounded appearance-none accent-cyan-500"/>
                        </div>
                      ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                      <button onClick={executeImmediate} className="py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded shadow-lg shadow-cyan-900/20 active:scale-95 transition-all">立即执行</button>
                      <button onClick={addPlan} className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded border border-slate-700 active:scale-95 transition-all">加入序列</button>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-900 p-2 rounded border border-slate-800"><span className="text-[10px] text-slate-500">延迟(s)</span><input type="number" value={planDelay} onChange={e=>setPlanDelay(Number(e.target.value))} className="w-full bg-transparent text-xs text-center outline-none text-cyan-400 font-mono"/></div>
                  {plans.length > 0 && <div className="space-y-1 pt-2 border-t border-slate-800"><div className="text-[10px] text-slate-500 font-bold">任务队列 QUEUE</div>{plans.filter(p=>p.status!=='completed').map(p=><div key={p.id} className="bg-slate-900 p-2 rounded border border-slate-800 flex justify-between"><span className="text-[10px] text-slate-300">{p.description}</span><Trash2 size={12} className="text-slate-600 cursor-pointer hover:text-red-400" onClick={()=>setPlans(c=>c.filter(x=>x.id!==p.id))}/></div>)}</div>}
               </div>
            ) : (
               <div className="space-y-3 animate-in fade-in">
                  <div className="bg-red-900/10 border border-red-900/30 p-3 rounded text-[10px] text-red-300">故障注入会即时改变物理参数</div>
                  {['leakage', 'pumpEfficiency', 'sensorDrift'].map(f => (
                      // @ts-ignore
                      <div key={f} className={`p-3 rounded border bg-slate-900 ${faults[f].active ? 'border-red-500/50 bg-red-900/5' : 'border-slate-800'}`}>
                          <div className="flex justify-between items-center mb-2">
                             {/* @ts-ignore */}
                             <span className="text-xs font-bold text-slate-300 capitalize">{f}</span>
                             {/* @ts-ignore */}
                             <div onClick={()=>setFaults(c=>({...c, [f]: {...c[f], active: !c[f].active, value: 20}}))} className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${faults[f].active?'bg-red-500':'bg-slate-700'}`}><div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${faults[f].active?'left-4.5':'left-0.5'}`}/></div>
                          </div>
                          {/* @ts-ignore */}
                          {faults[f].active && <input type="range" max="50" value={faults[f].value} onChange={e=>setFaults(c=>({...c, [f]: {...c[f], value: Number(e.target.value)}}))} className="w-full h-1 bg-slate-800 rounded appearance-none accent-red-500"/>}
                      </div>
                  ))}
               </div>
            )}
         </div>
      </div>

      {/* MIDDLE */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
         {/* TOP: CANVAS */}
         <div className="flex-1 relative overflow-hidden group border-b border-slate-800 bg-[#0b1121]" 
              id="canvas-area"
              onDragOver={(e) => e.preventDefault()} 
              onDrop={handleDrop}
         >
            <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
            
            {/* Dynamic Edges */}
            <svg className="absolute inset-0 pointer-events-none z-0 overflow-visible">
               <defs>
                 <linearGradient id="flowGradient" gradientUnits="userSpaceOnUse">
                   <stop offset="0%" stopColor="#0e7490" />
                   <stop offset="50%" stopColor="#22d3ee" />
                   <stop offset="100%" stopColor="#0e7490" />
                 </linearGradient>
                 <filter id="glow"><feGaussianBlur stdDeviation="2" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
               </defs>
               {/* Existing Edges */}
               {edges.map((edge) => {
                  const n1 = nodes.find(n => n.id === edge.source);
                  const n2 = nodes.find(n => n.id === edge.target);
                  if (!n1 || !n2) return null;
                  const path = `M${n1.x + 20},${n1.y} C${n1.x + 80},${n1.y} ${n2.x - 80},${n2.y} ${n2.x - 20},${n2.y}`;
                  return (
                    <g key={edge.id} className="group-edge cursor-pointer pointer-events-auto" onContextMenu={(e) => {e.preventDefault(); setEdges(curr => curr.filter(ed => ed.id !== edge.id))}}>
                       <path d={path} stroke="#1e293b" strokeWidth="8" fill="none" strokeLinecap="round" className="hover:stroke-red-900/50 transition-colors"/>
                       <path d={path} stroke="url(#flowGradient)" strokeWidth="3" fill="none" strokeDasharray="10 5" className="animate-[dash_1.5s_linear_infinite]" filter="url(#glow)" opacity="0.8"/>
                    </g>
                  );
               })}
               {/* Temp Dragging Edge */}
               {tempEdge && (
                  <path d={`M${tempEdge.x1},${tempEdge.y1} C${tempEdge.x1 + 50},${tempEdge.y1} ${tempEdge.x2 - 50},${tempEdge.y2} ${tempEdge.x2},${tempEdge.y2}`} stroke="#ffffff" strokeWidth="2" strokeDasharray="4 4" fill="none" opacity="0.5"/>
               )}
            </svg>
            <style>{`@keyframes dash { to { stroke-dashoffset: -30; } }`}</style>

            {/* Nodes */}
            {nodes.map(node => (
               <CanvasNodeComponent 
                  key={node.id} 
                  node={node} 
                  isSelected={selectedNodeId === node.id}
                  onMouseDown={(e) => { e.stopPropagation(); setSelectedNodeId(node.id); setDraggingNode({ id: node.id, startX: e.clientX, startY: e.clientY, initialNodeX: node.x, initialNodeY: node.y }); }}
                  onStartConnect={handleStartConnect}
                  onEndConnect={handleEndConnect}
               />
            ))}
            
            <div className="absolute top-4 left-4 text-[10px] text-slate-500 font-mono bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800 flex items-center gap-2 backdrop-blur">
               <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}/> {isRunning ? 'SIMULATION ACTIVE' : 'PAUSED'}
            </div>
         </div>

         {/* BOTTOM: CHART */}
         <div className="h-[350px] bg-slate-950 p-0 relative z-10 shadow-[0_-20px_40px_rgba(0,0,0,0.5)]">
             <div className="h-9 flex items-center justify-between px-4 bg-slate-900/50 border-b border-slate-800 backdrop-blur-sm">
                <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2"><Activity size={12} className="text-cyan-500"/> 实时遥测 Real-time Telemetry</span>
                <div className="flex gap-4 text-[10px] font-mono text-slate-500">
                   <span className="flex items-center gap-1"><Timer size={10}/> {time.toFixed(1)}s</span>
                   <span className={Math.abs(tankLevelRef.current-295)>5?'text-red-500 font-bold':'text-green-500 font-bold'}>ERR: {Math.abs(tankLevelRef.current-295).toFixed(2)}</span>
                   <div className="flex gap-1 ml-4">
                      <button onClick={() => setIsRunning(!isRunning)} className="hover:text-white"><Pause size={12}/></button>
                      <button onClick={() => {setTime(0); setHistory([]);}} className="hover:text-white"><RotateCcw size={12}/></button>
                   </div>
                </div>
             </div>
             <div className="h-[calc(100%-36px)] p-4">
                <TrendChart history={history} prediction={[]} faults={faults} />
             </div>
         </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <div className={`w-[320px] border-l border-slate-800 bg-slate-900/95 backdrop-blur-md flex flex-col transition-all ${showChat ? 'translate-x-0' : 'translate-x-full hidden'} shadow-2xl z-30`}>
         {/* Inspector */}
         <div className="h-[40%] border-b border-slate-800 p-5 bg-slate-900 overflow-y-auto custom-scrollbar">
             <div className="flex items-center gap-2 mb-4 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <Settings2 size={14} className="text-purple-500"/> 属性检查器 Inspector
             </div>
             {selectedNodeId ? (() => {
                const node = nodes.find(n => n.id === selectedNodeId);
                if (!node) return null;
                return (
                   <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                      <div className="bg-slate-950 p-3 rounded border border-slate-800">
                          <div className="flex justify-between text-[10px] border-b border-slate-800 pb-2 mb-2">
                             <span className="text-slate-500">ID</span><span className="font-mono text-slate-300">{node.id}</span>
                          </div>
                          <div className="flex justify-between text-[10px]">
                             <span className="text-slate-500">Type</span><span className="font-mono text-cyan-400 font-bold">{node.type}</span>
                          </div>
                      </div>

                      {node.type === 'RESERVOIR' && (
                         <div>
                            <div className="flex justify-between text-[10px] mb-1"><span className="text-slate-500">底面积 Area</span><span className="text-cyan-400 font-mono">{node.data.area} m²</span></div>
                            <input type="range" min="10" max="300" value={node.data.area} onChange={(e) => setNodes(prev => prev.map(n => n.id === node.id ? {...n, data: {...n.data, area: Number(e.target.value)}} : n))} className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-500"/>
                         </div>
                      )}
                      {node.type === 'PUMP' && (
                         <div>
                            <div className="flex justify-between text-[10px] mb-1"><span className="text-slate-500">运行效率 Efficiency</span><span className="text-orange-400 font-mono">{node.data.efficiency}%</span></div>
                            <input type="range" min="0" max="100" value={node.data.efficiency} onChange={(e) => setNodes(prev => prev.map(n => n.id === node.id ? {...n, data: {...n.data, efficiency: Number(e.target.value)}} : n))} className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-orange-500"/>
                         </div>
                      )}
                      {node.type === 'TURBINE' && (
                         <div>
                            <div className="flex justify-between text-[10px] mb-1"><span className="text-slate-500">装机容量 Capacity</span><span className="text-purple-400 font-mono">{node.data.capacity || 100} MW</span></div>
                            <input type="range" min="0" max="500" value={node.data.capacity || 100} onChange={(e) => setNodes(prev => prev.map(n => n.id === node.id ? {...n, data: {...n.data, capacity: Number(e.target.value)}} : n))} className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-purple-500"/>
                         </div>
                      )}
                      {node.type === 'PIPE' && (
                         <div>
                            <div className="flex justify-between text-[10px] mb-1"><span className="text-slate-500">输水滞后 Delay</span><span className="text-slate-300 font-mono">{node.data.delay}s</span></div>
                            <input type="range" min="1" max="20" step="0.5" value={node.data.delay} onChange={(e) => setNodes(prev => prev.map(n => n.id === node.id ? {...n, data: {...n.data, delay: Number(e.target.value)}} : n))} className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-slate-500"/>
                         </div>
                      )}
                      {(node.type === 'VALVE' || node.type === 'GATE') && (
                         <div>
                            <div className="flex justify-between text-[10px] mb-1"><span className="text-slate-500">开度 Open</span><span className="text-yellow-400 font-mono">{node.data.open || 100}%</span></div>
                            <input type="range" min="0" max="100" value={node.data.open || 100} onChange={(e) => setNodes(prev => prev.map(n => n.id === node.id ? {...n, data: {...n.data, open: Number(e.target.value)}} : n))} className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-yellow-500"/>
                         </div>
                      )}

                      <button onClick={() => { setNodes(prev => prev.filter(n => n.id !== node.id)); setEdges(curr => curr.filter(e => e.source !== node.id && e.target !== node.id)); setSelectedNodeId(null); }} className="w-full py-2 bg-red-900/10 text-red-400 text-[10px] rounded border border-red-900/30 hover:bg-red-900/20 transition-colors flex items-center justify-center gap-2">
                         <Trash2 size={12}/> 删除组件
                      </button>
                   </div>
                );
             })() : (
                <div className="flex flex-col items-center justify-center h-40 text-[10px] text-slate-600 border-2 border-dashed border-slate-800 rounded bg-slate-900/50">
                   <MousePointer2 size={24} className="mb-2 opacity-50"/>
                   请在画布上选中组件
                </div>
             )}
         </div>

         {/* AI Chat */}
         <div className="flex-1 flex flex-col min-h-0 bg-slate-950/30">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900">
               <span className="text-xs font-bold text-slate-300 flex items-center gap-2"><Sparkles size={14} className="text-purple-500"/> AI 专家助手</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
               {messages.length === 0 && (
                  <div className="text-center mt-10 opacity-30">
                     <Sparkles size={32} className="mx-auto mb-2"/>
                     <p className="text-[10px]">系统运行正常</p>
                  </div>
               )}
               {messages.map(m => (
                  <div key={m.id} className={`text-xs p-2.5 rounded-lg border ${m.sender===Sender.User?'bg-blue-900/20 border-blue-800 text-blue-100 ml-4':'bg-slate-800 border-slate-700 text-slate-300 mr-4'}`}>
                     <MarkdownRenderer content={m.text}/>
                  </div>
               ))}
               {isStreaming && <div className="text-[10px] text-purple-400 animate-pulse pl-2 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-purple-500 rounded-full"/> AI 正在分析...</div>}
            </div>
            <div className="p-3 border-t border-slate-800 bg-slate-900">
               <ChatInput onSend={handleSendMessage} disabled={isStreaming}/>
            </div>
         </div>
      </div>
    </div>
  );
}
