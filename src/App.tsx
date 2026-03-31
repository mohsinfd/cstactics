import { IsometricScene } from './renderer/IsometricScene';
import { HUD } from './ui/HUD';

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0a0f' }}>
      <IsometricScene />
      <HUD />
    </div>
  );
}
