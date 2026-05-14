import { IsometricScene } from './renderer/IsometricScene';
import { CinematicDuelSlice } from './renderer/CinematicDuelSlice';
import { HUD } from './ui/HUD';

export default function App() {
  const cinematicSlice = typeof window !== 'undefined' &&
    (window.location.pathname === '/cinematic-1v1' || window.location.search.includes('slice=cinematic-duel'));

  if (cinematicSlice) {
    return <CinematicDuelSlice />;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0a0f' }}>
      <IsometricScene />
      <HUD />
    </div>
  );
}
