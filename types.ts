export interface Bias {
  id: number;
  name: string;
  description: string;
  example: string;
}

export interface Evidence {
  brand: string;
  notes?: string;
  imageUrl: string;
  timestamp: number;
}

export type GameStatus = 'start' | 'playing' | 'finished';

export interface PlayerScore {
  name: string;
  startup: string;
  score: number;
  time: number; // in seconds
}

export interface GameState {
  status: GameStatus;
  playerName: string;
  startupName: string;
  startTime: number | null;
  foundEvidence: Record<number, Evidence>;
}
