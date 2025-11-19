
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Activity, Zap, RotateCcw, Box, 
  Droplets, Waves, Clock, AlertOctagon,
  Trash2, Play, Pause, 
  ChevronDown, Sliders,
  AlertTriangle, MessageSquare, Sparkles, Fan, Gauge, Timer, CalendarClock,
  PenTool, Server, ShieldCheck, Coins, Cpu, Ruler
} from 'lucide-react';
import { ChatMessage, Sender, Attachment, FaultState, PlanStep, DesignParadigm, DisturbanceType, DisturbanceConfig } from './types';
import ChatInput from './components/ChatInput';
import MarkdownRenderer from './components/MarkdownRenderer';
import { streamGeminiResponse } from './services/geminiService';

// --- CONSTANTS ---
const DT = 0.1; // Simulation Tick (s)
const PIPE_DELAY_SECONDS = 5.0; 
const BUFFER_SIZE = Math.round(PIPE_DELAY_SECONDS / DT);
const HISTORY_SECONDS = 60;
const MAX_HISTORY = Math.round(HISTORY_SECONDS / DT);

// --- Design Paradigms ---
const PARADIGMS: DesignParadigm[] = [
  {
    type: 'TRADITIONAL',
    name: '传统设计范式',
    description: '以大设施换稳定',
    tankArea: 200.0, // Huge tank
    algorithm: 'PID',
    infrastructureCost: '$$$$',
    computeCost: '$',
    resilience: '极高 (物理冗余)'
  },
  {
    type: 'IMPROVED',
    name: '改良设计范式',
    description: '内模控制补偿',
    tankArea: 80.0, // Medium tank
    algorithm: 'SMITH',
    infrastructureCost: '$$',
    computeCost: '$$',
    resilience: '中 (算法补偿)'
  },
  {
    type: 'MODERN',
    name: '现代设计范式',
    description: '以算力换设施',
    tankArea: 15.0, // Tiny tank
    algorithm: 'MPC',
    infrastructureCost: '$',
    computeCost: '$$$$',
    resilience: '低 (依赖算力)'
  }
];

const DISTURBANCE_OPTIONS: { type: DisturbanceType; label: string }[] = [
  { type: 'CONSTANT', label: '恒定值 (Constant)' },
  { type: 'STEP', label: '阶跃突变 (Step)' },
  { type: 'RAMP', label: '线性爬坡 (Ramp)' },
  { type: 'SINE', label: '正弦波动 (Sine)' },
  { type: 'SQUARE', label: '方波震荡 (Square)' },
  { type: 'TRIANGLE', label: '三角波 (Triangle)' },
  { type: 'SAWTOOTH', label: '锯齿波 (Sawtooth)' },
  { type: 'PULSE', label: '脉冲干扰 (Pulse)' },
  { type: 'NOISE', label: '随机白噪声 (Noise)' },
  { type: 'RANDOM_WALK', label: '随机游走 (Walk)' },
  { type: 'BURST', label: '突发洪峰 (Burst)' },
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
    case 'TRIANGLE': return base + amplitude * (2 * Math.abs(2 * (localT / period) - 1) - 1);
    case 'SAWTOOTH': return base + amplitude * (2 * (localT / period) - 1);
    case 'PULSE': return localT < period * 0.1 ? base + amplitude : base;
    case 'NOISE': return base + (Math.random() - 0.5) * amplitude;
    case 'RANDOM_WALK': return base + Math.sin(t * 0.1) * amplitude + (Math.random() - 0.5) * 5;
    case 'BURST': return (t % 20 > 18) ? base + amplitude * 2 : base;
    default: return base;
  }
};

// --- COMPONENTS ---

// 1. Disturbance Preview Chart
const DisturbancePreview = ({ config, scope }: { config: DisturbanceConfig, scope: 'DEMAND' | 'TARGET' }) => {
  const width = 240;
  const height = 80;
  const points = [];
  const samples = 100;
  
  // Normalize for visualization
  const maxVal = config.base + Math.abs(config.amplitude) * 1.2;
  const minVal = config.base - Math.abs(config.amplitude) * 1.2;
  const range = Math.max(10, maxVal - minVal);

  for(let i=0; i<samples; i++) {
      const t_local = i * (10/samples); // 10 seconds window
      const val = getDisturbanceValue(t_local, config);
      // Map val to y (inverted because SVG y=0 is top)
      const y = height - ((val - minVal) / range) * height * 0.8 - 10;
      const x = (i / (samples - 1)) * width;
      points.push(`${x},${y}`);
  }

  const color = scope === 'DEMAND' ? '#ef4444' : '#22c55e';

  return (
      <div className="w-full h-[80px] bg-slate-950 rounded border border-slate-700 relative overflow-hidden">
          <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
              <path d={`M0,${height} L${points.join(' ')} L${width},${height} Z`} fill={color} fillOpacity="0.1" />
              <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="#334155" strokeWidth="1" strokeDasharray="2 2"/>
          </svg>
          <div className="absolute top-1 right-2 text-[9px] font-mono bg-slate-900/80 px-1 rounded" style={{color}}>未来10秒预览</div>
      </div>
  );
};

// 2. Trend Chart
interface ChartData {
  t: number;
  level: number;
  target: number;
  flowIn: number;
  flowOut: number;
}

interface TrendChartProps {
  history: ChartData[];
  prediction?: { t: number; level: number, flowOut: number }[];
  faults: FaultState;
}

