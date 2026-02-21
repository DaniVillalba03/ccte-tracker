import { Wifi, Radio } from 'lucide-react';
import { PacketType } from '../../utils/dataParsing';
import './LinkStatusBadge.css';

interface LinkStatusBadgeProps {
  activeLink: PacketType;
  isActive: boolean;
}

export function LinkStatusBadge({ activeLink, isActive }: LinkStatusBadgeProps) {
  if (!isActive) return null;

  const isHighSpeed = activeLink === 'F';
  const statusClass = isHighSpeed ? 'link-badge-highspeed' : 'link-badge-backup';
  const statusText = isHighSpeed ? 'HIGH-SPEED' : 'LORA BACKUP';
  const Icon = isHighSpeed ? Wifi : Radio;

  return (
    <div className={`link-status-badge ${statusClass}`}>
      <Icon className="link-icon" />
      <div className="link-details">
        <span className="link-label">LINK:</span>
        <span className="link-value">{statusText}</span>
      </div>
      <div className="link-pulse" />
    </div>
  );
}
