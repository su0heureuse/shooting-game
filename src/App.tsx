import { useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameMode } from './types/game';

export default function App() {
  const [mode, setMode] = useState<GameMode>('classic');

  return (
    <main className="w-full min-h-screen bg-[#080a12] text-slate-100 flex flex-col items-center justify-center">
      <GameCanvas mode={mode} onModeChange={setMode} />
    </main>
  );
}
