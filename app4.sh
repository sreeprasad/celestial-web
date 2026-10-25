mkdir -p app
cat > app/layout.tsx <<'EOF'
import React from 'react';

export const metadata = {
  title: 'Celestia Web - Solar System Ephemeris',
  description: '3D Solar System visualization using VSOP87 and Celestia ephemeris',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: '#000000',
          color: '#ffffff',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {children}
      </body>
    </html>
  );
}
EOF
