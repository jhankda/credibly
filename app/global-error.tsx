"use client";

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#f9fafb", color: "#111827" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ maxWidth: 420, textAlign: "center", background: "white", border: "1px solid #e5e7eb", borderRadius: 16, padding: 32 }}>
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
              Credibly couldn’t complete that request. Please try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{ border: 0, borderRadius: 8, background: "#111827", color: "white", cursor: "pointer", padding: "10px 16px" }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
