
import { GoogleGenAI, Content, Part } from "@google/genai";
import { Attachment, ChatMessage, Sender, SystemState, ControlParams, FaultState, DesignParadigm } from "../types";

const API_KEY = process.env.API_KEY;
const USE_PYTHON_BACKEND = false; // Set to true if running main.py locally
const BACKEND_URL = 'http://localhost:8000/api/chat';

if (!API_KEY && !USE_PYTHON_BACKEND) {
  console.warn("Missing API_KEY in environment variables.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY || 'dummy' });
const MODEL_NAME = "gemini-2.5-flash";

const formatHistory = (messages: ChatMessage[]): Content[] => {
  return messages
    .filter(msg => msg.sender !== Sender.System)
    .map(msg => {
      const parts: Part[] = [];
      if (msg.text) parts.push({ text: msg.text });
      if (msg.attachments) {
        msg.attachments.forEach(att => {
          parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
        });
      }
      return {
        role: msg.sender === Sender.User ? 'user' : 'model',
        parts: parts
      };
    });
};

export const streamGeminiResponse = async function* (
  history: ChatMessage[],
  newMessage: string,
  attachments: Attachment[],
  systemContext: { state: SystemState, params: ControlParams, faults: FaultState, paradigm: DesignParadigm }
) {
  // Telemetry Context Construction
  const telemetryContext = `
    [系统实时遥测 - 长距离输水模型]
    仿真时间: ${systemContext.state.time.toFixed(1)}s
    
    [设计范式: ${systemContext.paradigm.name}]
    类型: ${systemContext.paradigm.type}
    调蓄池物理面积: ${systemContext.paradigm.tankArea} m²
    控制算法: ${systemContext.paradigm.algorithm}
    
    [核心状态]
    设定值 (SP): ${systemContext.state.targetLevel.toFixed(2)}m
    反馈值 (PV): ${systemContext.state.sensorLevel.toFixed(2)}m
    真实水位: ${systemContext.state.waterLevel.toFixed(2)}m
    误差 (e): ${(systemContext.state.targetLevel - systemContext.state.sensorLevel).toFixed(2)}m
    
    [流量平衡]
    泵站输出: ${systemContext.state.inflowAtPump.toFixed(2)} m3/s
    池入口流量(滞后): ${systemContext.state.inflowAtTank.toFixed(2)} m3/s
    用户需求(扰动): ${systemContext.state.outflow.toFixed(2)} m3/s
    
    [故障状态]
    泄漏: ${systemContext.faults.leakage ? 'YES' : 'NO'}
    泵效率: ${systemContext.faults.pumpEfficiency ? 'LOW' : 'NORMAL'}
    传感器: ${systemContext.faults.sensorDrift ? 'DRIFTING' : 'NORMAL'}
  `;

  // Option A: Python Backend (Future Proofing)
  if (USE_PYTHON_BACKEND) {
    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: history.map(m => ({ 
            role: m.sender === Sender.User ? 'user' : 'model', 
            text: m.text, 
            attachments: m.attachments || [] 
          })),
          message: newMessage,
          attachments: attachments,
          context: { telemetry: telemetryContext }
        })
      });
      const data = await response.json();
      yield data.text;
      return;
    } catch (e) {
      console.error("Backend connection failed, falling back to client-side SDK", e);
    }
  }

  // Option B: Client-side SDK (Default for Demo)
  if (!API_KEY) {
    yield "错误：未检测到 API Key。请检查环境变量配置或启动 Python 后端。";
    return;
  }

  const previousHistory = formatHistory(history);
  const chat = ai.chats.create({
    model: MODEL_NAME,
    history: previousHistory,
    config: {
      temperature: 0.3,
      systemInstruction: `你是由 Google Gemini 驱动的工业控制系统专家 (ICS Expert)。

      当前系统正运行在【${systemContext.paradigm.name}】范式下。
      
      设计背景：
      1. 传统范式 (PID)：依赖巨大的调蓄池 (${systemContext.paradigm.tankArea}m²) 来缓冲波动。如果水位波动大，说明 PID 参数不佳。
      2. 改良范式 (Smith)：使用中型调蓄池。Smith 预估器应该能消除滞后带来的震荡。
      3. 现代范式 (MPC)：使用极小的调蓄池 (${systemContext.paradigm.tankArea}m²)。依靠高频预测控制来维持平衡。如果在此模式下出现溢流或抽空，说明 MPC 预测时域不足或模型失配。

      请结合当前的【设计范式】和【实时数据】进行诊断。
      `
    }
  });

  const currentParts: Part[] = [];
  currentParts.push({ text: `${telemetryContext}\n\n用户: ${newMessage}` });
  attachments.forEach(att => {
    currentParts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
  });

  const result = await chat.sendMessageStream({ 
    message: currentParts.length === 1 && currentParts[0].text ? currentParts[0].text : currentParts 
  });

  for await (const chunk of result) {
    yield chunk.text;
  }
};
