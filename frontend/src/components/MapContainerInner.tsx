import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapContainerInnerProps {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  onPositionChange: (newLat: number, newLng: number, source: 'map') => void;
  height?: string;
  zoom?: number;
  interactive?: boolean;
}

// Controller to smoothly pan/fly when coordinates change from search/GPS
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  React.useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 1.2 });
    }
  }, [lat, lng, map]);
  return null;
}

// Map event listener for clicks
function MapClickHandler({ onPositionChange }: { onPositionChange: (lat: number, lng: number, source: 'map') => void }) {
  useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng, 'map');
    },
  });
  return null;
}

// Custom modern SVG Pin using L.divIcon to avoid Leaflet default image bundling issues
function createPinIcon() {
  return L.divIcon({
    className: 'agri-custom-pin',
    html: `
      <div style="
        position: relative;
        width: 38px;
        height: 38px;
        transform: translate(-19px, -36px);
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35));
        cursor: grab;
      ">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C7.58 2 4 5.58 4 10C4 15.25 12 22 12 22C12 22 20 15.25 20 10C20 5.58 16.42 2 12 2Z" fill="#047857" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="12" cy="10" r="3" fill="#ffffff"/>
        </svg>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 36],
  });
}

export const MapContainerInner: React.FC<MapContainerInnerProps> = ({
  lat,
  lng,
  accuracyM,
  onPositionChange,
  height = '280px',
  zoom = 15,
  interactive = true,
}) => {
  const pinIcon = useMemo(() => createPinIcon(), []);

  const eventHandlers = useMemo(
    () => ({
      dragend(e: any) {
        const marker = e.target;
        if (marker) {
          const position = marker.getLatLng();
          onPositionChange(position.lat, position.lng, 'map');
        }
      },
    }),
    [onPositionChange]
  );

  return (
    <div style={{ height, width: '100%', borderRadius: '1rem', overflow: 'hidden', position: 'relative' }}>
      <MapContainer
        center={[lat, lng]}
        zoom={zoom}
        scrollWheelZoom={interactive}
        dragging={interactive}
        touchZoom={interactive}
        doubleClickZoom={interactive}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <RecenterMap lat={lat} lng={lng} />
        {interactive && <MapClickHandler onPositionChange={onPositionChange} />}

        {accuracyM && accuracyM > 0 && (
          <Circle
            center={[lat, lng]}
            radius={accuracyM}
            pathOptions={{
              color: accuracyM > 100 ? '#f59e0b' : '#059669',
              fillColor: accuracyM > 100 ? '#fef3c7' : '#d1fae5',
              fillOpacity: 0.35,
              weight: 1.5,
              dashArray: accuracyM > 100 ? '4, 4' : undefined,
            }}
          />
        )}

        <Marker
          position={[lat, lng]}
          icon={pinIcon}
          draggable={interactive}
          eventHandlers={interactive ? eventHandlers : undefined}
        />
      </MapContainer>
    </div>
  );
};

export default MapContainerInner;
