import { IsometricScene } from './renderer/IsometricScene';
import { CinematicBoardDuelSlice } from './renderer/CinematicBoardDuelSlice';
import { CinematicDuelSlice } from './renderer/CinematicDuelSlice';
import { HUD } from './ui/HUD';

export default function App() {
  const cinematicSlice = typeof window !== 'undefined' &&
    (window.location.pathname === '/cinematic-1v1' || window.location.search.includes('slice=cinematic-duel'));
  const boardDuelSlice = typeof window !== 'undefined' &&
    (
      window.location.pathname === '/duel-2-5d' ||
      window.location.pathname === '/cinematic-1v1-25d' ||
      window.location.search.includes('slice=duel-board')
    );

  if (cinematicSlice) {
    return <CinematicDuelSlice />;
  }

  if (boardDuelSlice) {
    return <CinematicBoardDuelSlice />;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0a0f' }}>
      <IsometricScene />
      <HUD />
    </div>
  );
}
