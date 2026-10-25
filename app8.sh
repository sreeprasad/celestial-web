mkdir -p app/verify
cat > app/verify/page.tsx <<'EOF'
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BODY_ORDER } from '@/lib/ephemeris';

interface BodyVerifyMetrics {
  max_km: number;
  median_km: number;
  mean_km: number;
  max_relative: number;
  pass: boolean;
  missing: boolean;
}

interface VerifyReport {
  pass_threshold_km: number;
  bodies: Record<string, BodyVerifyMetrics>;
}

export default function VerifyPage() {
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/verify.json')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch /verify.json (${res.status})`);
        }
        return res.json();
      })
      .then((data: VerifyReport) => {
        if (cancelled) return;
        setReport(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const bodyNames = React.useMemo(() => {
    if (!report?.bodies) return [];
    const known = BODY_ORDER.filter((b) => b in report.bodies);
    const extras = Object.keys(report.bodies).filter(
      (k) => !BODY_ORDER.includes(k as (typeof BODY_ORDER)[number])
    );
    return [...known, ...extras];
  }, [report]);

  const allPass =
    report !== null &&
    bodyNames.length > 0 &&
    bodyNames.every((b) => report.bodies[b]?.pass && !report.bodies[b]?.missing);

  const formatNum = (val: number | undefined, digits = 6): string => {
    if (val === undefined || val === null || Number.isNaN(val)) return '—';
    if (val === 0) return '0';
    if (Math.abs(val) < 1e-4 || Math.abs(val) >= 1e6) {
      return val.toExponential(3);
    }
    return val.toFixed(digits);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0d1117',
        color: '#c9d1d9',
        padding: '40px 24px',
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 24,
                color: '#f0f6fc',
                fontWeight: 600,
              }}
            >
              Ephemeris Verification Report
            </h1>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 14,
                color: '#8b949e',
              }}
            >
              TypeScript port vs. Celestia C++ reference orbital positions
            </p>
          </div>

          <Link
            href="/"
            style={{
              background: '#21262d',
              border: '1px solid #30363d',
              color: '#58a6ff',
              padding: '8px 16px',
              borderRadius: 6,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            &larr; Back to 3D Solar System
          </Link>
        </div>

        {loading && (
          <div
            style={{
              padding: 32,
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 8,
              textAlign: 'center',
            }}
          >
            Loading /verify.json...
          </div>
        )}

        {error && (
          <div
            style={{
              padding: 20,
              background: 'rgba(248, 81, 73, 0.15)',
              border: '1px solid #f85149',
              color: '#ff7b72',
              borderRadius: 8,
            }}
          >
            Error loading verification data: {error}
          </div>
        )}

        {report && (
          <>
            {/* Summary Banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                marginBottom: 20,
                borderRadius: 8,
                background: allPass
                  ? 'rgba(46, 160, 67, 0.15)'
                  : 'rgba(248, 81, 73, 0.15)',
                border: allPass
                  ? '1px solid rgba(46, 160, 67, 0.4)'
                  : '1px solid rgba(248, 81, 73, 0.4)',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 15, color: '#f0f6fc' }}>
                Overall Status:{' '}
                <span style={{ color: allPass ? '#3fb950' : '#f85149' }}>
                  {allPass ? 'ALL BODIES PASSED' : 'FAILURES DETECTED'}
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#8b949e' }}>
                Pass Threshold:{' '}
                <strong style={{ color: '#e6edf3' }}>
                  {report.pass_threshold_km} km
                </strong>
              </div>
            </div>

            {/* Results Table */}
            <div
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: 8,
                overflowX: 'auto',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 14,
                  textAlign: 'left',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid #30363d',
                      background: '#0d1117',
                      color: '#8b949e',
                      fontSize: 12,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    <th style={{ padding: '12px 16px' }}>Body</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>
                      Max Error (km)
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>
                      Median Error (km)
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>
                      Mean Error (km)
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>
                      Max Relative
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bodyNames.map((name) => {
                    const row = report.bodies[name];
                    const passed = row && row.pass && !row.missing;
                    return (
                      <tr
                        key={name}
                        style={{
                          borderBottom: '1px solid #21262d',
                        }}
                      >
                        <td
                          style={{
                            padding: '12px 16px',
                            fontWeight: 600,
                            color: '#f0f6fc',
                          }}
                        >
                          {name}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 10px',
                              borderRadius: 12,
                              fontSize: 12,
                              fontWeight: 600,
                              background: passed
                                ? 'rgba(46, 160, 67, 0.2)'
                                : 'rgba(248, 81, 73, 0.2)',
                              color: passed ? '#3fb950' : '#f85149',
                              border: passed
                                ? '1px solid rgba(46, 160, 67, 0.4)'
                                : '1px solid rgba(248, 81, 73, 0.4)',
                            }}
                          >
                            {row?.missing
                              ? 'MISSING'
                              : passed
                              ? 'PASS'
                              : 'FAIL'}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            textAlign: 'right',
                            fontFamily: 'monospace',
                          }}
                        >
                          {formatNum(row?.max_km)}
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            textAlign: 'right',
                            fontFamily: 'monospace',
                          }}
                        >
                          {formatNum(row?.median_km)}
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            textAlign: 'right',
                            fontFamily: 'monospace',
                          }}
                        >
                          {formatNum(row?.mean_km)}
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            textAlign: 'right',
                            fontFamily: 'monospace',
                          }}
                        >
                          {formatNum(row?.max_relative)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
EOF
