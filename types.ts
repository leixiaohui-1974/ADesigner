
export enum Sender {
  User = 'user',
  Model = 'model',
  System = 'system'
}

export interface Attachment {
  mimeType: string;
  data: string; // Base64 string
  fileName?: string;
}

export interface ChatMessage {
  id: string;
  sender: Sender;
  text: string;
  attachments?: Attachment[];
  timestamp: Date;
  isError?: boolean;
}

// Control Algorithms
export type ControlAlgorithm = 'PID' | 'SMITH' | 'MPC';

// Design Paradigms
export type ParadigmType = 'TRADITIONAL' | 'IMPROVED' | 'MODERN';

export interface DesignParadigm {
  type: ParadigmType;
  name: string;
  description: string;
  tankArea: number; // Physical infrastructure size (m2)
  algorithm: ControlAlgorithm; // Associated control strategy
  infrastructureCost: string; // '$$$'
  computeCost: string; // '$'
  resilience: string; // Description
}

// Simulation Types
export interface SystemState {
  time: number;
  waterLevel: number;    // Real physical level (m) - PV
  sensorLevel: number;   // Level read by sensor (may have drift)
  targetLevel: number;   // Desired level (m) - SP
  
  inflowAtPump: number;  // Flow leaving the pump (m3/s)
  inflowAtTank: number;  // Flow arriving at tank (delayed) (m3/s)
  
  outflow: number;       // Demand flow (m3/s) - Disturbance
  valveOpen: number;     // 0-100%
}

export interface ControlParams {
  kp: number;
  ki: number;
  kd: number;
  targetLevel: number;
}

export interface FaultConfig {
  active: boolean;
  value: number; // Intensity: 0-100 or specific unit
}

export interface FaultState {
  leakage: FaultConfig;      // Pipe leakage coefficient
  pumpEfficiency: FaultConfig; // Efficiency drop %
  sensorDrift: FaultConfig;  // Drift amount (m)
}

export type DisturbanceType = 
  'CONSTANT' | 'STEP' | 'RAMP' | 'SINE' | 'SQUARE' | 
  'TRIANGLE' | 'SAWTOOTH' | 'PULSE' | 'NOISE' | 
  'RANDOM_WALK' | 'BURST';

export interface DisturbanceConfig {
  type: DisturbanceType; 
  base: number; 
  amplitude: number; 
  frequency: number;
  active: boolean;
}

export interface PlanStep {
  id: string;
  triggerTime: number;
  description: string;
  // A plan can either change the disturbance pattern OR the target setpoint
  actionType: 'CHANGE_DISTURBANCE' | 'CHANGE_SETPOINT';
  // If disturbance, we store the full config. If setpoint, we store the number.
  payload: DisturbanceConfig | number; 
  status: 'pending' | 'active' | 'completed';
}
