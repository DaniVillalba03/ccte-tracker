import { Radio, Satellite } from 'lucide-react';
import './DualLinkPanel.css';

interface DualLinkPanelProps {
  isHighSpeedActive: boolean;
  isLoraActive: boolean;
  isSystemActive: boolean; // Si está conectado o simulando
}

export function DualLinkPanel({ 
  isHighSpeedActive, 
  isLoraActive, 
  isSystemActive 
}: DualLinkPanelProps) {
  return (
    <div className="dual-link-panel">
      {/* Módulo 1: High-Speed Link */}
      <div className={`link-module ${isSystemActive && isHighSpeedActive ? 'active' : 'offline'}`}>
        <Radio className="link-icon" />
        <div className="link-info">
          <span className="link-label">HIGH-SPEED</span>
          <span className="link-status">
            {!isSystemActive 
              ? 'STANDBY' 
              : isHighSpeedActive 
                ? 'ONLINE' 
                : 'SIGNAL LOST'}
          </span>
        </div>
        <div className={`heartbeat-led ${isSystemActive && isHighSpeedActive ? 'beating' : ''}`} />
      </div>

      {/* Módulo 2: LoRa Backup Link */}
      <div className={`link-module ${isSystemActive && isLoraActive ? 'active' : 'offline'}`}>
        <Satellite className="link-icon" />
        <div className="link-info">
          <span className="link-label">LoRa BACKUP</span>
          <span className="link-status">
            {!isSystemActive 
              ? 'STANDBY' 
              : isLoraActive 
                ? 'ONLINE' 
                : 'SIGNAL LOST'}
          </span>
        </div>
        <div className={`heartbeat-led ${isSystemActive && isLoraActive ? 'beating' : ''}`} />
      </div>
    </div>
  );
}