const TrendChart: React.FC<TrendChartProps> = ({ history, prediction, faults }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 200 });

  useEffect(() => {
    if (containerRef.current) {
      const ro = new ResizeObserver(entries => {
        for (let entry of entries) {
          setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
      });
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    }
  }, []);

  const { width, height } = dimensions;
  const mLeft = 50; 
  const mRight = 50;
  const mTop = 30;
  const mBottom = 30;
  const chartW = width - mLeft - mRight;
  const chartH = height - mTop - mBottom;

  const FLOW_MAX = 250;
  const LEVEL_MAX = 350;

  // Safety check to prevent crash on empty history
  if (!history || history.length === 0) {
    return (
      <div className="w-full h-full bg-slate-950 flex items-center justify-center border border-slate-800 rounded select-none" ref={containerRef}>
         <div className="flex flex-col items-center text-slate-500 gap-2">
            <Activity className="animate-pulse" />
            <span className="text-xs">等待仿真数据初始化...</span>
         </div>
      </div>
    );
  }

  const lastPoint = history[history.length - 1];
  const currentTime = lastPoint.t;
  const VIEW_WINDOW_S = 45;
  const FUTURE_RATIO = 0.25; // 25% of the chart is for future prediction
  const tEnd = currentTime + (VIEW_WINDOW_S * FUTURE_RATIO);
  const tStart = tEnd - VIEW_WINDOW_S;

  const getX = (t: number) => mLeft + ((t - tStart) / (tEnd - tStart)) * chartW;
  const getYFlow = (val: number) => mTop + chartH - (Math.max(0, Math.min(FLOW_MAX, val)) / FLOW_MAX) * chartH;
  const getYLevel = (val: number) => mTop + chartH - (Math.max(0, Math.min(LEVEL_MAX, val)) / LEVEL_MAX) * chartH;

  const makePolylinePoints = (data: any[], valKey: string, yMapper: (v:number)=>number) => {
    const visibleData = data.filter(d => d.t >= tStart - 2 && d.t <= tEnd + 2);
    if (visibleData.length < 2) return "";
    return visibleData.map(d => `${getX(d.t).toFixed(1)},${yMapper(d[valKey]).toFixed(1)}`).join(" ");
  };
  
  const pointsLevel = makePolylinePoints(history, 'level', getYLevel);
  const pointsTarget = makePolylinePoints(history, 'target', getYLevel);
  const pointsFlowIn = makePolylinePoints(history, 'flowIn', getYFlow);
  const pointsFlowOut = makePolylinePoints(history, 'flowOut', getYFlow);
  
  let pointsPredLevel = "";
  let pointsPredDemand = "";
  
  if (prediction && prediction.length > 0) {
      const combinedPred = [{t: lastPoint.t, level: lastPoint.level, flowOut: lastPoint.flowOut}, ...prediction];
      pointsPredLevel = makePolylinePoints(combinedPred, 'level', getYLevel);
      pointsPredDemand = makePolylinePoints(combinedPred, 'flowOut', getYFlow);
  }

  const xNow = getX(currentTime);
  const validPath = pointsLevel && pointsLevel.length > 10;

  return (
      <div className="w-full h-full bg-slate-950 relative overflow-hidden select-none rounded-lg border border-slate-800" ref={containerRef}>
          {faults.leakage.active && <div className="absolute inset-0 bg-red-900/10 animate-pulse pointer-events-none z-0"></div>}
          {faults.sensorDrift.active && <div className="absolute inset-0 bg-yellow-900/10 animate-pulse pointer-events-none z-0"></div>}

          <svg className="w-full h-full z-10 relative">
               <defs>
                  <linearGradient id="levelGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3"/>
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05"/>
                  </linearGradient>
               </defs>
               
               {/* Future Zone Background */}
               <rect x={xNow} y={mTop} width={Math.max(0, width - mRight - xNow)} height={chartH} fill="#1e293b" opacity="0.3" />
               
               {/* Axes Labels */}
               <text x={mLeft} y={mTop - 15} fontSize="10" fill="#3b82f6" fontWeight="bold">流量 (左轴) m³/s</text>
               <text x={width - mRight} y={mTop - 15} textAnchor="end" fontSize="10" fill="#06b6d4" fontWeight="bold">水位 (右轴) m</text>

               {/* Grid */}
               {[0, 0.25, 0.5, 0.75, 1].map(p => {
                  const y = mTop + chartH * (1 - p);
                  return (
                    <g key={p}>
                      <line x1={mLeft} y1={y} x2={width - mRight} y2={y} stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />
                      <text x={mLeft - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#3b82f6" className="font-mono">{(p * FLOW_MAX).toFixed(0)}</text>
                      <text x={width - mRight + 5} y={y + 3} textAnchor="start" fontSize="9" fill="#06b6d4" className="font-mono">{(p * LEVEL_MAX).toFixed(0)}</text>
                    </g>
                  )
               })}

               <line x1={xNow} y1={mTop} x2={xNow} y2={height-mBottom} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 2" opacity="0.5"/>
               <text x={xNow} y={height-mBottom+12} textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="bold">当前时刻 (NOW)</text>
               <text x={xNow + 20} y={mTop + 15} fontSize="9" fill="#64748b" fontStyle="italic">未来预测 (MPC)</text>

               {/* Chart Lines */}
               {validPath && <path d={`M${pointsLevel.split(' ')[0].split(',')[0]},${mTop+chartH} ${pointsLevel.replace(/ /g, ' L')} V${mTop+chartH} Z`} fill="url(#levelGradient)" />}
               
               {pointsTarget && <polyline points={pointsTarget} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.7"/>}
               {pointsLevel && <polyline points={pointsLevel} fill="none" stroke="#06b6d4" strokeWidth="2" />}
               
               {/* Prediction Lines */}
               {pointsPredLevel && <polyline points={pointsPredLevel} fill="none" stroke="#ffffff" strokeWidth="2" strokeDasharray="2 2" strokeOpacity="0.8" />}
               {pointsPredDemand && <polyline points={pointsPredDemand} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="2 2" strokeOpacity="0.6" />}
               
               {/* Flow Lines */}
               {pointsFlowOut && <polyline points={pointsFlowOut} fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.8" />}
               {pointsFlowIn && <polyline points={pointsFlowIn} fill="none" stroke="#3b82f6" strokeWidth="1.5" />}

               {/* Borders */}
               <line x1={mLeft} y1={mTop} x2={mLeft} y2={height-mBottom} stroke="#3b82f6" strokeWidth="1"/>
               <line x1={width-mRight} y1={mTop} x2={width-mRight} y2={height-mBottom} stroke="#06b6d4" strokeWidth="1"/>
               <line x1={mLeft} y1={height-mBottom} x2={width-mRight} y2={height-mBottom} stroke="#475569" strokeWidth="1"/>
          </svg>

          <div className="absolute top-8 right-14 bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-lg p-2 shadow-xl z-20 min-w-[130px]">
              <div className="text-[9px] text-slate-500 mb-1 font-bold uppercase tracking-wider border-b border-slate-800 pb-1">实时图例 Legend</div>
              <div className="space-y-1.5 mt-1">
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] text-slate-300">进水流量 (Flow In)</span><div className="w-6 h-0.5 bg-blue-500"></div></div>
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] text-slate-300">用户需求 (Demand)</span><div className="w-6 h-0.5 bg-red-500"></div></div>
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] text-slate-300">实时水位 (Level)</span><div className="w-6 h-0.5 bg-cyan-500"></div></div>
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] text-slate-300">设定目标 (Target)</span><div className="w-6 h-0.5 border-t border-green-500 border-dashed"></div></div>
                {prediction && prediction.length > 0 && (
                    <div className="flex items-center justify-between gap-2"><span className="text-[10px] text-white/80 italic">MPC预测水位</span><div className="w-6 h-0.5 border-t border-white border-dotted"></div></div>
                )}
              </div>
          </div>
      </div>
  );
};


