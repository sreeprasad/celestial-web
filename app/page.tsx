import React, { Suspense } from 'react';
import SolarSystemView from './SolarSystemView';

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            width: '100vw',
            height: '100vh',
            backgroundColor: '#000',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Loading Solar System...
        </div>
      }
    >
      <SolarSystemView />
    </Suspense>
  );
}