export default function App() {
  // --- STATE ---
  // 1. Design
  const [deployedParadigm, setDeployedParadigm] = useState<DesignParadigm>(PARADIGMS[1]); // Default Improved
  const [activeTab, setActiveTab] = useState<'DESIGN' | 'DISTURBANCE' | 'FAULTS'>('DESIGN');

  // 2. Simulation State
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [history, setHistory] = useState<ChartData[]>([]);
  
  // 3. Disturbance Patterns (Unified Plan Logic)
  const [activeDemandPattern, setActiveDemandPattern] = useState<DisturbanceConfig>({
    type: 'STEP', base: 50, amplitude: 100, frequency: 0.1, active: true
  });
  const [activeSetpointPattern, setActiveSetpointPattern] = useState<DisturbanceConfig>({
    type: 'CONSTANT', base: 295, amplitude: 0, frequency: 0, active: true
  });

  // 4. Draft State (for UI editing)
  const [disturbanceScope, setDisturbanceScope] = useState<'DEMAND' | 'TARGET'>('DEMAND');
  const [draftDisturbance, setDraftDisturbance] = useState<DisturbanceConfig>(activeDemandPattern);
  
  // Sync draft when scope changes
  useEffect(() => {
    if (disturbanceScope === 'DEMAND') setDraftDisturbance(activeDemandPattern);
    else setDraftDisturbance(activeSetpointPattern);
  }, [disturbanceScope]); 

  // 5. Plans Queue
  const [plans, setPlans] = useState<PlanStep[]>([]);
  const [planDelay, setPlanDelay] = useState(10); // Seconds

  // 6. Faults
  const [faults, setFaults] = useState<FaultState>({
    leakage: { active: false, value: 0 },
    pumpEfficiency: { active: false, value: 0 },
    sensorDrift: { active: false, value: 0 }
  });

  // 7. Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showChat, setShowChat] = useState(true);

  // 8. Internal Refs for Simulation
  const pipeBufferRef = useRef<number[]>(new Array(BUFFER_SIZE).fill(0));
  const tankLevelRef = useRef(295);
  const smithStateRef = useRef({ modelLevel: 295, delayedLevel: 295 });
  const integralRef = useRef(0);
  const lastErrorRef = useRef(0);
  const mpcStateRef = useRef({ lastOut: 0 });

  // --- MEMOIZED SIZES ---
  const tankPixelWidth = useMemo(() => {
    return Math.min(160, Math.max(60, deployedParadigm.tankArea / 1.2));
  }, [deployedParadigm]);
  
  // Calculate pipe width to ensure it always connects to the tank
  // Center of Tank X (approx): 700 - 160 (right-40) = 540px
  // Pipe Start X: 240px (left-60)
  // Pipe End Target: 540 - tankPixelWidth/2
  const pipePixelWidth = 300 - (tankPixelWidth / 2);


  // --- HANDLERS ---

  const handleSendMessage = async (text: string, attachments: Attachment[]) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: Sender.User,
      text,
      attachments,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    try {
      // Build current context snapshot
      const lastData = history[history.length - 1] || { level: 0, target: 0, flowIn: 0, flowOut: 0 };
      const systemContext = {
        state: {
          time,
          waterLevel: tankLevelRef.current,
          sensorLevel: lastData.level,
          targetLevel: lastData.target,
          inflowAtPump: lastData.flowIn,
          inflowAtTank: pipeBufferRef.current[0], // Approximated for prompt
          outflow: lastData.flowOut,
          valveOpen: 100
        },
        params: { kp: 1, ki: 0, kd: 0, targetLevel: lastData.target },
        faults,
        paradigm: deployedParadigm
      };

      const stream = streamGeminiResponse(messages, text, attachments, systemContext);
      let fullResponse = '';
      const modelMsgId = (Date.now() + 1).toString();
      
      setMessages(prev => [...prev, {
        id: modelMsgId,
        sender: Sender.Model,
        text: '',
        timestamp: new Date()
      }]);

      for await (const chunk of stream) {
        fullResponse += chunk;
        setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, text: fullResponse } : m));
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: Sender.System,
        text: "系统错误：AI 服务暂时不可用",
        timestamp: new Date(),
        isError: true
      }]);
    } finally {
      setIsStreaming(false);
    }
  };

  const executePlan = (plan: PlanStep) => {
    if (plan.actionType === 'CHANGE_DISTURBANCE') {
      setActiveDemandPattern(plan.payload as DisturbanceConfig);
      handleSendMessage("注意：系统已自动切换用户用水（负载）模式，请评估影响。", []);
    } else {
      setActiveSetpointPattern(plan.payload as DisturbanceConfig);
      handleSendMessage("注意：系统已自动变更控制目标（设定值），请观察响应。", []);
    }
  };

  const addPlan = () => {
    const newPlan: PlanStep = {
      id: Date.now().toString(),
      triggerTime: time + planDelay,
      description: `${planDelay}秒后切换${disturbanceScope === 'DEMAND' ? '负载' : '设定值'}模式`,
      actionType: disturbanceScope === 'DEMAND' ? 'CHANGE_DISTURBANCE' : 'CHANGE_SETPOINT',
      payload: { ...draftDisturbance },
      status: 'pending'
    };
    setPlans(prev => [...prev, newPlan].sort((a, b) => a.triggerTime - b.triggerTime));
  };

  const executeImmediate = () => {
    if (disturbanceScope === 'DEMAND') {
      setActiveDemandPattern({ ...draftDisturbance });
      handleSendMessage("操作记录：用户手动切换了负载模式。", []);
    } else {
      setActiveSetpointPattern({ ...draftDisturbance });
      handleSendMessage("操作记录：用户手动更改了设定值目标。", []);
    }
  };

  const deployParadigm = (p: DesignParadigm) => {
    setDeployedParadigm(p);
    // Reset Sim a bit to avoid instability
    integralRef.current = 0;
    lastErrorRef.current = 0;
    handleSendMessage(`设计变更：已部署【${p.name}】。控制算法切换为 ${p.algorithm}，调蓄池面积调整为 ${p.tankArea} m²。`, []);
  };

  // --- SIMULATION ENGINE ---
  
  // 1. Physics
  const updatePhysics = (pumpInflow: number, demandOutflow: number) => {
    // Pipe Delay
    const buffer = pipeBufferRef.current;
    const tankInflow = buffer.shift() || 0;
    buffer.push(pumpInflow);

    // Tank Level Dynamics (dH/dt = (Qin - Qout) / Area)
    const area = deployedParadigm.tankArea;
    let netFlow = tankInflow - demandOutflow;
    
    // Fault: Leakage (Q = k * sqrt(H))
    if (faults.leakage.active) {
      const leakFlow = (faults.leakage.value / 10) * Math.sqrt(Math.max(0, tankLevelRef.current));
      netFlow -= leakFlow;
    }

    const dLevel = (netFlow * DT) / area;
    tankLevelRef.current = Math.max(0, tankLevelRef.current + dLevel);

    return { tankInflow };
  };

  // 2. Control Algorithms
  const runControl = (target: number, level: number, demand: number): number => {
    const error = target - level;
    let output = 0;

    if (deployedParadigm.algorithm === 'PID') {
      // Standard PID
      integralRef.current += error * DT;
      // Anti-windup
      if (Math.abs(integralRef.current) > 500) integralRef.current = Math.sign(integralRef.current) * 500;
      const derivative = (error - lastErrorRef.current) / DT;
      
      // Aggressive PID for huge tank, conservative for small
      const Kp = deployedParadigm.tankArea > 100 ? 5.0 : 2.0;
      const Ki = 0.5;
      const Kd = 0.1;
      
      output = Kp * error + Ki * integralRef.current + Kd * derivative;
      output += 50; // Feedforward bias

    } else if (deployedParadigm.algorithm === 'SMITH') {
      // Smith Predictor
      // Internal Model (No Delay)
      const modelArea = deployedParadigm.tankArea;
      const dModel = ((mpcStateRef.current.lastOut - demand) * DT) / modelArea;
      smithStateRef.current.modelLevel += dModel;
      
      // Delayed Model (Approx)
      // In real smith we would buffer the model output too, here simplified
      const predError = target - smithStateRef.current.modelLevel;
      const mismatch = level - smithStateRef.current.modelLevel; // Should be close to 0 if model perfect
      
      const Kp = 4.0; const Ki = 0.8;
      output = Kp * (predError - mismatch) + 50; 
      
    } else if (deployedParadigm.algorithm === 'MPC') {
      // Simplified MPC (DMC-like)
      // Predict future level based on known pipe buffer
      const predictionHorizon = 50; // 5 seconds
      let predictedLevel = level;
      const buffer = [...pipeBufferRef.current];
      
      // Quick lookahead simulation
      for(let i=0; i<predictionHorizon; i++) {
        const futureIn = i < buffer.length ? buffer[i] : output; // future inputs unknown, assume hold
        // We also need to know future demand. The MPC "knows" the pattern if integrated.
        const futureT = time + i * DT;
        const futureDemand = getDisturbanceValue(futureT, activeDemandPattern);
        predictedLevel += ((futureIn - futureDemand) * DT) / deployedParadigm.tankArea;
      }
      
      const futureError = target - predictedLevel;
      // Aggressive gain for MPC
      output = mpcStateRef.current.lastOut + futureError * 2.0; 
    }

    lastErrorRef.current = error;
    
    // Pump limits & Faults
    let maxFlow = 250;
    if (faults.pumpEfficiency.active) {
      maxFlow *= (1 - faults.pumpEfficiency.value / 100);
    }
    
    output = Math.max(0, Math.min(maxFlow, output));
    mpcStateRef.current.lastOut = output;
    return output;
  };

  // Main Loop
  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      setTime(t => {
        const nextT = t + DT;

        // 1. Check Plans
        plans.forEach(plan => {
          if (plan.status === 'pending' && nextT >= plan.triggerTime) {
            plan.status = 'completed';
            executePlan(plan);
          }
        });

        // 2. Calculate Dynamics
        const currentDemand = getDisturbanceValue(nextT, activeDemandPattern);
        const currentTarget = getDisturbanceValue(nextT, activeSetpointPattern);

        // 3. Sensors (with fault)
        let sensedLevel = tankLevelRef.current;
        if (faults.sensorDrift.active) {
          sensedLevel += faults.sensorDrift.value;
        }
        // Add noise
        sensedLevel += (Math.random() - 0.5) * 0.1;

        // 4. Controller
        const pumpOutput = runControl(currentTarget, sensedLevel, currentDemand);

        // 5. Physics Update
        updatePhysics(pumpOutput, currentDemand);

        // 6. Record History
        setHistory(prev => {
          const newData = [...prev, {
            t: nextT,
            level: tankLevelRef.current,
            target: currentTarget,
            flowIn: pumpOutput,
            flowOut: currentDemand
          }];
          if (newData.length > MAX_HISTORY * 1.5) return newData.slice(-MAX_HISTORY);
          return newData;
        });

        return nextT;
      });
    }, DT * 1000);

    return () => clearInterval(interval);
  }, [isRunning, activeDemandPattern, activeSetpointPattern, faults, deployedParadigm, plans]);

  // --- COMPUTED MPC PREDICTION ---
  const mpcPrediction = useMemo(() => {
      if (deployedParadigm.algorithm !== 'MPC') return [];
      
      const pred = [];
      let simLevel = tankLevelRef.current;
      const horizon = 50; // 5s
      const buffer = [...pipeBufferRef.current];
      
      for(let i=0; i<horizon; i++) {
          const simT = time + i * DT;
          const futureIn = i < buffer.length ? buffer[i] : mpcStateRef.current.lastOut;
          const futureOut = getDisturbanceValue(simT, activeDemandPattern);
          
          simLevel += ((futureIn - futureOut) * DT) / deployedParadigm.tankArea;
          pred.push({ t: simT, level: simLevel, flowOut: futureOut });
      }
      return pred;
  }, [time, deployedParadigm, activeDemandPattern]);


  // --- RENDER ---
  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      {/* === LEFT SIDEBAR: CONTROL === */}
      <div className="w-80 flex flex-col border-r border-slate-800 bg-slate-900/50">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Activity className="text-white" size={18} />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 text-sm tracking-wide">长距离输水仿真平台</h1>
            <div className="text-[10px] text-slate-500 flex items-center gap-1">
               <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
               v12.0 Pro | {deployedParadigm.algorithm}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900">
          <button 
             onClick={() => setActiveTab('DESIGN')}
             className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-1 border-b-2 transition-colors ${activeTab === 'DESIGN' ? 'border-purple-500 text-purple-400 bg-slate-800' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            <PenTool size={14} /> 设计
          </button>
          <button 
             onClick={() => setActiveTab('DISTURBANCE')}
             className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-1 border-b-2 transition-colors ${activeTab === 'DISTURBANCE' ? 'border-blue-500 text-blue-400 bg-slate-800' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            <Sliders size={14} /> 扰动
          </button>
          <button 
             onClick={() => setActiveTab('FAULTS')}
             className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-1 border-b-2 transition-colors ${activeTab === 'FAULTS' ? 'border-red-500 text-red-400 bg-slate-800' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            <AlertTriangle size={14} /> 故障
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          
          {/* === TAB 1: DESIGN STUDIO === */}
          {activeTab === 'DESIGN' && (
             <div className="space-y-4">
                <div className="bg-purple-900/10 border border-purple-900/30 p-3 rounded text-[10px] text-purple-300 flex gap-2 mb-2">
                  <PenTool size={16} className="shrink-0"/>
                  选择设计范式以重新定义水利基础设施与控制算法的组合。
                </div>
                {PARADIGMS.map(p => (
                  <div key={p.type} className={`p-3 rounded-xl border transition-all ${deployedParadigm.type === p.type ? 'bg-slate-800 border-purple-500 shadow-lg shadow-purple-900/20' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}>
                     <div className="flex justify-between items-start mb-2">
                        <h3 className={`text-sm font-bold ${deployedParadigm.type === p.type ? 'text-purple-400' : 'text-slate-300'}`}>{p.name}</h3>
                        {deployedParadigm.type === p.type && <div className="bg-purple-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">运行中</div>}
                     </div>
                     <p className="text-[10px] text-slate-400 mb-3 leading-relaxed whitespace-pre-wrap">{p.description}</p>
                     
                     <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-slate-950 border border-slate-700 p-2 rounded text-center">
                           <div className="text-[10px] text-slate-400 flex justify-center items-center gap-1 mb-1">
                              <Coins size={12}/> <span className="text-[8px] uppercase">基建</span>
                           </div>
                           <div className="text-xs text-white font-mono font-bold">{p.infrastructureCost}</div>
                        </div>
                        <div className="bg-slate-950 border border-slate-700 p-2 rounded text-center">
                           <div className="text-[10px] text-slate-400 flex justify-center items-center gap-1 mb-1">
                              <Cpu size={12}/> <span className="text-[8px] uppercase">算力</span>
                           </div>
                           <div className="text-xs text-white font-mono font-bold">{p.computeCost}</div>
                        </div>
                        <div className="bg-slate-950 border border-slate-700 p-2 rounded text-center">
                           <div className="text-[10px] text-slate-400 flex justify-center items-center gap-1 mb-1">
                              <Box size={12}/> <span className="text-[8px] uppercase">占地</span>
                           </div>
                           <div className="text-xs text-white font-mono font-bold">{p.tankArea}m²</div>
                        </div>
                     </div>

                     <button 
                       onClick={() => deployParadigm(p)}
                       disabled={deployedParadigm.type === p.type}
                       className={`w-full py-1.5 rounded text-xs font-medium transition-colors ${
                         deployedParadigm.type === p.type 
                         ? 'bg-slate-700 text-slate-500 cursor-default' 
                         : 'bg-purple-600 hover:bg-purple-500 text-white'
                       }`}
                     >
                       {deployedParadigm.type === p.type ? '已部署' : '部署方案'}
                     </button>
                  </div>
                ))}
             </div>
          )}

          {/* === TAB 2: DISTURBANCE === */}
          {activeTab === 'DISTURBANCE' && (
            <div className="space-y-6">
              {/* 1. Scope Selector */}
              <div>
                 <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block">配置对象 (Scope)</label>
                 <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button 
                      onClick={() => setDisturbanceScope('DEMAND')}
                      className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${disturbanceScope === 'DEMAND' ? 'bg-slate-800 text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      用户用水 (负载)
                    </button>
                    <button 
                      onClick={() => setDisturbanceScope('TARGET')}
                      className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${disturbanceScope === 'TARGET' ? 'bg-slate-800 text-green-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      控制目标 (设定值)
                    </button>
                 </div>
              </div>

              {/* 2. Pattern Config */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-4 shadow-inner">
                 <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">波形生成器</span>
                    <Waves size={14} className="text-slate-600"/>
                 </div>

                 {/* Pattern Select */}
                 <div className="relative">
                    <select 
                      value={draftDisturbance.type}
                      onChange={(e) => setDraftDisturbance({...draftDisturbance, type: e.target.value as DisturbanceType})}
                      className="w-full bg-slate-950 text-xs text-slate-300 border border-slate-700 rounded px-3 py-2 appearance-none focus:border-blue-500 focus:outline-none"
                    >
                      {DISTURBANCE_OPTIONS.map(opt => <option key={opt.type} value={opt.type}>{opt.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-2.5 text-slate-500 pointer-events-none" size={12} />
                 </div>

                 {/* Oscilloscope Preview */}
                 <DisturbancePreview config={draftDisturbance} scope={disturbanceScope} />

                 {/* Sliders */}
                 <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                         <span>基准值 (Base)</span>
                         <span className="font-mono text-slate-300">{draftDisturbance.base} {disturbanceScope === 'DEMAND' ? 'm³/s' : 'm'}</span>
                      </div>
                      <input type="range" min="0" max="350" step="1" 
                        value={draftDisturbance.base} 
                        onChange={(e) => setDraftDisturbance({...draftDisturbance, base: Number(e.target.value)})}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                         <span>幅度 (Amp)</span>
                         <span className="font-mono text-slate-300">±{draftDisturbance.amplitude}</span>
                      </div>
                      <input type="range" min="0" max="150" step="1" 
                        value={draftDisturbance.amplitude} 
                        onChange={(e) => setDraftDisturbance({...draftDisturbance, amplitude: Number(e.target.value)})}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500" 
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                         <span>频率 (Freq)</span>
                         <span className="font-mono text-slate-300">{draftDisturbance.frequency} Hz</span>
                      </div>
                      <input type="range" min="0.01" max="1.0" step="0.01" 
                        value={draftDisturbance.frequency} 
                        onChange={(e) => setDraftDisturbance({...draftDisturbance, frequency: Number(e.target.value)})}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500" 
                      />
                    </div>
                 </div>
              </div>

              {/* 3. Actions */}
              <div className="grid grid-cols-2 gap-3">
                 <button 
                    onClick={executeImmediate}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                 >
                    <Zap size={14} /> 立即执行
                 </button>
                 <button 
                    onClick={addPlan}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-all border border-slate-700 active:scale-95"
                 >
                    <CalendarClock size={14} /> 加入序列
                 </button>
              </div>

              {/* 4. Delay Setting */}
              <div className="flex items-center gap-2 bg-slate-900 p-2 rounded border border-slate-800">
                 <Clock size={14} className="text-slate-500"/>
                 <span className="text-[10px] text-slate-400">计划延迟:</span>
                 <input 
                   type="number" 
                   value={planDelay} 
                   onChange={e => setPlanDelay(Number(e.target.value))} 
                   className="w-12 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-center focus:border-blue-500 outline-none"
                 />
                 <span className="text-[10px] text-slate-500">秒</span>
              </div>

              {/* 5. Plan List */}
              {plans.length > 0 && (
                <div className="mt-4 border-t border-slate-800 pt-4">
                   <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-2">待执行任务队列 ({plans.filter(p=>p.status==='pending').length})</h3>
                   <div className="space-y-2">
                      {plans.filter(p => p.status !== 'completed').map(plan => (
                        <div key={plan.id} className="bg-slate-900 p-2 rounded border border-slate-800 flex items-center gap-3 text-xs relative overflow-hidden">
                           <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
                           <Timer size={14} className="text-blue-400 shrink-0" />
                           <div className="flex-1 min-w-0">
                              <div className="truncate text-slate-300 font-medium">{plan.description}</div>
                              <div className="text-[10px] text-slate-500">T = {plan.triggerTime.toFixed(1)}s ({(plan.triggerTime - time).toFixed(1)}s 后)</div>
                           </div>
                           <button onClick={() => setPlans(ps => ps.filter(p => p.id !== plan.id))} className="text-slate-600 hover:text-red-400">
                              <Trash2 size={14} />
                           </button>
                        </div>
                      ))}
                   </div>
                </div>
              )}
            </div>
          )}
          
          {/* === TAB 3: FAULTS === */}
          {activeTab === 'FAULTS' && (
            <div className="space-y-6">
               <div className="bg-red-900/10 border border-red-900/30 p-3 rounded text-[10px] text-red-300 flex gap-2">
                  <AlertTriangle size={16} className="shrink-0"/>
                  物理级故障注入将直接影响仿真引擎计算，AI 诊断系统应能检测到异常。
               </div>

               {/* Leakage */}
               <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                     <span className="text-xs font-medium text-slate-300 flex items-center gap-2">
                        <Droplets size={14} className="text-cyan-500"/> 管网泄漏
                     </span>
                     <div onClick={() => setFaults(f => ({...f, leakage: {...f.leakage, active: !f.leakage.active}}))} className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${faults.leakage.active ? 'bg-red-500' : 'bg-slate-700'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${faults.leakage.active ? 'left-4.5' : 'left-0.5'}`}></div>
                     </div>
                  </div>
                  {faults.leakage.active && (
                     <div className="mt-3">
                        <div className="flex justify-between text-[10px] mb-1">
                           <span className="text-slate-500">孔径强度</span>
                           <span className="text-red-400 font-mono">{faults.leakage.value}%</span>
                        </div>
                        <input type="range" max="50" value={faults.leakage.value} onChange={e => setFaults(f => ({...f, leakage: {...f.leakage, value: Number(e.target.value)}}))} className="w-full h-1.5 bg-slate-800 rounded appearance-none accent-red-500"/>
                     </div>
                  )}
               </div>

               {/* Pump Efficiency */}
               <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                     <span className="text-xs font-medium text-slate-300 flex items-center gap-2">
                        <Fan size={14} className="text-orange-500"/> 泵效衰减
                     </span>
                     <div onClick={() => setFaults(f => ({...f, pumpEfficiency: {...f.pumpEfficiency, active: !f.pumpEfficiency.active}}))} className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${faults.pumpEfficiency.active ? 'bg-red-500' : 'bg-slate-700'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${faults.pumpEfficiency.active ? 'left-4.5' : 'left-0.5'}`}></div>
                     </div>
                  </div>
                  {faults.pumpEfficiency.active && (
                     <div className="mt-3">
                        <div className="flex justify-between text-[10px] mb-1">
                           <span className="text-slate-500">磨损程度</span>
                           <span className="text-red-400 font-mono">{faults.pumpEfficiency.value}%</span>
                        </div>
                        <input type="range" max="80" value={faults.pumpEfficiency.value} onChange={e => setFaults(f => ({...f, pumpEfficiency: {...f.pumpEfficiency, value: Number(e.target.value)}}))} className="w-full h-1.5 bg-slate-800 rounded appearance-none accent-orange-500"/>
                     </div>
                  )}
               </div>

               {/* Sensor Drift */}
               <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                     <span className="text-xs font-medium text-slate-300 flex items-center gap-2">
                        <Gauge size={14} className="text-purple-500"/> 传感器漂移
                     </span>
                     <div onClick={() => setFaults(f => ({...f, sensorDrift: {...f.sensorDrift, active: !f.sensorDrift.active}}))} className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${faults.sensorDrift.active ? 'bg-red-500' : 'bg-slate-700'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${faults.sensorDrift.active ? 'left-4.5' : 'left-0.5'}`}></div>
                     </div>
                  </div>
                  {faults.sensorDrift.active && (
                     <div className="mt-3">
                        <div className="flex justify-between text-[10px] mb-1">
                           <span className="text-slate-500">偏移量</span>
                           <span className="text-red-400 font-mono">+{faults.sensorDrift.value}m</span>
                        </div>
                        <input type="range" max="50" value={faults.sensorDrift.value} onChange={e => setFaults(f => ({...f, sensorDrift: {...f.sensorDrift, value: Number(e.target.value)}}))} className="w-full h-1.5 bg-slate-800 rounded appearance-none accent-purple-500"/>
                     </div>
                  )}
               </div>

            </div>
          )}
        </div>
      </div>

      {/* === CENTER: VISUALIZATION === */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
         {/* KPI Header */}
         <div className="h-14 border-b border-slate-800 flex items-center px-6 justify-between bg-slate-900/20">
            <div className="flex gap-8">
               <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase">仿真时间</span>
                  <span className="text-lg font-mono font-bold text-white">{time.toFixed(1)}<span className="text-xs text-slate-500 ml-1">s</span></span>
               </div>
               <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase">控制误差 |e|</span>
                  <span className={`text-lg font-mono font-bold ${Math.abs(tankLevelRef.current - (history[history.length-1]?.target || 0)) > 10 ? 'text-red-500' : 'text-green-500'}`}>
                     {Math.abs(tankLevelRef.current - (history[history.length-1]?.target || 0)).toFixed(2)}<span className="text-xs text-slate-500 ml-1">m</span>
                  </span>
               </div>
               <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase">当前设计范式</span>
                  <span className="text-sm font-bold text-blue-400 border border-blue-900/50 bg-blue-900/20 px-2 py-0.5 rounded mt-0.5">{deployedParadigm.name}</span>
               </div>
            </div>
            
            <div className="flex gap-2">
               <button onClick={() => setIsRunning(!isRunning)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors">
                  {isRunning ? <Pause size={16} /> : <Play size={16} />}
               </button>
               <button onClick={() => {
                 setTime(0); setHistory([]); tankLevelRef.current=295; pipeBufferRef.current.fill(0);
               }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors">
                  <RotateCcw size={16} />
               </button>
            </div>
         </div>

         {/* Schematic Visualization */}
         <div className="h-[280px] border-b border-slate-800 relative bg-slate-900/30 flex items-center justify-center overflow-hidden">
             <div className="relative w-[700px] h-[200px]">
                {/* Source */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
                   <div className="w-16 h-16 rounded-full border-4 border-blue-700 bg-blue-900/50 flex items-center justify-center">
                      <Waves className="text-blue-500 animate-pulse" />
                   </div>
                   <span className="text-[10px] mt-2 text-slate-400">水源 (Source)</span>
                </div>

                {/* Pipe 1 */}
                <div className="absolute left-16 top-1/2 -translate-y-1/2 w-24 h-3 bg-slate-800 overflow-hidden">
                   <div className="h-full bg-blue-500/30 animate-flow-right"></div>
                </div>

                {/* Pump Station */}
                <div className="absolute left-40 top-1/2 -translate-y-1/2 flex flex-col items-center z-10">
                   <div className={`w-20 h-20 bg-slate-800 rounded border-2 ${faults.pumpEfficiency.active ? 'border-orange-500' : 'border-slate-600'} flex items-center justify-center relative shadow-2xl`}>
                      <Fan size={40} className={`text-slate-400 ${isRunning ? 'animate-spin' : ''}`} style={{animationDuration: '1s'}} />
                      {faults.pumpEfficiency.active && <AlertTriangle size={16} className="absolute top-1 right-1 text-orange-500" />}
                      <div className="absolute -bottom-8 bg-slate-900 border border-slate-700 px-2 py-1 rounded text-[10px] font-mono text-blue-400">
                         {(history[history.length-1]?.flowIn || 0).toFixed(1)} m³/s
                      </div>
                   </div>
                   <span className="text-[10px] mt-10 text-slate-400">加压泵站</span>
                </div>

                {/* Long Pipe (Delay) */}
                <div 
                  className="absolute left-60 top-1/2 -translate-y-1/2 h-4 bg-slate-800 rounded relative overflow-hidden border-y border-slate-700 transition-all duration-500"
                  style={{ width: pipePixelWidth + 'px' }}
                >
                   {/* Water segments moving */}
                   <div className="absolute inset-0 flex gap-4 animate-flow-right opacity-50">
                      {Array.from({length: 10}).map((_,i) => <div key={i} className="w-4 h-full bg-blue-500/50 transform -skew-x-12"></div>)}
                   </div>
                   <div className="absolute top-[-15px] w-full text-center text-[9px] text-slate-500">长距离输水滞后 ({PIPE_DELAY_SECONDS}s)</div>
                   {faults.leakage.active && <div className="absolute bottom-[-10px] left-1/2 w-2 h-4 bg-blue-500/50 blur-sm animate-drip"></div>}
                </div>

                {/* Tank */}
                <div className="absolute right-40 top-1/2 -translate-y-1/2 flex flex-col items-center">
                   <div 
                     className="h-40 border-x-2 border-b-2 border-slate-500 bg-slate-900/50 relative rounded-b-lg overflow-hidden backdrop-blur-sm transition-all duration-500" 
                     style={{ width: `${tankPixelWidth}px` }}
                   >
                      <div 
                        className="absolute bottom-0 left-0 right-0 bg-cyan-500/40 transition-all duration-300 ease-linear border-t border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                        style={{ height: `${Math.min(100, (tankLevelRef.current / 350) * 100)}%` }}
                      >
                         <div className="absolute top-0 w-full h-1 bg-white/20 animate-pulse"></div>
                      </div>
                      {/* Setpoint Line */}
                      <div 
                        className="absolute left-0 right-0 border-t-2 border-green-500 border-dashed transition-all duration-300 z-20 opacity-70"
                        style={{ bottom: `${Math.min(100, ((history[history.length-1]?.target || 0) / 350) * 100)}%` }}
                      >
                         <span className="absolute -right-0 -top-3 text-[9px] text-green-500 font-mono">SP</span>
                      </div>
                   </div>
                   <div className="mt-2 flex flex-col items-center">
                      <span className="text-[10px] text-slate-400">高位调节池</span>
                      <span className="font-mono text-sm font-bold text-cyan-400">{tankLevelRef.current.toFixed(1)}m</span>
                   </div>
                </div>

                {/* Outflow Pipe */}
                <div className="absolute right-16 top-[60%] w-24 h-3 bg-slate-800">
                   <div className="h-full bg-blue-500/30 animate-flow-right"></div>
                   <div className="absolute right-0 -bottom-6 text-right w-full">
                      <div className="text-[10px] text-red-400 font-mono font-bold">{(history[history.length-1]?.flowOut || 0).toFixed(1)} m³/s</div>
                      <div className="text-[9px] text-slate-500">用户用水</div>
                   </div>
                </div>
             </div>
         </div>

         {/* Chart Area */}
         <div className="flex-1 min-h-0 relative p-4">
            <div className="absolute inset-0 p-4 pb-2">
               <TrendChart history={history} prediction={mpcPrediction} faults={faults} />
            </div>
         </div>
      </div>

      {/* === RIGHT SIDEBAR: AI DIAGNOSIS === */}
      <div className={`w-96 border-l border-slate-800 flex flex-col bg-slate-900/80 backdrop-blur transition-all duration-300 ${showChat ? 'translate-x-0' : 'translate-x-full hidden'}`}>
         <div className="h-14 border-b border-slate-800 flex items-center px-4 justify-between bg-slate-900">
            <div className="flex items-center gap-2">
               <Sparkles className="text-purple-400" size={16}/>
               <span className="font-bold text-slate-200 text-sm">智能诊断专家 (Gemini)</span>
            </div>
         </div>
         
         <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-950/50">
            {messages.length === 0 && (
               <div className="text-center py-10 opacity-50">
                  <Box size={48} className="mx-auto mb-3 text-slate-600"/>
                  <p className="text-sm text-slate-400">系统运行正常。</p>
                  <p className="text-xs text-slate-600 mt-2">注入扰动或故障以触发 AI 分析...</p>
               </div>
            )}
            {messages.map((msg) => (
               <div key={msg.id} className={`flex gap-3 ${msg.sender === Sender.User ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.sender === Sender.User ? 'bg-blue-600' : msg.sender === Sender.System ? 'bg-red-900/50' : 'bg-purple-600'}`}>
                     {msg.sender === Sender.User ? <MessageSquare size={14}/> : msg.sender === Sender.System ? <AlertOctagon size={14}/> : <Sparkles size={14}/>}
                  </div>
                  <div className={`rounded-lg p-3 text-sm max-w-[85%] ${
                     msg.sender === Sender.User ? 'bg-blue-600 text-white' : 
                     msg.sender === Sender.System ? 'bg-red-900/20 text-red-200 border border-red-800' :
                     'bg-slate-800 text-slate-200 border border-slate-700'
                  }`}>
                     {msg.sender === Sender.Model ? (
                        <MarkdownRenderer content={msg.text} />
                     ) : (
                        <div>{msg.text}</div>
                     )}
                  </div>
               </div>
            ))}
            {isStreaming && (
              <div className="flex gap-3">
                 <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0 animate-pulse">
                    <Sparkles size={14}/>
                 </div>
                 <div className="bg-slate-800 rounded-lg p-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></span>
                 </div>
              </div>
            )}
         </div>
         
         <ChatInput onSend={(text, att) => handleSendMessage(text, att)} disabled={isStreaming} />
      </div>
    </div>
  );
}
